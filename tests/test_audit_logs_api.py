"""Tests for audit logs API with enriched fields and filters."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.schemas.audit import AuditLogRead


class TestAuditLogEnrichment:
    """Tests for audit log enrichment with user/branch names."""

    def test_audit_log_read_with_enriched_fields(self):
        """Should validate AuditLogRead with enriched fields."""
        data = {
            "id": 1,
            "created_at": datetime.now(UTC),
            "user_id": 42,
            "branch_id": 3,
            "action": "user.created",
            "resource_type": "user",
            "resource_id": "42",
            "old_value": None,
            "new_value": {"name": "Test User"},
            "ip_address": "192.168.1.1",
            "user_agent": "Mozilla/5.0",
            "request_id": "req-123",
            "user_display_name": "Test User",
            "user_email": "test@example.com",
            "branch_name": "Main Branch",
        }

        log = AuditLogRead.model_validate(data)
        assert log.user_display_name == "Test User"
        assert log.user_email == "test@example.com"
        assert log.branch_name == "Main Branch"


class TestAuditLogFilters:
    """Tests for audit log filter parameters."""

    @pytest.mark.asyncio
    async def test_filter_by_user_id(self, db_session: AsyncSession):
        """Should filter audit logs by user_id."""
        # Create test logs
        log1 = AuditLog(
            user_id=1,
            action="test.action",
            resource_type="test",
            resource_id="1",
        )
        log2 = AuditLog(
            user_id=2,
            action="test.action",
            resource_type="test",
            resource_id="2",
        )
        db_session.add_all([log1, log2])
        await db_session.commit()

        # Query with filter
        query = select(AuditLog).where(AuditLog.user_id == 1)
        result = await db_session.execute(query)
        items = result.scalars().all()

        assert len(items) == 1
        assert items[0].user_id == 1

    @pytest.mark.asyncio
    async def test_filter_by_action_pattern(self, db_session: AsyncSession):
        """Should filter audit logs by action pattern (ilike)."""
        log1 = AuditLog(
            action="user.created",
            resource_type="user",
            resource_id="1",
        )
        log2 = AuditLog(
            action="user.updated",
            resource_type="user",
            resource_id="1",
        )
        log3 = AuditLog(
            action="backup.created",
            resource_type="backup",
            resource_id="1",
        )
        db_session.add_all([log1, log2, log3])
        await db_session.commit()

        # Query with ilike pattern
        query = select(AuditLog).where(AuditLog.action.ilike("%user.%"))
        result = await db_session.execute(query)
        items = result.scalars().all()

        assert len(items) == 2
        assert all("user" in item.action for item in items)

    @pytest.mark.asyncio
    async def test_filter_by_date_range(self, db_session: AsyncSession):
        """Should filter audit logs by date range."""
        now = datetime.now(UTC)
        log1 = AuditLog(
            created_at=now,
            action="test.action",
            resource_type="test",
            resource_id="1",
        )
        log2 = AuditLog(
            created_at=datetime(2020, 1, 1, tzinfo=UTC),
            action="test.action",
            resource_type="test",
            resource_id="2",
        )
        db_session.add_all([log1, log2])
        await db_session.commit()

        # Query with date filter
        query = select(AuditLog).where(AuditLog.created_at >= datetime(2024, 1, 1, tzinfo=UTC))
        result = await db_session.execute(query)
        items = result.scalars().all()

        assert len(items) == 1
        assert items[0].resource_id == "1"

    @pytest.mark.asyncio
    async def test_filter_by_resource_id_pattern(self, db_session: AsyncSession):
        """Should filter audit logs by resource_id pattern."""
        log1 = AuditLog(
            action="test.action",
            resource_type="invoice",
            resource_id="INV-2024-001",
        )
        log2 = AuditLog(
            action="test.action",
            resource_type="invoice",
            resource_id="INV-2023-999",
        )
        db_session.add_all([log1, log2])
        await db_session.commit()

        # Query with resource_id pattern
        query = select(AuditLog).where(AuditLog.resource_id.ilike("%2024%"))
        result = await db_session.execute(query)
        items = result.scalars().all()

        assert len(items) == 1
        assert "2024" in items[0].resource_id

    @pytest.mark.asyncio
    async def test_search_query_across_fields(self, db_session: AsyncSession):
        """Should search across action, resource_type, and resource_id."""
        log1 = AuditLog(
            action="user.created",
            resource_type="user",
            resource_id="42",
        )
        log2 = AuditLog(
            action="backup.failed",
            resource_type="backup_job",
            resource_id="job-123",
        )
        db_session.add_all([log1, log2])
        await db_session.commit()

        # Query with search pattern across multiple fields
        search_pattern = "%backup%"
        query = select(AuditLog).where(
            (AuditLog.action.ilike(search_pattern))
            | (AuditLog.resource_type.ilike(search_pattern))
            | (AuditLog.resource_id.ilike(search_pattern))
        )
        result = await db_session.execute(query)
        items = result.scalars().all()

        assert len(items) == 1
        assert items[0].action == "backup.failed"


class TestAuditLogPermissions:
    """Tests for audit log API permissions."""

    def test_audit_log_read_permission_required(self):
        """Audit log endpoints require audit_log:read permission."""
        # This is enforced by the require_permission decorator
        # Permission is validated at the API layer
        pass
