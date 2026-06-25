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
    attendance_devices_router,
    attributes_router,
    audit_router,
    auth_router,
    backups_router,
    branches_router,
    carts_router,
    catalog_router,
    chart_accounts_router,
    config_router,
    correspondence_router,
    currencies_router,
    customer_performance_router,
    customers_router,
    discounts_router,
    employees_router,
    executive_bi_router,
    goods_receipts_router,
    health_router,
    hr_router,
    inventory_adjustments_router,
    inventory_operations_router,
    inventory_policies_router,
    inventory_reporting_router,
    invoice_scans_router,
    loyalty_router,
    loyalty_rules_router,
    marketing_router,
    notifications_router,
    payment_terms_router,
    payments_router,
    payroll_router,
    pos_proforma_router,
    pos_shifts_router,
    price_lists_router,
    pricing_evaluation_router,
    production_orders_router,
    purchase_orders_router,
    realtime_router,
    returns_router,
    roles_router,
    sales_router,
    suppliers_router,
    terminals_router,
    transfers_router,
    users_router,
    vouchers_router,
)
from app.core.config import settings
from app.core.errors import AppError
from app.core.rate_limit import limiter
from app.db.database import AsyncSessionLocal, close_db
from app.db.enum_compat import patch_sqlalchemy_enum_value_compat
from app.db.schema_check import notifications_schema_ready
from app.services.backup_service import backup_scheduler_loop
from app.services.customer_gc_service import customer_gc_scheduler_loop
from app.services.notifications.service import notification_scheduler_loop

patch_sqlalchemy_enum_value_compat()

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    """Ensure app loggers are visible in Docker/uvicorn during development."""
    if not settings.is_development:
        return
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
        force=True,
    )
    logging.getLogger("app").setLevel(logging.INFO)


_configure_logging()

PUBLIC_ROUTE_ALLOWLIST: set[tuple[str, str]] = {
    ("GET", "/api/v1/health"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/auth/sso/google"),
    ("GET", "/api/v1/auth/sso/callback"),
    ("POST", "/api/v1/auth/password-reset/request"),
    ("POST", "/api/v1/auth/password-reset/verify-otp"),
    ("POST", "/api/v1/auth/password-reset/confirm"),
    ("GET", "/api/v1/auth/me"),
    ("GET", "/api/v1/auth/me/permissions"),
    ("GET", "/api/v1/auth/me/roles"),
    ("PATCH", "/api/v1/auth/me"),
    ("PATCH", "/api/v1/auth/me/two-factor"),
    ("POST", "/api/v1/auth/me/avatar"),
    ("POST", "/api/v1/auth/2fa/verify"),
    ("POST", "/api/v1/auth/change-password-required"),
    ("POST", "/api/v1/customers/onboarding/complete"),
    # SSE: EventSource cannot send Authorization; JWT is validated via access_token query param.
    ("GET", "/api/v1/realtime/events"),
}

PUBLIC_ROUTE_PATH_PREFIXES: tuple[str, ...] = ("/api/v1/auth/password-reset/",)


def _is_public_route(method: str, path: str) -> bool:
    if (method, path) in PUBLIC_ROUTE_ALLOWLIST:
        return True
    return any(path.startswith(prefix) for prefix in PUBLIC_ROUTE_PATH_PREFIXES)


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
        if all(_is_public_route(method, route.path) for method in methods):
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
    from app.scripts.core_seed import run_core_seed

    # Startup (schema: use Alembic only; do not create_all on boot)
    backup_stop_event = asyncio.Event()
    notifications_stop_event = asyncio.Event()
    customer_gc_stop_event = asyncio.Event()
    backup_task: asyncio.Task | None = None
    notifications_task: asyncio.Task | None = None
    customer_gc_task: asyncio.Task | None = None
    _audit_route_permissions(app)
    if settings.SEED_ON_STARTUP:
        try:
            await run_core_seed()
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
        async with AsyncSessionLocal() as db:
            schema_ready = await notifications_schema_ready(db)
        if schema_ready:
            notifications_task = asyncio.create_task(
                notification_scheduler_loop(notifications_stop_event)
            )
        else:
            logger.warning(
                "Notification scheduler disabled: missing notification tables. "
                "Run `uv run alembic upgrade head`."
            )
    if settings.CUSTOMER_GC_ENABLED:
        customer_gc_task = asyncio.create_task(customer_gc_scheduler_loop(customer_gc_stop_event))
    yield
    # Shutdown
    backup_stop_event.set()
    notifications_stop_event.set()
    customer_gc_stop_event.set()
    for task in (backup_task, notifications_task, customer_gc_task):
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

# Local dev: Flutter web, Vite, and other tools bind to ephemeral localhost ports.
_LOCALHOST_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"


def _resolve_cors_origins() -> list[str]:
    """Development allows any origin when unset or configured as ``*``."""
    configured = settings.ALLOWED_ORIGINS
    if settings.is_development and (not configured or "*" in configured):
        return ["*"]
    return configured


def _resolve_cors_allow_credentials(origins: list[str]) -> bool:
    # Browsers reject credentialed requests when Access-Control-Allow-Origin is ``*``.
    if "*" in origins:
        return False
    return settings.cors_allow_credentials


def _resolve_cors_origin_regex(origins: list[str]) -> str | None:
    """Match any localhost port in dev when explicit origins are listed."""
    if not settings.is_development or "*" in origins:
        return None
    return _LOCALHOST_ORIGIN_REGEX


_cors_origins = _resolve_cors_origins()

# Middleware: request_id first (innermost), then CORS
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_resolve_cors_origin_regex(_cors_origins),
    allow_credentials=_resolve_cors_allow_credentials(_cors_origins),
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

_employee_id_doc_dir = Path(settings.EMPLOYEE_IDENTITY_DOCUMENT_UPLOAD_DIR)
_employee_id_doc_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/api/v1/static/employee-identity-documents",
    StaticFiles(directory=str(_employee_id_doc_dir.resolve())),
    name="static_employee_identity_documents",
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
app.include_router(attributes_router, prefix="/api/v1", tags=["catalog"])
app.include_router(price_lists_router, prefix="/api/v1", tags=["catalog"])
app.include_router(pricing_evaluation_router, prefix="/api/v1", tags=["catalog"])
app.include_router(purchase_orders_router, prefix="/api/v1", tags=["purchase_orders"])
app.include_router(goods_receipts_router, prefix="/api/v1", tags=["goods_receipts"])
app.include_router(invoice_scans_router, prefix="/api/v1", tags=["invoice_scans"])
app.include_router(transfers_router, prefix="/api/v1", tags=["transfers"])
app.include_router(pos_shifts_router, prefix="/api/v1", tags=["pos_shifts"])
app.include_router(pos_proforma_router, prefix="/api/v1", tags=["pos_proforma"])
app.include_router(production_orders_router, prefix="/api/v1", tags=["production_orders"])
app.include_router(inventory_adjustments_router, prefix="/api/v1", tags=["inventory"])
app.include_router(inventory_policies_router, prefix="/api/v1", tags=["inventory"])
app.include_router(inventory_reporting_router, prefix="/api/v1", tags=["inventory"])
app.include_router(inventory_operations_router, prefix="/api/v1", tags=["inventory"])
app.include_router(customers_router, prefix="/api/v1", tags=["customers"])
app.include_router(employees_router, prefix="/api/v1", tags=["employees"])
app.include_router(attendance_devices_router, prefix="/api/v1", tags=["attendance_devices"])
app.include_router(hr_router, prefix="/api/v1", tags=["hr"])
app.include_router(correspondence_router, prefix="/api/v1", tags=["correspondence"])
app.include_router(carts_router, prefix="/api/v1", tags=["pos_carts"])
app.include_router(payments_router, prefix="/api/v1", tags=["pos_payments"])
app.include_router(payroll_router, prefix="/api/v1", tags=["payroll"])
app.include_router(sales_router, prefix="/api/v1", tags=["sales"])
app.include_router(returns_router, prefix="/api/v1", tags=["returns"])
app.include_router(loyalty_router, prefix="/api/v1", tags=["loyalty"])
app.include_router(loyalty_rules_router, prefix="/api/v1", tags=["loyalty"])
app.include_router(discounts_router, prefix="/api/v1", tags=["discounts"])
app.include_router(marketing_router, prefix="/api/v1", tags=["marketing"])
app.include_router(notifications_router, prefix="/api/v1", tags=["notifications"])
app.include_router(realtime_router, prefix="/api/v1", tags=["realtime"])
app.include_router(ai_advisory_router, prefix="/api/v1", tags=["ai_advisory"])
app.include_router(accounting_router, prefix="/api/v1", tags=["accounting"])
app.include_router(executive_bi_router, prefix="/api/v1", tags=["executive_bi"])
app.include_router(chart_accounts_router, prefix="/api/v1", tags=["accounting"])
app.include_router(currencies_router, prefix="/api/v1", tags=["accounting"])
app.include_router(payment_terms_router, prefix="/api/v1", tags=["accounting"])
app.include_router(vouchers_router, prefix="/api/v1", tags=["accounting"])
app.include_router(customer_performance_router, prefix="/api/v1", tags=["customers"])
app.include_router(suppliers_router, prefix="/api/v1", tags=["suppliers"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Mezan ERP System API",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT,
    }
