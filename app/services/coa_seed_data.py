"""Hierarchical Chart of Accounts seed definition (Phase 2).

Preserves legacy system posting codes (1000, 1110, 2010, …) while nesting them
under group accounts for balance-sheet / income-statement presentation.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models.chart_accounts import AccountType, SubledgerKind


@dataclass(frozen=True)
class CoaSeedNode:
    code: str
    name_en: str
    name_ar: str
    account_type: AccountType
    is_control: bool = False
    is_system: bool = False
    subledger_kind: SubledgerKind = SubledgerKind.NONE
    children: tuple[CoaSeedNode, ...] = field(default_factory=tuple)


def _leaf(
    code: str,
    name_en: str,
    name_ar: str,
    account_type: AccountType,
    *,
    is_system: bool = False,
    subledger_kind: SubledgerKind = SubledgerKind.NONE,
) -> CoaSeedNode:
    return CoaSeedNode(
        code=code,
        name_en=name_en,
        name_ar=name_ar,
        account_type=account_type,
        is_control=False,
        is_system=is_system,
        subledger_kind=subledger_kind,
    )


def _group(
    code: str,
    name_en: str,
    name_ar: str,
    account_type: AccountType,
    children: tuple[CoaSeedNode, ...],
    *,
    is_system: bool = False,
    subledger_kind: SubledgerKind = SubledgerKind.NONE,
) -> CoaSeedNode:
    return CoaSeedNode(
        code=code,
        name_en=name_en,
        name_ar=name_ar,
        account_type=account_type,
        is_control=True,
        is_system=is_system,
        subledger_kind=subledger_kind,
        children=children,
    )


COA_SEED_FOREST: tuple[CoaSeedNode, ...] = (
    _group(
        "10000",
        "Assets",
        "الأصول",
        AccountType.ASSET,
        (
            _group(
                "11000",
                "Current Assets",
                "الأصول المتداولة",
                AccountType.ASSET,
                (
                    _group(
                        "10100",
                        "Cash and Cash Equivalents",
                        "النقد وما يعادله",
                        AccountType.ASSET,
                        (
                            _leaf(
                                "1000",
                                "Cash on Hand",
                                "النقدية بالصندوق",
                                AccountType.ASSET,
                                is_system=True,
                            ),
                            _leaf(
                                "1010",
                                "Card Clearing",
                                "تسوية البطاقات",
                                AccountType.ASSET,
                                is_system=True,
                            ),
                            _leaf(
                                "1015",
                                "Other Payments Clearing",
                                "تسوية وسائل الدفع الأخرى",
                                AccountType.ASSET,
                                is_system=True,
                            ),
                        ),
                        is_system=True,
                    ),
                    _group(
                        "10200",
                        "Bank Accounts",
                        "الحسابات البنكية",
                        AccountType.ASSET,
                        (),
                        is_system=True,
                    ),
                    _group(
                        "11200",
                        "Accounts Receivable",
                        "الذمم المدينة",
                        AccountType.ASSET,
                        (
                            _group(
                                "1100",
                                "Accounts Receivable (control)",
                                "ذمم مدينة (ملخص)",
                                AccountType.ASSET,
                                (
                                    _leaf(
                                        "1110",
                                        "Trade Receivables",
                                        "ذمم تجارية",
                                        AccountType.ASSET,
                                        is_system=True,
                                        subledger_kind=SubledgerKind.CUSTOMER,
                                    ),
                                ),
                                is_system=True,
                                subledger_kind=SubledgerKind.CUSTOMER,
                            ),
                        ),
                        is_system=True,
                    ),
                    _group(
                        "12000",
                        "Inventory",
                        "المخزون",
                        AccountType.ASSET,
                        (_leaf("1200", "Inventory", "المخزون", AccountType.ASSET, is_system=True),),
                        is_system=True,
                    ),
                    _group(
                        "13000",
                        "Prepaid Expenses",
                        "مصروفات مدفوعة مقدماً",
                        AccountType.ASSET,
                        (_leaf("1300", "Prepaid Expenses", "مصروفات مقدمة", AccountType.ASSET),),
                        is_system=True,
                    ),
                    _group(
                        "13100",
                        "Work in Progress",
                        "أعمال تحت التنفيذ",
                        AccountType.ASSET,
                        (
                            _leaf(
                                "1310",
                                "WIP Inventory",
                                "مخزون تحت التنفيذ",
                                AccountType.ASSET,
                                is_system=True,
                            ),
                        ),
                        is_system=True,
                    ),
                ),
                is_system=True,
            ),
            _group(
                "15000",
                "Non-Current Assets",
                "الأصول غير المتداولة",
                AccountType.ASSET,
                (
                    _leaf("1510", "Land", "الأراضي", AccountType.ASSET),
                    _leaf("1520", "Buildings", "المباني", AccountType.ASSET),
                    _leaf("1530", "Vehicles", "المركبات", AccountType.ASSET),
                    _leaf("1540", "Equipment and Machinery", "المعدات والآلات", AccountType.ASSET),
                    _leaf("1550", "Electronic Devices", "الأجهزة الإلكترونية", AccountType.ASSET),
                ),
                is_system=True,
            ),
        ),
        is_system=True,
    ),
    _group(
        "20000",
        "Liabilities",
        "الخصوم",
        AccountType.LIABILITY,
        (
            _group(
                "21000",
                "Current Liabilities",
                "الخصوم المتداولة",
                AccountType.LIABILITY,
                (
                    _group(
                        "21200",
                        "Accounts Payable",
                        "الذمم الدائنة",
                        AccountType.LIABILITY,
                        (
                            _group(
                                "2000",
                                "Accounts Payable (control)",
                                "ذمم دائنة (ملخص)",
                                AccountType.LIABILITY,
                                (
                                    _leaf(
                                        "2010",
                                        "Trade Payables",
                                        "ذمم موردين",
                                        AccountType.LIABILITY,
                                        is_system=True,
                                        subledger_kind=SubledgerKind.SUPPLIER,
                                    ),
                                ),
                                is_system=True,
                                subledger_kind=SubledgerKind.SUPPLIER,
                            ),
                        ),
                        is_system=True,
                    ),
                    _group(
                        "21300",
                        "Payroll Liabilities",
                        "التزامات الرواتب",
                        AccountType.LIABILITY,
                        (
                            _leaf(
                                "2100",
                                "Payroll Liability",
                                "التزامات رواتب",
                                AccountType.LIABILITY,
                                is_system=True,
                            ),
                            _leaf(
                                "2110",
                                "Payroll Deductions Payable",
                                "استقطاعات رواتب مستحقة",
                                AccountType.LIABILITY,
                                is_system=True,
                            ),
                        ),
                        is_system=True,
                    ),
                    _leaf(
                        "2200",
                        "Output VAT Payable",
                        "ضريبة مخرجات مستحقة",
                        AccountType.LIABILITY,
                        is_system=True,
                    ),
                    _leaf(
                        "2150",
                        "Loyalty Points Liability",
                        "التزامات نقاط الولاء",
                        AccountType.LIABILITY,
                        is_system=True,
                    ),
                    _group(
                        "21600",
                        "Accrued Expenses",
                        "مصروفات مستحقة",
                        AccountType.LIABILITY,
                        (
                            _leaf(
                                "2160", "Accrued Expenses", "مصروفات مستحقة", AccountType.LIABILITY
                            ),
                        ),
                    ),
                    _group(
                        "21700",
                        "Short-term Loans",
                        "قروض قصيرة الأجل",
                        AccountType.LIABILITY,
                        (_leaf("2170", "Short-term Loans", "قروض قصيرة", AccountType.LIABILITY),),
                    ),
                ),
                is_system=True,
            ),
            _group(
                "25000",
                "Non-Current Liabilities",
                "الخصوم غير المتداولة",
                AccountType.LIABILITY,
                (
                    _leaf("2510", "Long-term Loans", "قروض طويلة الأجل", AccountType.LIABILITY),
                    _leaf("2520", "External Financing", "تمويل خارجي", AccountType.LIABILITY),
                ),
                is_system=True,
            ),
        ),
        is_system=True,
    ),
    _group(
        "30000",
        "Equity",
        "حقوق الملكية",
        AccountType.EQUITY,
        (
            _leaf("3100", "Capital", "رأس المال", AccountType.EQUITY, is_system=True),
            _leaf("3200", "Drawings", "مسحوبات شخصية", AccountType.EQUITY),
            _leaf("3300", "Retained Earnings", "أرباح محتجزة", AccountType.EQUITY, is_system=True),
            _leaf(
                "3400",
                "Current Year Net Profit",
                "صافي ربح السنة الحالية",
                AccountType.EQUITY,
                is_system=True,
            ),
        ),
        is_system=True,
    ),
    _group(
        "40000",
        "Revenue",
        "الإيرادات",
        AccountType.REVENUE,
        (
            _leaf("4000", "Sales Revenue", "إيراد المبيعات", AccountType.REVENUE, is_system=True),
            _leaf("4100", "Service Revenue", "إيراد الخدمات", AccountType.REVENUE),
            _leaf("4200", "Sales Returns and Allowances", "مرتجعات المبيعات", AccountType.REVENUE),
            _leaf("4300", "Other Income", "إيرادات أخرى", AccountType.REVENUE),
            _leaf("5040", "Inventory Gain", "فائض جرد", AccountType.REVENUE, is_system=True),
        ),
        is_system=True,
    ),
    _group(
        "50000",
        "Expenses",
        "المصروفات",
        AccountType.EXPENSE,
        (
            _leaf(
                "5000",
                "Cost of Goods Sold",
                "تكلفة البضاعة المباعة",
                AccountType.EXPENSE,
                is_system=True,
            ),
            _leaf("5010", "Cost of Services", "تكلفة الخدمات", AccountType.EXPENSE),
            _leaf("5020", "Inventory Shortage", "عجز مخزون", AccountType.EXPENSE, is_system=True),
            _leaf("5030", "Inventory Damaged", "مخزون تالف", AccountType.EXPENSE, is_system=True),
            _leaf(
                "4090", "Sales Discounts", "خصومات المبيعات", AccountType.EXPENSE, is_system=True
            ),
            _group(
                "60000",
                "Operating Expenses",
                "مصروفات تشغيلية",
                AccountType.EXPENSE,
                (
                    _leaf(
                        "6000",
                        "Salary Expense",
                        "مصروف الرواتب",
                        AccountType.EXPENSE,
                        is_system=True,
                    ),
                    _leaf(
                        "6100",
                        "Loyalty / Marketing Expense",
                        "مصروف ولاء/تسويق",
                        AccountType.EXPENSE,
                        is_system=True,
                    ),
                    _leaf(
                        "1020",
                        "Cash Over and Short",
                        "فائض وعجز نقدي",
                        AccountType.EXPENSE,
                        is_system=True,
                    ),
                    _leaf("6040", "Rent Expense", "مصروف إيجار", AccountType.EXPENSE),
                    _leaf(
                        "6050",
                        "Other Expenses",
                        "مصروفات أخرى",
                        AccountType.EXPENSE,
                        is_system=True,
                    ),
                    _leaf("6060", "Bank Fees", "رسوم بنكية", AccountType.EXPENSE),
                    _leaf("6070", "Utilities", "مرافق", AccountType.EXPENSE),
                    _leaf(
                        "6080",
                        "Cash Rounding Differences",
                        "فروقات تقريب نقدي",
                        AccountType.EXPENSE,
                        is_system=True,
                    ),
                ),
                is_system=True,
            ),
        ),
        is_system=True,
    ),
)


# Maps AccountingSettings attribute -> chart account code (required vs optional).
SETTINGS_ACCOUNT_CODES: dict[str, tuple[str, bool]] = {
    "default_cash_account_id": ("1000", True),
    "default_card_clearing_account_id": ("1010", True),
    "default_other_clearing_account_id": ("1015", True),
    "default_ar_account_id": ("1110", True),
    "default_ap_account_id": ("2010", True),
    "default_inventory_account_id": ("1200", True),
    "default_cogs_account_id": ("5000", True),
    "default_sales_revenue_account_id": ("4000", True),
    "default_sales_discount_account_id": ("4090", True),
    "default_salary_expense_account_id": ("6000", True),
    "default_payroll_liability_account_id": ("2100", True),
    "default_payroll_deductions_payable_account_id": ("2110", True),
    "default_output_tax_payable_account_id": ("2200", True),
    "default_cash_over_short_account_id": ("1020", True),
    "default_loyalty_liability_account_id": ("2150", True),
    "default_loyalty_expense_account_id": ("6100", True),
    "default_wip_account_id": ("1310", False),
    "default_inventory_shortage_account_id": ("5020", False),
    "default_inventory_damaged_account_id": ("5030", False),
    "default_inventory_gain_account_id": ("5040", False),
    "default_other_expenses_account_id": ("6050", False),
    "default_rounding_difference_account_id": ("6080", False),
}


def iter_seed_nodes(
    nodes: tuple[CoaSeedNode, ...] | None = None,
    *,
    parent_code: str | None = None,
):
    """Yield (parent_code, node) depth-first."""
    forest = nodes if nodes is not None else COA_SEED_FOREST
    for node in forest:
        yield parent_code, node
        yield from iter_seed_nodes(node.children, parent_code=node.code)
