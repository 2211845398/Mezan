import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  ClipboardList,
  Heart,
  LayoutDashboard,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';

/*
 * Typed navigation tree for AdminLayout's sidebar. The `permission` field is
 * metadata only in W-1 — RBAC enforcement lands in Epic W-2 (`<Can />` and
 * `<ProtectedRoute />`). The route hierarchy here mirrors WEB_FRONTEND_PLAN
 * §4.1 one-to-one.
 */

export type Permission = {
  resource: string;
  action: string;
};

export type NavSection = 'ops' | 'finance' | 'people' | 'growth' | 'system';

export type NavItem = {
  key: string;
  labelKey: string;
  icon: LucideIcon;
  href: string;
  permission?: Permission;
  /** Optional grouping label in the sidebar (top-level items only). */
  section?: NavSection;
  children?: NavItem[];
};

export const navigation: NavItem[] = [
  {
    key: 'dashboard',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    href: '/dashboard',
    section: 'ops',
    permission: { resource: 'analytics', action: 'read' },
  },
  {
    key: 'pos',
    labelKey: 'nav.pos',
    icon: ShoppingCart,
    href: '/pos',
    section: 'ops',
    permission: { resource: 'pos_carts', action: 'create' },
  },
  {
    key: 'catalog',
    labelKey: 'nav.catalog',
    icon: ShoppingBag,
    href: '/catalog',
    section: 'ops',
    children: [
      {
        key: 'catalog-products',
        labelKey: 'nav.catalog_products',
        icon: ShoppingBag,
        href: '/catalog/products',
        permission: { resource: 'catalog', action: 'read' },
      },
      {
        key: 'catalog-categories',
        labelKey: 'nav.catalog_categories',
        icon: ShoppingBag,
        href: '/catalog/categories',
        permission: { resource: 'catalog', action: 'read' },
      },
      {
        key: 'catalog-price-lists',
        labelKey: 'nav.catalog_price_lists',
        icon: ShoppingBag,
        href: '/catalog/price-lists',
        permission: { resource: 'catalog', action: 'read' },
      },
    ],
  },
  {
    key: 'inventory',
    labelKey: 'nav.inventory',
    icon: Boxes,
    href: '/inventory',
    section: 'ops',
    children: [
      {
        key: 'inventory-stock',
        labelKey: 'nav.inventory_stock',
        icon: Boxes,
        href: '/inventory/stock',
        permission: { resource: 'inventory', action: 'read' },
      },
      {
        key: 'inventory-adjustments',
        labelKey: 'nav.inventory_adjustments',
        icon: Boxes,
        href: '/inventory/adjustments',
        permission: { resource: 'stock_adjustments', action: 'read' },
      },
      {
        key: 'inventory-transfers',
        labelKey: 'nav.inventory_transfers',
        icon: Boxes,
        href: '/inventory/transfers',
        permission: { resource: 'inventory', action: 'read' },
      },
      {
        key: 'inventory-scans',
        labelKey: 'nav.inventory_scans',
        icon: Boxes,
        href: '/inventory/scans',
        permission: { resource: 'invoice_scans', action: 'read' },
      },
    ],
  },
  {
    key: 'purchasing',
    labelKey: 'nav.purchasing',
    icon: ClipboardList,
    href: '/purchasing',
    section: 'ops',
    children: [
      {
        key: 'purchasing-orders',
        labelKey: 'nav.purchasing_orders',
        icon: ClipboardList,
        href: '/purchasing/orders',
        permission: { resource: 'purchase_orders', action: 'read' },
      },
      {
        key: 'purchasing-suppliers',
        labelKey: 'nav.purchasing_suppliers',
        icon: ClipboardList,
        href: '/purchasing/suppliers',
        permission: { resource: 'suppliers', action: 'read' },
      },
      {
        key: 'purchasing-invoice-match',
        labelKey: 'nav.purchasing_invoice_match',
        icon: ClipboardList,
        href: '/purchasing/invoice-match',
        permission: { resource: 'invoice_scans', action: 'validate' },
      },
    ],
  },
  {
    key: 'hr',
    labelKey: 'nav.hr',
    icon: Users,
    href: '/hr',
    section: 'people',
    children: [
      {
        key: 'hr-employees',
        labelKey: 'nav.hr_employees',
        icon: Users,
        href: '/hr/employees',
        permission: { resource: 'employees', action: 'read' },
      },
      {
        key: 'hr-attendance',
        labelKey: 'nav.hr_attendance',
        icon: Users,
        href: '/hr/attendance',
        permission: { resource: 'employees', action: 'read' },
      },
      {
        key: 'hr-leave',
        labelKey: 'nav.hr_leave',
        icon: Users,
        href: '/hr/leave',
        permission: { resource: 'employees', action: 'read' },
      },
      {
        key: 'hr-anomalies',
        labelKey: 'nav.hr_anomalies',
        icon: Users,
        href: '/hr/anomalies',
        permission: { resource: 'ai_advisory', action: 'run' },
      },
    ],
  },
  {
    key: 'payroll',
    labelKey: 'nav.payroll',
    icon: Wallet,
    href: '/payroll',
    section: 'people',
    children: [
      {
        key: 'payroll-runs',
        labelKey: 'nav.payroll_runs',
        icon: Wallet,
        href: '/payroll/runs',
        permission: { resource: 'payroll', action: 'read' },
      },
      {
        key: 'payroll-approvals',
        labelKey: 'nav.payroll_approvals',
        icon: Wallet,
        href: '/payroll/approvals',
        permission: { resource: 'payroll', action: 'approve' },
      },
    ],
  },
  {
    key: 'accounting',
    labelKey: 'nav.accounting',
    icon: Calculator,
    href: '/accounting',
    section: 'finance',
    children: [
      {
        key: 'accounting-journal',
        labelKey: 'nav.accounting_journal',
        icon: Calculator,
        href: '/accounting/journal',
        permission: { resource: 'accounting', action: 'read' },
      },
      {
        key: 'accounting-trial-balance',
        labelKey: 'nav.accounting_trial_balance',
        icon: Calculator,
        href: '/accounting/trial-balance',
        permission: { resource: 'accounting', action: 'read' },
      },
      {
        key: 'accounting-income-statement',
        labelKey: 'nav.accounting_income_statement',
        icon: Calculator,
        href: '/accounting/income-statement',
        permission: { resource: 'accounting', action: 'read' },
      },
      {
        key: 'accounting-balance-sheet',
        labelKey: 'nav.accounting_balance_sheet',
        icon: Calculator,
        href: '/accounting/balance-sheet',
        permission: { resource: 'accounting', action: 'read' },
      },
      {
        key: 'accounting-general-ledger',
        labelKey: 'nav.accounting_general_ledger',
        icon: Calculator,
        href: '/accounting/general-ledger',
        permission: { resource: 'accounting', action: 'read' },
      },
      {
        key: 'accounting-ar',
        labelKey: 'nav.accounting_ar',
        icon: Calculator,
        href: '/accounting/ar',
        permission: { resource: 'accounting', action: 'read' },
      },
      {
        key: 'accounting-ap',
        labelKey: 'nav.accounting_ap',
        icon: Calculator,
        href: '/accounting/ap',
        permission: { resource: 'accounting', action: 'read' },
      },
      {
        key: 'accounting-fiscal-periods',
        labelKey: 'nav.accounting_fiscal_periods',
        icon: Calculator,
        href: '/accounting/fiscal-periods',
        permission: { resource: 'accounting', action: 'update' },
      },
    ],
  },
  {
    key: 'crm',
    labelKey: 'nav.crm',
    icon: Heart,
    href: '/crm',
    section: 'growth',
    children: [
      {
        key: 'crm-customers',
        labelKey: 'nav.crm_customers',
        icon: Heart,
        href: '/crm/customers',
        permission: { resource: 'customers', action: 'create' },
      },
      {
        key: 'crm-loyalty',
        labelKey: 'nav.crm_loyalty',
        icon: Heart,
        href: '/crm/loyalty',
        permission: { resource: 'loyalty', action: 'read' },
      },
      {
        key: 'crm-discounts',
        labelKey: 'nav.crm_discounts',
        icon: Heart,
        href: '/crm/discounts',
        permission: { resource: 'discounts', action: 'read' },
      },
    ],
  },
  {
    key: 'marketing',
    labelKey: 'nav.marketing',
    icon: Sparkles,
    href: '/marketing',
    section: 'growth',
    children: [
      {
        key: 'marketing-analytics',
        labelKey: 'nav.marketing_analytics',
        icon: Sparkles,
        href: '/marketing/analytics',
        permission: { resource: 'analytics', action: 'read' },
      },
      {
        key: 'marketing-advisory',
        labelKey: 'nav.marketing_advisory',
        icon: Sparkles,
        href: '/marketing/advisory',
        permission: { resource: 'marketing_advisory', action: 'run' },
      },
      {
        key: 'marketing-campaigns',
        labelKey: 'nav.marketing_campaigns',
        icon: Sparkles,
        href: '/marketing/campaigns',
        permission: { resource: 'ai_advisory', action: 'run' },
      },
    ],
  },
  {
    key: 'ai',
    labelKey: 'nav.ai',
    icon: Sparkles,
    href: '/ai',
    section: 'growth',
    children: [
      {
        key: 'ai-purchase-reorder',
        labelKey: 'nav.ai_purchase_reorder',
        icon: Sparkles,
        href: '/ai/purchase-reorder',
        permission: { resource: 'ai_advisory', action: 'run' },
      },
      {
        key: 'ai-hr-anomalies',
        labelKey: 'nav.ai_hr_anomalies',
        icon: Sparkles,
        href: '/ai/hr-anomalies',
        permission: { resource: 'ai_advisory', action: 'run' },
      },
      {
        key: 'ai-invoice-match',
        labelKey: 'nav.ai_invoice_match',
        icon: Sparkles,
        href: '/ai/invoice-match',
        permission: { resource: 'ai_advisory', action: 'run' },
      },
    ],
  },
  {
    key: 'admin',
    labelKey: 'nav.admin',
    icon: Briefcase,
    href: '/admin',
    section: 'system',
    children: [
      {
        key: 'admin-users',
        labelKey: 'nav.admin_users',
        icon: Users,
        href: '/admin/users',
        permission: { resource: 'users', action: 'read' },
      },
      {
        key: 'admin-roles',
        labelKey: 'nav.admin_roles',
        icon: Briefcase,
        href: '/admin/roles',
        permission: { resource: 'roles', action: 'read' },
      },
      {
        key: 'admin-branches',
        labelKey: 'nav.admin_branches',
        icon: Building2,
        href: '/admin/branches',
        permission: { resource: 'branches', action: 'read' },
      },
      {
        key: 'admin-terminals',
        labelKey: 'nav.admin_terminals',
        icon: Receipt,
        href: '/admin/terminals',
        permission: { resource: 'terminals', action: 'read' },
      },
      {
        key: 'admin-backups',
        labelKey: 'nav.admin_backups',
        icon: Briefcase,
        href: '/admin/backups',
        permission: { resource: 'backups', action: 'read' },
      },
      {
        key: 'admin-notifications',
        labelKey: 'nav.admin_notifications',
        icon: Briefcase,
        href: '/admin/notifications',
        permission: { resource: 'config', action: 'read' },
      },
    ],
  },
];
