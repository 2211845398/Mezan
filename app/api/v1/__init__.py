"""API v1 routers package."""

from app.api.v1.auth import router as auth_router
from app.api.v1.endpoints import router as users_router
from app.api.v1.health import router as health_router

__all__ = ["health_router", "users_router", "auth_router"]
