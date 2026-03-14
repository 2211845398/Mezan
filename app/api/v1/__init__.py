"""API v1 routers package."""

from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.branches import router as branches_router
from app.api.v1.config import router as config_router
from app.api.v1.endpoints import router as users_router
from app.api.v1.health import router as health_router
from app.api.v1.roles import router as roles_router
from app.api.v1.terminals import router as terminals_router

__all__ = [
    "audit_router",
    "auth_router",
    "branches_router",
    "config_router",
    "health_router",
    "roles_router",
    "terminals_router",
    "users_router",
]
