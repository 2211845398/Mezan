"""FastAPI application entry point."""

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.error_handlers import (
    app_error_handler,
    http_exception_handler,
    request_validation_exception_handler,
    unhandled_exception_handler,
)
from app.api.v1 import (
    audit_router,
    auth_router,
    branches_router,
    carts_router,
    catalog_router,
    config_router,
    customers_router,
    health_router,
    inventory_adjustments_router,
    invoice_scans_router,
    payments_router,
    pos_shifts_router,
    purchase_orders_router,
    returns_router,
    roles_router,
    sales_router,
    terminals_router,
    transfers_router,
    users_router,
)
from app.core.config import settings
from app.core.errors import AppError
from app.db.database import close_db


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

    # Startup (schema: use Alembic only; do not create_all on boot)
    try:
        async with AsyncSessionLocal() as db:
            await seed_permissions_and_roles(db)
            if settings.DEFAULT_ADMIN_EMAIL and settings.DEFAULT_ADMIN_PASSWORD:
                await seed_default_admin(
                    db, settings.DEFAULT_ADMIN_EMAIL, settings.DEFAULT_ADMIN_PASSWORD
                )
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

# Global exception handling (frontend-stable envelope)
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

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
app.include_router(catalog_router, prefix="/api/v1", tags=["catalog"])
app.include_router(purchase_orders_router, prefix="/api/v1", tags=["purchase_orders"])
app.include_router(invoice_scans_router, prefix="/api/v1", tags=["invoice_scans"])
app.include_router(transfers_router, prefix="/api/v1", tags=["transfers"])
app.include_router(pos_shifts_router, prefix="/api/v1", tags=["pos_shifts"])
app.include_router(inventory_adjustments_router, prefix="/api/v1", tags=["inventory"])
app.include_router(customers_router, prefix="/api/v1", tags=["customers"])
app.include_router(carts_router, prefix="/api/v1", tags=["pos_carts"])
app.include_router(payments_router, prefix="/api/v1", tags=["pos_payments"])
app.include_router(sales_router, prefix="/api/v1", tags=["sales"])
app.include_router(returns_router, prefix="/api/v1", tags=["returns"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Mezan ERP System API",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT,
    }
