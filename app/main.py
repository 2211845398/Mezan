"""FastAPI application entry point."""

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import OperationalError, ProgrammingError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.deps import PERMISSION_DEPENDENCY_MARKER
from app.api.error_handlers import (
    app_error_handler,
    http_exception_handler,
    rate_limit_exception_handler,
    request_validation_exception_handler,
    unhandled_exception_handler,
)
from app.api.v1 import (
    accounting_router,
    ai_advisory_router,
    audit_router,
    auth_router,
    backups_router,
    branches_router,
    carts_router,
    catalog_router,
    config_router,
    customers_router,
    discounts_router,
    employees_router,
    executive_bi_router,
    goods_receipts_router,
    health_router,
    inventory_adjustments_router,
    inventory_reporting_router,
    invoice_scans_router,
    loyalty_router,
    marketing_router,
    notifications_router,
    payments_router,
    payroll_router,
    pos_shifts_router,
    price_lists_router,
    purchase_orders_router,
    returns_router,
    roles_router,
    sales_router,
    suppliers_router,
    terminals_router,
    transfers_router,
    users_router,
)
from app.core.config import settings
from app.core.errors import AppError
from app.core.rate_limit import limiter
from app.db.database import close_db
from app.services.backup_service import backup_scheduler_loop
from app.services.notifications.service import notification_scheduler_loop

logger = logging.getLogger(__name__)
PUBLIC_ROUTE_ALLOWLIST: set[tuple[str, str]] = {
    ("GET", "/api/v1/health"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/auth/sso/google"),
    ("GET", "/api/v1/auth/sso/callback"),
    ("POST", "/api/v1/auth/password-reset/request"),
    ("POST", "/api/v1/auth/password-reset/confirm"),
    ("GET", "/api/v1/auth/me"),
    ("GET", "/api/v1/auth/me/permissions"),
    ("GET", "/api/v1/auth/me/roles"),
    ("PATCH", "/api/v1/auth/me"),
    ("POST", "/api/v1/auth/me/avatar"),
    ("POST", "/api/v1/customers/onboarding/complete"),
}


def _iter_dependency_calls(dependant):
    for dependency in dependant.dependencies:
        call = getattr(dependency, "call", None)
        if call is not None:
            yield call
        yield from _iter_dependency_calls(dependency)


def _route_has_permission_dependency(route: APIRoute) -> bool:
    return any(
        hasattr(call, PERMISSION_DEPENDENCY_MARKER)
        for call in _iter_dependency_calls(route.dependant)
    )


def _audit_route_permissions(app: FastAPI) -> None:
    missing_routes: list[str] = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith("/api/v1"):
            continue

        methods = sorted((route.methods or set()) - {"HEAD", "OPTIONS"})
        if not methods:
            continue
        if all((method, route.path) in PUBLIC_ROUTE_ALLOWLIST for method in methods):
            continue
        if _route_has_permission_dependency(route):
            continue

        missing_routes.append(f"{','.join(methods)} {route.path}")

    if missing_routes:
        joined = "; ".join(sorted(missing_routes))
        raise RuntimeError(f"Permission audit failed. Missing require_permission() on: {joined}")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Set request_id on request.state for audit and tracing."""

    async def dispatch(self, request, call_next):
        request.state.request_id = str(uuid.uuid4())
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    from app.db.database import AsyncSessionLocal
    from app.services.seed_service import (
        seed_accounting_defaults,
        seed_default_admin,
        seed_notification_templates,
        seed_permissions_and_roles,
    )

    # Startup (schema: use Alembic only; do not create_all on boot)
    backup_stop_event = asyncio.Event()
    notifications_stop_event = asyncio.Event()
    backup_task: asyncio.Task | None = None
    notifications_task: asyncio.Task | None = None
    _audit_route_permissions(app)
    if settings.SEED_ON_STARTUP:
        try:
            async with AsyncSessionLocal() as db:
                await seed_permissions_and_roles(db)
                await seed_accounting_defaults(db)
                await seed_notification_templates(db)
                if settings.DEFAULT_ADMIN_EMAIL and settings.DEFAULT_ADMIN_PASSWORD:
                    await seed_default_admin(
                        db, settings.DEFAULT_ADMIN_EMAIL, settings.DEFAULT_ADMIN_PASSWORD
                    )
        except (OperationalError, ProgrammingError):
            logger.warning(
                "Skipping startup seed because the database is not ready or migrations are pending.",
                exc_info=True,
            )
    else:
        logger.info("Startup seeding skipped because SEED_ON_STARTUP is disabled.")

    if settings.BACKUP_ENABLED:
        backup_task = asyncio.create_task(backup_scheduler_loop(backup_stop_event))
    if settings.NOTIFICATIONS_ENABLED:
        notifications_task = asyncio.create_task(
            notification_scheduler_loop(notifications_stop_event)
        )
    yield
    # Shutdown
    backup_stop_event.set()
    notifications_stop_event.set()
    for task in (backup_task, notifications_task):
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
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
app.state.limiter = limiter

# Global exception handling (frontend-stable envelope)
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
app.add_exception_handler(RateLimitExceeded, rate_limit_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Middleware: request_id first (innermost), then CORS
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

_avatar_dir = Path(settings.AVATAR_UPLOAD_DIR)
_avatar_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/api/v1/static/avatars",
    StaticFiles(directory=str(_avatar_dir.resolve())),
    name="static_avatars",
)

_catalog_cat_img_dir = Path(settings.CATALOG_CATEGORY_IMAGE_UPLOAD_DIR)
_catalog_cat_img_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/api/v1/static/catalog-category-images",
    StaticFiles(directory=str(_catalog_cat_img_dir.resolve())),
    name="static_catalog_category_images",
)

_catalog_prod_img_dir = Path(settings.CATALOG_PRODUCT_IMAGE_UPLOAD_DIR)
_catalog_prod_img_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/api/v1/static/catalog-product-images",
    StaticFiles(directory=str(_catalog_prod_img_dir.resolve())),
    name="static_catalog_product_images",
)

# Include v1 routers
app.include_router(health_router, prefix="/api/v1", tags=["health"])
app.include_router(backups_router, prefix="/api/v1", tags=["backups"])
app.include_router(users_router, prefix="/api/v1", tags=["users"])
app.include_router(auth_router, prefix="/api/v1", tags=["auth"])
app.include_router(audit_router, prefix="/api/v1", tags=["audit"])
app.include_router(config_router, prefix="/api/v1", tags=["config"])
app.include_router(branches_router, prefix="/api/v1", tags=["branches"])
app.include_router(terminals_router, prefix="/api/v1", tags=["terminals"])
app.include_router(roles_router, prefix="/api/v1", tags=["roles"])
app.include_router(catalog_router, prefix="/api/v1", tags=["catalog"])
app.include_router(price_lists_router, prefix="/api/v1", tags=["catalog"])
app.include_router(purchase_orders_router, prefix="/api/v1", tags=["purchase_orders"])
app.include_router(goods_receipts_router, prefix="/api/v1", tags=["goods_receipts"])
app.include_router(invoice_scans_router, prefix="/api/v1", tags=["invoice_scans"])
app.include_router(transfers_router, prefix="/api/v1", tags=["transfers"])
app.include_router(pos_shifts_router, prefix="/api/v1", tags=["pos_shifts"])
app.include_router(inventory_adjustments_router, prefix="/api/v1", tags=["inventory"])
app.include_router(inventory_reporting_router, prefix="/api/v1", tags=["inventory"])
app.include_router(customers_router, prefix="/api/v1", tags=["customers"])
app.include_router(employees_router, prefix="/api/v1", tags=["employees"])
app.include_router(carts_router, prefix="/api/v1", tags=["pos_carts"])
app.include_router(payments_router, prefix="/api/v1", tags=["pos_payments"])
app.include_router(payroll_router, prefix="/api/v1", tags=["payroll"])
app.include_router(sales_router, prefix="/api/v1", tags=["sales"])
app.include_router(returns_router, prefix="/api/v1", tags=["returns"])
app.include_router(loyalty_router, prefix="/api/v1", tags=["loyalty"])
app.include_router(discounts_router, prefix="/api/v1", tags=["discounts"])
app.include_router(marketing_router, prefix="/api/v1", tags=["marketing"])
app.include_router(notifications_router, prefix="/api/v1", tags=["notifications"])
app.include_router(ai_advisory_router, prefix="/api/v1", tags=["ai_advisory"])
app.include_router(accounting_router, prefix="/api/v1", tags=["accounting"])
app.include_router(executive_bi_router, prefix="/api/v1", tags=["executive_bi"])
app.include_router(suppliers_router, prefix="/api/v1", tags=["suppliers"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Mezan ERP System API",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT,
    }
