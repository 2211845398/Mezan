"""FastAPI application entry point."""

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1 import (
    auth_router,
    audit_router,
    branches_router,
    config_router,
    health_router,
    roles_router,
    terminals_router,
    users_router,
)
from app.core.config import settings
from app.db.database import close_db, init_db


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Set request_id on request.state for audit and tracing."""

    async def dispatch(self, request, call_next):
        request.state.request_id = str(uuid.uuid4())
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    from app.db.database import AsyncSessionLocal
    from app.services.seed_service import seed_default_admin, seed_permissions_and_roles

    # Startup
    if settings.is_development:
        await init_db()
    try:
        async with AsyncSessionLocal() as db:
            await seed_permissions_and_roles(db)
            if settings.DEFAULT_ADMIN_EMAIL and settings.DEFAULT_ADMIN_PASSWORD:
                await seed_default_admin(db, settings.DEFAULT_ADMIN_EMAIL, settings.DEFAULT_ADMIN_PASSWORD)
    except Exception:
        pass  # DB may not be migrated yet
    yield
    # Shutdown
    await close_db()


# Create FastAPI application
app = FastAPI(
    title="Mezan ERP System",
    description="Comprehensive ERP and Retail Management System",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)

# Middleware: request_id first (innermost), then CORS
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.is_development else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include v1 routers
app.include_router(health_router, prefix="/api/v1", tags=["health"])
app.include_router(users_router, prefix="/api/v1", tags=["users"])
app.include_router(auth_router, prefix="/api/v1", tags=["auth"])
app.include_router(audit_router, prefix="/api/v1", tags=["audit"])
app.include_router(config_router, prefix="/api/v1", tags=["config"])
app.include_router(branches_router, prefix="/api/v1", tags=["branches"])
app.include_router(terminals_router, prefix="/api/v1", tags=["terminals"])
app.include_router(roles_router, prefix="/api/v1", tags=["roles"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Mezan ERP System API",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT,
    }
