import { type ComponentType,lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import AdminLayoutOutlet from '@/components/layout/AdminLayoutOutlet';
import AuthLayoutOutlet from '@/components/layout/AuthLayoutOutlet';
import PosLayoutOutlet from '@/components/layout/PosLayoutOutlet';
import FeatureStub from '@/components/shared/FeatureStub';

import { RequireAuth, RequireBranchContext, RequirePermission } from './guards';
import RouteErrorBoundary from './RouteErrorBoundary';
import RouteLoader from './RouteLoader';

/*
 * React Router v7 data router. The route tree mirrors `WEB_FRONTEND_PLAN.md`
 * §4.1 one-to-one, with `RequirePermission` wrappers carrying the exact
 * `resource:action` strings from that document. Feature pages that have not
 * shipped yet render through `<FeatureStub />` so the routes remain navigable.
 */

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));
const OnboardingCompletePage = lazy(
  () => import('@/features/auth/pages/OnboardingCompletePage'),
);

const DashboardPage = lazy(() => import('@/features/bi/pages/DashboardPage'));

const ForbiddenPage = lazy(() => import('./ForbiddenPage'));
const NotFoundPage = lazy(() => import('./NotFoundPage'));
const OfflinePage = lazy(() => import('./OfflinePage'));
const SelectBranchPage = lazy(() => import('./SelectBranchPage'));

function withSuspense(Component: ComponentType): JSX.Element {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Component />
    </Suspense>
  );
}

function stub(labelKey: string, epic: string): JSX.Element {
  return (
    <Suspense fallback={<RouteLoader />}>
      <FeatureStub labelKey={labelKey} epic={epic} />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  // Public auth shell
  {
    element: <AuthLayoutOutlet />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/login', element: withSuspense(LoginPage) },
      { path: '/forgot-password', element: withSuspense(ForgotPasswordPage) },
      { path: '/reset-password/:token', element: withSuspense(ResetPasswordPage) },
      {
        path: '/onboarding/complete/:token',
        element: withSuspense(OnboardingCompletePage),
      },
    ],
  },

  // Authenticated POS runs in its own layout (Plan §4.2)
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <PosLayoutOutlet />,
        children: [
          {
            path: '/pos',
            element: (
              <RequirePermission resource="pos_carts" action="create">
                <RequireBranchContext>
                  {stub('nav.pos', 'W-5.1')}
                </RequireBranchContext>
              </RequirePermission>
            ),
          },
        ],
      },
    ],
  },

  // Branch-picker stub (used by RequireBranchContext)
  {
    path: '/select-branch',
    element: (
      <RequireAuth>
        <Suspense fallback={<RouteLoader />}>
          <SelectBranchPage />
        </Suspense>
      </RequireAuth>
    ),
    errorElement: <RouteErrorBoundary />,
  },

  // Admin shell — everything authenticated that is not POS
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AdminLayoutOutlet />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: '/dashboard',
            element: (
              <RequirePermission resource="bi" action="read">
                {withSuspense(DashboardPage)}
              </RequirePermission>
            ),
          },

          // Catalog
          {
            path: '/catalog',
            children: [
              { index: true, element: <Navigate to="/catalog/products" replace /> },
              {
                path: 'products',
                element: (
                  <RequirePermission resource="catalog" action="read">
                    {stub('nav.catalog_products', 'W-5.3')}
                  </RequirePermission>
                ),
              },
              {
                path: 'categories',
                element: (
                  <RequirePermission resource="catalog" action="read">
                    {stub('nav.catalog_categories', 'W-5.3')}
                  </RequirePermission>
                ),
              },
              {
                path: 'price-lists',
                element: (
                  <RequirePermission resource="catalog" action="update">
                    {stub('nav.catalog_price_lists', 'W-5.3')}
                  </RequirePermission>
                ),
              },
            ],
          },

          // Inventory
          {
            path: '/inventory',
            children: [
              { index: true, element: <Navigate to="/inventory/stock" replace /> },
              {
                path: 'stock',
                element: (
                  <RequirePermission resource="inventory" action="read">
                    {stub('nav.inventory_stock', 'W-5.3')}
                  </RequirePermission>
                ),
              },
              {
                path: 'adjustments',
                element: (
                  <RequirePermission resource="stock_adjustments" action="read">
                    {stub('nav.inventory_adjustments', 'W-5.3')}
                  </RequirePermission>
                ),
              },
              {
                path: 'transfers',
                element: (
                  <RequirePermission resource="inventory" action="read">
                    {stub('nav.inventory_transfers', 'W-5.3')}
                  </RequirePermission>
                ),
              },
              {
                path: 'scans',
                element: (
                  <RequirePermission resource="invoice_scans" action="read">
                    {stub('nav.inventory_scans', 'W-5.4')}
                  </RequirePermission>
                ),
              },
            ],
          },

          // Purchasing
          {
            path: '/purchasing',
            children: [
              { index: true, element: <Navigate to="/purchasing/orders" replace /> },
              {
                path: 'orders',
                element: (
                  <RequirePermission resource="purchase_orders" action="read">
                    {stub('nav.purchasing_orders', 'W-5.4')}
                  </RequirePermission>
                ),
              },
              {
                path: 'suppliers',
                element: (
                  <RequirePermission resource="suppliers" action="read">
                    {stub('nav.purchasing_suppliers', 'W-5.4')}
                  </RequirePermission>
                ),
              },
              {
                path: 'goods-receipts',
                element: (
                  <RequirePermission resource="invoice_scans" action="validate">
                    {stub('nav.purchasing_goods_receipts', 'W-5.4')}
                  </RequirePermission>
                ),
              },
            ],
          },

          // HR
          {
            path: '/hr',
            children: [
              { index: true, element: <Navigate to="/hr/employees" replace /> },
              {
                path: 'employees',
                element: (
                  <RequirePermission resource="employees" action="read">
                    {stub('nav.hr_employees', 'W-5.5')}
                  </RequirePermission>
                ),
              },
              {
                path: 'attendance',
                element: (
                  <RequirePermission resource="employees" action="read">
                    {stub('nav.hr_attendance', 'W-5.5')}
                  </RequirePermission>
                ),
              },
              {
                path: 'leave',
                element: (
                  <RequirePermission resource="employees" action="read">
                    {stub('nav.hr_leave', 'W-5.5')}
                  </RequirePermission>
                ),
              },
            ],
          },

          // Payroll
          {
            path: '/payroll',
            children: [
              { index: true, element: <Navigate to="/payroll/runs" replace /> },
              {
                path: 'runs',
                element: (
                  <RequirePermission resource="payroll" action="read">
                    {stub('nav.payroll_runs', 'W-5.5')}
                  </RequirePermission>
                ),
              },
              {
                path: 'approvals',
                element: (
                  <RequirePermission resource="payroll" action="approve">
                    {stub('nav.payroll_approvals', 'W-5.5')}
                  </RequirePermission>
                ),
              },
            ],
          },

          // Accounting
          {
            path: '/accounting',
            children: [
              { index: true, element: <Navigate to="/accounting/journal" replace /> },
              {
                path: 'journal',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {stub('nav.accounting_journal', 'W-5.6')}
                  </RequirePermission>
                ),
              },
              {
                path: 'trial-balance',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {stub('nav.accounting_trial_balance', 'W-5.6')}
                  </RequirePermission>
                ),
              },
              {
                path: 'income-statement',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {stub('nav.accounting_income_statement', 'W-5.6')}
                  </RequirePermission>
                ),
              },
              {
                path: 'balance-sheet',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {stub('nav.accounting_balance_sheet', 'W-5.6')}
                  </RequirePermission>
                ),
              },
              {
                path: 'general-ledger',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {stub('nav.accounting_general_ledger', 'W-5.6')}
                  </RequirePermission>
                ),
              },
              {
                path: 'ar',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {stub('nav.accounting_ar', 'W-5.6')}
                  </RequirePermission>
                ),
              },
              {
                path: 'ap',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {stub('nav.accounting_ap', 'W-5.6')}
                  </RequirePermission>
                ),
              },
              {
                path: 'fiscal-periods',
                element: (
                  <RequirePermission resource="accounting" action="update">
                    {stub('nav.accounting_fiscal_periods', 'W-5.6')}
                  </RequirePermission>
                ),
              },
            ],
          },

          // CRM
          {
            path: '/crm',
            children: [
              { index: true, element: <Navigate to="/crm/customers" replace /> },
              {
                path: 'customers',
                element: (
                  <RequirePermission resource="customers" action="create">
                    {stub('nav.crm_customers', 'W-5.7')}
                  </RequirePermission>
                ),
              },
              {
                path: 'loyalty',
                element: (
                  <RequirePermission resource="loyalty" action="read">
                    {stub('nav.crm_loyalty', 'W-5.7')}
                  </RequirePermission>
                ),
              },
              {
                path: 'discounts',
                element: (
                  <RequirePermission resource="discounts" action="read">
                    {stub('nav.crm_discounts', 'W-5.7')}
                  </RequirePermission>
                ),
              },
            ],
          },

          // Marketing
          {
            path: '/marketing',
            children: [
              { index: true, element: <Navigate to="/marketing/analytics" replace /> },
              {
                path: 'analytics',
                element: (
                  <RequirePermission resource="analytics" action="read">
                    {stub('nav.marketing_analytics', 'W-5.7')}
                  </RequirePermission>
                ),
              },
              {
                path: 'advisory',
                element: (
                  <RequirePermission resource="marketing_advisory" action="run">
                    {stub('nav.marketing_advisory', 'W-5.7')}
                  </RequirePermission>
                ),
              },
              {
                path: 'campaigns',
                element: (
                  <RequirePermission resource="ai_advisory" action="run">
                    {stub('nav.marketing_campaigns', 'W-5.7')}
                  </RequirePermission>
                ),
              },
            ],
          },

          // AI advisory
          {
            path: '/ai',
            children: [
              {
                index: true,
                element: <Navigate to="/ai/purchase-reorder" replace />,
              },
              {
                path: 'purchase-reorder',
                element: (
                  <RequirePermission resource="ai_advisory" action="run">
                    {stub('nav.ai_purchase_reorder', 'W-5.7')}
                  </RequirePermission>
                ),
              },
              {
                path: 'hr-anomalies',
                element: (
                  <RequirePermission resource="ai_advisory" action="run">
                    {stub('nav.ai_hr_anomalies', 'W-5.7')}
                  </RequirePermission>
                ),
              },
              {
                path: 'invoice-match',
                element: (
                  <RequirePermission resource="ai_advisory" action="run">
                    {stub('nav.ai_invoice_match', 'W-5.7')}
                  </RequirePermission>
                ),
              },
            ],
          },

          // Admin
          {
            path: '/admin',
            children: [
              { index: true, element: <Navigate to="/admin/users" replace /> },
              {
                path: 'users',
                element: (
                  <RequirePermission resource="users" action="read">
                    {stub('nav.admin_users', 'W-5.9')}
                  </RequirePermission>
                ),
              },
              {
                path: 'roles',
                element: (
                  <RequirePermission resource="roles" action="read">
                    {stub('nav.admin_roles', 'W-5.9')}
                  </RequirePermission>
                ),
              },
              {
                path: 'branches',
                element: (
                  <RequirePermission resource="branches" action="read">
                    {stub('nav.admin_branches', 'W-5.9')}
                  </RequirePermission>
                ),
              },
              {
                path: 'terminals',
                element: (
                  <RequirePermission resource="terminals" action="read">
                    {stub('nav.admin_terminals', 'W-5.9')}
                  </RequirePermission>
                ),
              },
              {
                path: 'backups',
                element: (
                  <RequirePermission resource="backups" action="read">
                    {stub('nav.admin_backups', 'W-5.9')}
                  </RequirePermission>
                ),
              },
              {
                path: 'notifications',
                element: (
                  <RequirePermission resource="config" action="read">
                    {stub('nav.admin_notifications', 'W-5.9')}
                  </RequirePermission>
                ),
              },
            ],
          },
        ],
      },
    ],
  },

  // Global error routes — mounted without layout so they work even when the
  // sidebar/topbar themselves would error.
  {
    path: '/403',
    element: (
      <Suspense fallback={<RouteLoader />}>
        <ForbiddenPage />
      </Suspense>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/404',
    element: (
      <Suspense fallback={<RouteLoader />}>
        <NotFoundPage />
      </Suspense>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/offline',
    element: (
      <Suspense fallback={<RouteLoader />}>
        <OfflinePage />
      </Suspense>
    ),
    errorElement: <RouteErrorBoundary />,
  },

  // Catch-all: unknown paths land on /404.
  {
    path: '*',
    element: (
      <Suspense fallback={<RouteLoader />}>
        <NotFoundPage />
      </Suspense>
    ),
    errorElement: <RouteErrorBoundary />,
  },
]);
