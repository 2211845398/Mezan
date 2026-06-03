"""Request/response for structured inventory movements."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

TransactionType = Literal[
    "add_stock",
    "issue_stock",
    "return_stock",
    "damage_mark",
    "damage_scrap",
    "damage_unmark",
    "reserve",
    "release",
    "count_adjust",
]


class HumanInventoryMovementCreate(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    branch_id: int
    product_id: int
    variant_id: int | None = None
    uom_id: int | None = None
    transaction_type: TransactionType
    quantity: int | None = None
    qty_signed: int | None = None
    reserve_movement_id: int | None = Field(
        default=None,
        description="Required for release: id of the reserve movement to unwind.",
    )
    notes: str | None = Field(default=None, max_length=1024)
    reason: str = Field(default="manual_movement", min_length=2, max_length=64)
    unit_cost: Decimal | None = Field(
        default=None,
        description="Required for add_stock (goods receipt): positive unit cost to roll into WAVG.",
    )

    @model_validator(mode="after")
    def _qty_rules(self) -> HumanInventoryMovementCreate:
        if self.transaction_type == "count_adjust":
            if self.qty_signed is None:
                raise ValueError("qty_signed is required for count_adjust")
            if self.qty_signed == 0:
                raise ValueError("qty_signed cannot be zero")
        else:
            if self.quantity is None or self.quantity <= 0:
                raise ValueError("quantity must be a positive integer")
        if self.transaction_type == "add_stock":
            if self.unit_cost is None:
                raise ValueError("unit_cost is required for add_stock")
            if self.unit_cost <= 0:
                raise ValueError("unit_cost must be positive for add_stock")
        elif self.unit_cost is not None:
            raise ValueError("unit_cost may only be supplied for add_stock")
        if self.transaction_type == "release":
            if self.reserve_movement_id is None:
                raise ValueError("reserve_movement_id is required for release")
        elif self.reserve_movement_id is not None:
            raise ValueError("reserve_movement_id may only be supplied for release")
        return self


class HumanInventoryMovementResponse(BaseModel):
    movement_id: int
