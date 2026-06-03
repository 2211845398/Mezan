"""Policy snapshot must be JSON-serializable for attendance_logs.policy_snapshot (JSONB)."""

import json
from decimal import Decimal

from app.services.attendance_classification_service import _policy_snapshot
from app.services.attendance_policy_service import materialize_spec_row


def test_policy_snapshot_from_dict_with_decimals_is_json_serializable():
    policy = materialize_spec_row(
        {
            "role_code": "UNKNOWN",
            "attendance_category": "office",
        }
    )
    assert isinstance(policy["absence_deduction_amount"], Decimal)

    snap = _policy_snapshot(policy)
    json.dumps(snap)

    assert snap["absence_deduction_amount"] == "50.00"
    assert snap["overtime_multiplier"] == "1.50"
    assert snap["grace_minutes"] == 30
