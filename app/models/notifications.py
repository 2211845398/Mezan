"""SQLAlchemy ORM models for push notifications (Epic 13).

Design notes
------------
- ``DeviceToken`` stores a per-user, per-platform registration token received from a
  push provider SDK (FCM / APNs / Web Push). Tokens are append-only: a new login
  creates a new row; logout revokes the row; provider-reported invalid tokens are
  also revoked. Unique on token.
- ``NotificationTemplate`` captures the rendering contract (title, body, data) for
  a single notification *kind* (e.g. ``low_stock``, ``expiring_inventory``). Kept
  in the DB so ops can tweak copy without a deploy.
- ``NotificationSchedule`` defines recurring execution of a generator (a plain
  Python function registered in code by ``kind``). Execution is performed by
  ``notification_service.run_due_schedules`` every tick of the scheduler loop.
- ``NotificationRun`` records a single execution of a schedule: when it ran, how
  many deliveries it produced, and any error string.
- ``NotificationDelivery`` is the per-recipient dispatch record. Idempotency is
  enforced by ``(schedule_id, idempotency_key)`` so a given alert for a given
  recipient in a given window never fires twice.

No Firestore and no Firebase Auth are used. We only speak to FCM's HTTP v1 push
endpoint via the pluggable provider interface.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class DevicePlatform(PyEnum):
    WEB = "web"
    ANDROID = "android"
    IOS = "ios"


class NotificationStatus(PyEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


class NotificationRunStatus(PyEnum):
    STARTED = "started"
    COMPLETED = "completed"
    FAILED = "failed"


class DeviceToken(Base):
    """A push registration token owned by a user.

    One user may own many tokens (multiple devices / browsers). Revoked tokens are
    kept for audit; active lookup filters by ``revoked_at IS NULL``.
    """

    __tablename__ = "device_tokens"
    __table_args__ = (UniqueConstraint("token", name="uq_device_tokens_token"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform: Mapped[DevicePlatform] = mapped_column(
        String(16),
        nullable=False,
    )
    token: Mapped[str] = mapped_column(String(512), nullable=False)
    device_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    app_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )


class NotificationTemplate(Base):
    """DB-backed rendering contract for a notification kind.

    ``kind`` is a stable identifier matching a registered generator in
    ``app.services.notifications.generators``. ``title_template`` and
    ``body_template`` are plain strings with ``{placeholders}`` substituted at
    dispatch time via ``str.format`` against the generator's payload.
    """

    __tablename__ = "notification_templates"
    __table_args__ = (UniqueConstraint("kind", name="uq_notification_templates_kind"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    title_template: Mapped[str] = mapped_column(String(255), nullable=False)
    body_template: Mapped[str] = mapped_column(Text, nullable=False)
    default_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class NotificationSchedule(Base):
    """Recurring schedule for a notification generator.

    Execution semantics: the scheduler loop ticks every minute. A schedule runs
    when ``now - last_run_at >= interval_minutes`` (or has never run). Each run
    calls the registered generator by ``kind`` which returns ``(recipients,
    context)`` tuples and produces ``NotificationDelivery`` rows.
    """

    __tablename__ = "notification_schedules"
    __table_args__ = (UniqueConstraint("name", name="uq_notification_schedules_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    interval_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    target_role_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    branch_id: Mapped[int | None] = mapped_column(
        ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    parameters: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class NotificationRun(Base):
    """A single execution record for a schedule."""

    __tablename__ = "notification_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("notification_schedules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[NotificationRunStatus] = mapped_column(
        String(16),
        default=NotificationRunStatus.STARTED,
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deliveries_enqueued: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class NotificationDelivery(Base):
    """A single per-recipient delivery attempt.

    Idempotency: ``(schedule_id, idempotency_key)`` unique. The generator builds
    ``idempotency_key`` from the subject it is notifying about (e.g.
    ``f"low_stock:{product_id}:{branch_id}:{date}"``) so we never spam the same
    alert twice for the same window.
    """

    __tablename__ = "notification_deliveries"
    __table_args__ = (
        UniqueConstraint(
            "schedule_id",
            "idempotency_key",
            name="uq_notification_deliveries_schedule_idem",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    schedule_id: Mapped[int | None] = mapped_column(
        ForeignKey("notification_schedules.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    run_id: Mapped[int | None] = mapped_column(
        ForeignKey("notification_runs.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("device_tokens.id", ondelete="SET NULL"), nullable=True
    )
    template_kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(
        String(16),
        default=NotificationStatus.PENDING,
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="mock")
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
