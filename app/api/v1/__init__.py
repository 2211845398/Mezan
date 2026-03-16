"""API v1 routers package."""

from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.branches import router as branches_router
from app.api.v1.catalog import router as catalog_router
from app.api.v1.config import router as config_router
from app.api.v1.endpoints import router as users_router
from app.api.v1.health import router as health_router
from app.api.v1.invoice_scans import router as invoice_scans_router
from app.api.v1.purchase_orders import router as purchase_orders_router
from app.api.v1.roles import router as roles_router
from app.api.v1.terminals import router as terminals_router
from app.api.v1.transfers import router as transfers_router

__all__ = [
    "audit_router",
    "auth_router",
    "branches_router",
    "catalog_router",
    "config_router",
    "health_router",
    "invoice_scans_router",
    "purchase_orders_router",
    "roles_router",
    "terminals_router",
    "transfers_router",
    "users_router",
]
