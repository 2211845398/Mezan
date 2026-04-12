"""API v1 routers package."""

from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.branches import router as branches_router
from app.api.v1.carts import router as carts_router
from app.api.v1.catalog import router as catalog_router
from app.api.v1.config import router as config_router
from app.api.v1.customers import router as customers_router
from app.api.v1.discounts import router as discounts_router
from app.api.v1.employees import router as employees_router
from app.api.v1.endpoints import router as users_router
from app.api.v1.health import router as health_router
from app.api.v1.inventory_adjustments import router as inventory_adjustments_router
from app.api.v1.invoice_scans import router as invoice_scans_router
from app.api.v1.loyalty import router as loyalty_router
from app.api.v1.marketing import router as marketing_router
from app.api.v1.payments import router as payments_router
from app.api.v1.payroll import router as payroll_router
from app.api.v1.pos_shifts import router as pos_shifts_router
from app.api.v1.purchase_orders import router as purchase_orders_router
from app.api.v1.returns import router as returns_router
from app.api.v1.roles import router as roles_router
from app.api.v1.sales import router as sales_router
from app.api.v1.terminals import router as terminals_router
from app.api.v1.transfers import router as transfers_router

__all__ = [
    "audit_router",
    "auth_router",
    "branches_router",
    "catalog_router",
    "carts_router",
    "config_router",
    "customers_router",
    "discounts_router",
    "employees_router",
    "health_router",
    "inventory_adjustments_router",
    "invoice_scans_router",
    "loyalty_router",
    "marketing_router",
    "payroll_router",
    "payments_router",
    "pos_shifts_router",
    "purchase_orders_router",
    "returns_router",
    "roles_router",
    "sales_router",
    "terminals_router",
    "transfers_router",
    "users_router",
]
