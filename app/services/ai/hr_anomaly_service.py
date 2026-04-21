"""HR anomaly advisor (Epic 14.2).

Facts: completed attendance logs in a lookback window joined with employee
profiles and branches. Deterministic pre-classification flags:

- ``excessive_overtime`` — total daily hours > 10.
- ``missing_clock_out`` — a clock-in older than 16h without a clock-out.
- ``outside_schedule`` — clock-in more than 60 minutes outside the employee's
  longest-running pattern (median of last 14 days).

The LLM re-ranks and explains; it never fabricates employees. Hallucinated
``employee_profile_id`` values are dropped before returning.
"""

from __future__ import annotations

import statistics
from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ExternalServiceError
from app.models.attendance_log import AttendanceLog
from app.models.employee_profile import EmployeeProfile
from app.models.users import User
from app.schemas.ai_advisory import HrAnomaly, HrAnomalyRequest, HrAnomalyResponse
from app.services.ai.llm_client import call_llm_json


class _LLMAnomalyEnvelope(BaseModel):
    anomalies: list[HrAnomaly]


_SYSTEM_PROMPT = (
    "You are an HR operations analyst. Using ONLY the provided attendance facts, "
    "return anomalies as strict JSON matching this schema: "
    '{"anomalies":[{"employee_profile_id":int,"employee_name":str|null,'
    '"branch_id":int|null,"anomaly_type":"excessive_overtime|missing_clock_out|'
    'outside_schedule|unusual_pattern","period_start":iso,"period_end":iso,'
    '"observed_value":number,"expected_value":number|null,"rationale":str,'
    '"severity":"high|medium|low","confidence":0.0}]} '
    "Do not invent employee_profile_id values. No text outside JSON."
)


async def _load_attendance(
    db: AsyncSession,
    *,
    lookback_days: int,
    branch_id: int | None,
    employee_ids: list[int] | None,
) -> list[dict[str, Any]]:
    cutoff = datetime.now(UTC) - timedelta(days=lookback_days)
    stmt = (
        select(
            AttendanceLog.id,
            AttendanceLog.employee_profile_id,
            AttendanceLog.branch_id,
            AttendanceLog.clock_in_at,
            AttendanceLog.clock_out_at,
            EmployeeProfile.id.label("ep_id"),
            EmployeeProfile.user_id,
            User.full_name,
        )
        .join(EmployeeProfile, EmployeeProfile.id == AttendanceLog.employee_profile_id)
        .join(User, User.id == EmployeeProfile.user_id)
        .where(AttendanceLog.clock_in_at >= cutoff)
        .order_by(AttendanceLog.clock_in_at.asc())
    )
    if branch_id is not None:
        stmt = stmt.where(AttendanceLog.branch_id == branch_id)
    if employee_ids:
        stmt = stmt.where(AttendanceLog.employee_profile_id.in_(employee_ids))
    result = await db.execute(stmt)
    return [
        {
            "attendance_id": int(row.id),
            "employee_profile_id": int(row.employee_profile_id),
            "branch_id": int(row.branch_id),
            "employee_name": row.full_name,
            "clock_in_at": row.clock_in_at,
            "clock_out_at": row.clock_out_at,
        }
        for row in result.all()
    ]


def _deterministic_anomalies(logs: list[dict]) -> list[HrAnomaly]:
    now = datetime.now(UTC)
    out: list[HrAnomaly] = []

    # Typical clock-in hour per employee (median) over the window.
    by_emp: dict[int, list[int]] = {}
    for log in logs:
        ci = log["clock_in_at"]
        if ci is None:
            continue
        by_emp.setdefault(log["employee_profile_id"], []).append(ci.hour * 60 + ci.minute)
    typical_minute: dict[int, int] = {
        emp: int(statistics.median(mins)) for emp, mins in by_emp.items() if len(mins) >= 3
    }

    for log in logs:
        ci = log["clock_in_at"]
        co = log["clock_out_at"]
        emp_id = log["employee_profile_id"]
        name = log.get("employee_name")
        branch_id = log.get("branch_id")

        if ci is not None and co is None and (now - ci) > timedelta(hours=16):
            out.append(
                HrAnomaly(
                    employee_profile_id=emp_id,
                    employee_name=name,
                    branch_id=branch_id,
                    anomaly_type="missing_clock_out",
                    period_start=ci,
                    period_end=now,
                    observed_value=round((now - ci).total_seconds() / 3600.0, 2),
                    expected_value=8.0,
                    rationale=(
                        "Clock-in without a clock-out for more than 16 hours; likely "
                        "forgotten punch."
                    ),
                    severity="high",
                    confidence=0.95,
                )
            )
            continue
        if ci is not None and co is not None:
            hours = (co - ci).total_seconds() / 3600.0
            if hours > 10:
                out.append(
                    HrAnomaly(
                        employee_profile_id=emp_id,
                        employee_name=name,
                        branch_id=branch_id,
                        anomaly_type="excessive_overtime",
                        period_start=ci,
                        period_end=co,
                        observed_value=round(hours, 2),
                        expected_value=8.0,
                        rationale=(
                            f"Shift lasted {hours:.1f}h, exceeding the 10h daily threshold."
                        ),
                        severity="medium" if hours < 14 else "high",
                        confidence=0.9,
                    )
                )
        if ci is not None and emp_id in typical_minute:
            minute = ci.hour * 60 + ci.minute
            delta = abs(minute - typical_minute[emp_id])
            if delta > 60:
                out.append(
                    HrAnomaly(
                        employee_profile_id=emp_id,
                        employee_name=name,
                        branch_id=branch_id,
                        anomaly_type="outside_schedule",
                        period_start=ci,
                        period_end=co or ci,
                        observed_value=float(minute),
                        expected_value=float(typical_minute[emp_id]),
                        rationale=(f"Clock-in {delta} minutes off the employee's median time."),
                        severity="low",
                        confidence=0.75,
                    )
                )
    return out


async def detect_hr_anomalies(db: AsyncSession, *, payload: HrAnomalyRequest) -> HrAnomalyResponse:
    logs = await _load_attendance(
        db,
        lookback_days=payload.lookback_days,
        branch_id=payload.branch_id,
        employee_ids=payload.employee_ids,
    )

    facts = {
        "lookback_days": payload.lookback_days,
        "log_count": len(logs),
        "logs_sample": logs[:200],
        "generated_at": datetime.now(UTC).isoformat(),
    }

    deterministic = _deterministic_anomalies(logs)[: payload.max_anomalies]

    model_name = "deterministic_fallback"
    anomalies = deterministic
    if settings.OPENAI_API_KEY and deterministic:
        try:
            envelope = await call_llm_json(
                system_prompt=_SYSTEM_PROMPT,
                user_payload={
                    "request": payload.model_dump(),
                    "deterministic_anomalies": [a.model_dump() for a in deterministic],
                    "instructions": (
                        "Re-rank, merge similar rows per employee, and improve rationale "
                        "wording. Never introduce employee_profile_id values that are not "
                        "already in the deterministic list."
                    ),
                },
                response_model=_LLMAnomalyEnvelope,
                max_tokens=1500,
            )
            allowed_ids = {a.employee_profile_id for a in deterministic}
            filtered = [a for a in envelope.anomalies if a.employee_profile_id in allowed_ids]
            if filtered:
                anomalies = filtered[: payload.max_anomalies]
                model_name = settings.OPENAI_MODEL
        except ExternalServiceError:
            anomalies = deterministic

    return HrAnomalyResponse(
        model=model_name,
        generated_at=datetime.now(UTC),
        facts_used=facts,
        anomalies=anomalies,
    )
