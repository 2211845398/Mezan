"""API v1 routers package."""

from app.api.v1.accounting import router as accounting_router
from app.api.v1.ai_advisory import router as ai_advisory_router
from app.api.v1.attributes import router as attributes_router
from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.backups import router as backups_router
from app.api.v1.branches import router as branches_router
from app.api.v1.carts import router as carts_router
from app.api.v1.catalog import router as catalog_router
from app.api.v1.chart_accounts import router as chart_accounts_router
from app.api.v1.config import router as config_router
from app.api.v1.currencies import router as currencies_router
from app.api.v1.customer_performance import router as customer_performance_router
from app.api.v1.customers import router as customers_router
from app.api.v1.discounts import router as discounts_router
from app.api.v1.employees import router as employees_router
from app.api.v1.endpoints import router as users_router
from app.api.v1.executive_bi import router as executive_bi_router
from app.api.v1.fx_revaluation import router as fx_revaluation_router
from app.api.v1.goods_receipts import router as goods_receipts_router
from app.api.v1.health import router as health_router
from app.api.v1.inventory_adjustments import router as inventory_adjustments_router
from app.api.v1.inventory_operations import router as inventory_operations_router
from app.api.v1.inventory_reporting import router as inventory_reporting_router
from app.api.v1.invoice_scans import router as invoice_scans_router
from app.api.v1.loyalty import router as loyalty_router
from app.api.v1.loyalty_rules import router as loyalty_rules_router
from app.api.v1.marketing import router as marketing_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.payments import router as payments_router
from app.api.v1.payment_terms import router as payment_terms_router
from app.api.v1.payroll import router as payroll_router
from app.api.v1.pos_shifts import router as pos_shifts_router
from app.api.v1.price_lists import router as price_lists_router
from app.api.v1.production_orders import router as production_orders_router
from app.api.v1.purchase_orders import router as purchase_orders_router
from app.api.v1.returns import router as returns_router
from app.api.v1.roles import router as roles_router
from app.api.v1.sales import router as sales_router
from app.api.v1.suppliers import router as suppliers_router
from app.api.v1.terminals import router as terminals_router
from app.api.v1.transfers import router as transfers_router
from app.api.v1.vouchers import router as vouchers_router

__all__ = [
    "accounting_router",
    "ai_advisory_router",
    "attributes_router",
    "audit_router",
    "auth_router",
    "backups_router",
    "branches_router",
    "catalog_router",
    "carts_router",
    "chart_accounts_router",
    "config_router",
    "currencies_router",
    "customer_performance_router",
    "customers_router",
    "discounts_router",
    "employees_router",
    "executive_bi_router",
    "fx_revaluation_router",
    "goods_receipts_router",
    "health_router",
    "inventory_adjustments_router",
    "inventory_operations_router",
    "inventory_reporting_router",
    "invoice_scans_router",
    "loyalty_router",
    "loyalty_rules_router",
    "marketing_router",
    "notifications_router",
    "payroll_router",
    "payment_terms_router",
    "payments_router",
    "price_lists_router",
    "pos_shifts_router",
    "production_orders_router",
    "purchase_orders_router",
    "returns_router",
    "roles_router",
    "sales_router",
    "suppliers_router",
    "terminals_router",
    "transfers_router",
    "users_router",
    "vouchers_router",
]
