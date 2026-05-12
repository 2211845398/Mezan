"""Hardcoded loyalty rule evaluation (Epic 22.3)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Callable


class RuleTrigger(str, Enum):
    ON_PURCHASE = "on_purchase"
    ON_CART_VALUE = "on_cart_value"
    ON_PRODUCT_CATEGORY = "on_product_category"


class RuleActionType(str, Enum):
    ADD_POINTS = "add_points"
    MULTIPLIER = "multiplier"


@dataclass(frozen=True)
class LoyaltyRule:
    id: str
    name: str
    description: str
    trigger: RuleTrigger
    condition: Callable[[dict], bool]
    action_type: RuleActionType
    action_value: int
    priority: int = 0


RULES: list[LoyaltyRule] = [
    LoyaltyRule(
        id="base_purchase",
        name="Base Purchase Points",
        description="10 points for every purchase",
        trigger=RuleTrigger.ON_PURCHASE,
        condition=lambda ctx: True,
        action_type=RuleActionType.ADD_POINTS,
        action_value=10,
        priority=1,
    ),
    LoyaltyRule(
        id="high_value_bonus",
        name="High Value Bonus",
        description="50 bonus points for purchases over 1000",
        trigger=RuleTrigger.ON_CART_VALUE,
        condition=lambda ctx: ctx.get("cart_total", Decimal("0")) > Decimal("1000"),
        action_type=RuleActionType.ADD_POINTS,
        action_value=50,
        priority=2,
    ),
    LoyaltyRule(
        id="premium_category",
        name="Premium Category Bonus",
        description="Double points on Electronics category",
        trigger=RuleTrigger.ON_PRODUCT_CATEGORY,
        condition=lambda ctx: ctx.get("category_code") == "ELECTRONICS",
        action_type=RuleActionType.MULTIPLIER,
        action_value=2,
        priority=3,
    ),
    LoyaltyRule(
        id="weekend_bonus",
        name="Weekend Shopping Bonus",
        description="25 bonus points for weekend purchases",
        trigger=RuleTrigger.ON_PURCHASE,
        condition=lambda ctx: bool(ctx.get("is_weekend")),
        action_type=RuleActionType.ADD_POINTS,
        action_value=25,
        priority=2,
    ),
]


def evaluate_rules(context: dict) -> dict:
    sorted_rules = sorted(RULES, key=lambda r: r.priority, reverse=True)
    matches: list[dict] = []
    base_points = 0
    multiplier = 1

    for rule in sorted_rules:
        try:
            if not rule.condition(context):
                continue
            if rule.action_type == RuleActionType.ADD_POINTS:
                base_points += rule.action_value
            elif rule.action_type == RuleActionType.MULTIPLIER:
                multiplier *= rule.action_value
            matches.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "action_type": rule.action_type.value,
                    "action_value": rule.action_value,
                    "priority": rule.priority,
                }
            )
        except Exception:
            continue

    total_points = int(base_points * multiplier)
    return {
        "matched_rules": matches,
        "calculation": {
            "base_points": int(base_points),
            "multiplier": int(multiplier),
            "total_points": total_points,
        },
    }


def get_all_rules() -> list[dict]:
    return [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "trigger": r.trigger.value,
            "action_type": r.action_type.value,
            "action_value": r.action_value,
            "priority": r.priority,
        }
        for r in RULES
    ]


def calculate_loyalty_for_purchase(
    *,
    cart_total: Decimal,
    category_codes: list[str],
    is_weekend: bool = False,
) -> dict:
    context = {
        "cart_total": cart_total,
        "category_code": category_codes[0] if category_codes else None,
        "is_weekend": is_weekend,
    }
    return evaluate_rules(context)
