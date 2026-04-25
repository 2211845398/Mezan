import { type ComponentType,lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import AdminLayoutOutlet from '@/components/layout/AdminLayoutOutlet';
import AuthLayoutOutlet from '@/components/layout/AuthLayoutOutlet';
import PosLayout from '@/components/layout/PosLayout';
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

const ShiftGatePage = lazy(() => import('@/features/pos/pages/ShiftGate'));
const PosRegisterPage = lazy(() => import('@/features/pos/pages/PosRegister'));
const ShiftClosePage = lazy(() => import('@/features/pos/pages/ShiftClose'));
const InvoiceLookupPage = lazy(() => import('@/features/pos/pages/InvoiceLookup'));

const AdminUsersList = lazy(() => import('@/features/admin/pages/users/UsersList'));
const AdminUserCreate = lazy(() => import('@/features/admin/pages/users/UserCreate'));
const AdminUserEdit = lazy(() => import('@/features/admin/pages/users/UserEdit'));
const AdminRolesList = lazy(() => import('@/features/admin/pages/roles/RolesList'));
const AdminRoleEdit = lazy(() => import('@/features/admin/pages/roles/RoleEdit'));
const AdminBranchesList = lazy(() => import('@/features/admin/pages/branches/BranchesList'));
const AdminTerminalsList = lazy(() => import('@/features/admin/pages/terminals/TerminalsList'));
const AdminBackupsList = lazy(() => import('@/features/admin/pages/backups/BackupsList'));
const AdminNotificationsLayout = lazy(
  () => import('@/features/admin/pages/notifications/NotificationsLayout'),
);
const AdminTemplatesList = lazy(
  () => import('@/features/admin/pages/notifications/TemplatesList'),
);
const AdminTemplateEditPage = lazy(
  () => import('@/features/admin/pages/notifications/TemplateEditPage'),
);
const AdminSchedulesList = lazy(
  () => import('@/features/admin/pages/notifications/SchedulesList'),
);
const AdminRunsList = lazy(() => import('@/features/admin/pages/notifications/RunsList'));

const CatalogProductsList = lazy(() => import('@/features/catalog/pages/products/ProductsList'));
const CatalogCategoriesTree = lazy(() => import('@/features/catalog/pages/categories/CategoriesTree'));
const CatalogPriceListsList = lazy(() => import('@/features/catalog/pages/price-lists/PriceListsList'));
const CatalogPriceListEdit = lazy(() => import('@/features/catalog/pages/price-lists/PriceListEdit'));

const InventoryStockOnHand = lazy(() => import('@/features/inventory/pages/stock/StockOnHand'));
const InventoryAdjustmentsList = lazy(
  () => import('@/features/inventory/pages/adjustments/AdjustmentsList'),
);
const InventoryAdjustmentForm = lazy(
  () => import('@/features/inventory/pages/adjustments/AdjustmentForm'),
);
const InventoryTransfersList = lazy(() => import('@/features/inventory/pages/transfers/TransfersList'));
const InventoryTransferForm = lazy(() => import('@/features/inventory/pages/transfers/TransferForm'));
const InventoryScansList = lazy(() => import('@/features/inventory/pages/scans/ScansList'));
const InventoryScanReview = lazy(() => import('@/features/inventory/pages/scans/ScanReview'));

const PurchasingOrdersList = lazy(() => import('@/features/purchasing/pages/orders/OrdersList'));
const PurchasingOrderForm = lazy(() => import('@/features/purchasing/pages/orders/OrderForm'));
const PurchasingOrderDetail = lazy(() => import('@/features/purchasing/pages/orders/OrderDetail'));
const PurchasingSuppliersList = lazy(() => import('@/features/purchasing/pages/suppliers/SuppliersList'));
const PurchasingSupplierForm = lazy(() => import('@/features/purchasing/pages/suppliers/SupplierForm'));
const PurchasingMatchQueue = lazy(() => import('@/features/purchasing/pages/invoice-match/MatchQueue'));
const PurchasingMatchReview = lazy(() => import('@/features/purchasing/pages/invoice-match/MatchReview'));

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
        path: 'pos',
        element: (
          <RequireBranchContext>
            <Suspense fallback={<RouteLoader />}>
              <PosLayout />
            </Suspense>
          </RequireBranchContext>
        ),
        children: [
          {
            index: true,
            element: (
              <RequirePermission resource="pos_shifts" action="read">
                {withSuspense(ShiftGatePage)}
              </RequirePermission>
            ),
          },
          {
            path: 'register',
            element: (
              <RequirePermission resource="pos_carts" action="update">
                {withSuspense(PosRegisterPage)}
              </RequirePermission>
            ),
          },
          {
            path: 'close',
            element: (
              <RequirePermission resource="pos_shifts" action="close">
                {withSuspense(ShiftClosePage)}
              </RequirePermission>
            ),
          },
          {
            path: 'invoices',
            element: (
              <RequirePermission resource="sales_invoices" action="read">
                {withSuspense(InvoiceLookupPage)}
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
              <RequirePermission resource="analytics" action="read">
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
                    {withSuspense(CatalogProductsList)}
                  </RequirePermission>
                ),
              },
              {
                path: 'categories',
                element: (
                  <RequirePermission resource="catalog" action="read">
                    {withSuspense(CatalogCategoriesTree)}
                  </RequirePermission>
                ),
              },
              {
                path: 'price-lists',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="catalog" action="read">
                        {withSuspense(CatalogPriceListsList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="catalog" action="update">
                        {withSuspense(CatalogPriceListEdit)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="catalog" action="read">
                        {withSuspense(CatalogPriceListEdit)}
                      </RequirePermission>
                    ),
                  },
                ],
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
                    {withSuspense(InventoryStockOnHand)}
                  </RequirePermission>
                ),
              },
              {
                path: 'adjustments',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="stock_adjustments" action="read">
                        {withSuspense(InventoryAdjustmentsList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="stock_adjustments" action="create">
                        {withSuspense(InventoryAdjustmentForm)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'transfers',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="inventory" action="read">
                        {withSuspense(InventoryTransfersList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="inventory" action="update">
                        {withSuspense(InventoryTransferForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="inventory" action="read">
                        {withSuspense(InventoryTransferForm)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'scans',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="invoice_scans" action="read">
                        {withSuspense(InventoryScansList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="invoice_scans" action="read">
                        {withSuspense(InventoryScanReview)}
                      </RequirePermission>
                    ),
                  },
                ],
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
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="purchase_orders" action="read">
                        {withSuspense(PurchasingOrdersList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="purchase_orders" action="create">
                        {withSuspense(PurchasingOrderForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id/edit',
                    element: (
                      <RequirePermission resource="purchase_orders" action="update">
                        {withSuspense(PurchasingOrderForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="purchase_orders" action="read">
                        {withSuspense(PurchasingOrderDetail)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'suppliers',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="suppliers" action="read">
                        {withSuspense(PurchasingSuppliersList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="suppliers" action="create">
                        {withSuspense(PurchasingSupplierForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id/edit',
                    element: (
                      <RequirePermission resource="suppliers" action="update">
                        {withSuspense(PurchasingSupplierForm)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              { path: 'goods-receipts', element: <Navigate to="/purchasing/orders" replace /> },
              {
                path: 'invoice-match',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="invoice_scans" action="validate">
                        {withSuspense(PurchasingMatchQueue)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="invoice_scans" action="validate">
                        {withSuspense(PurchasingMatchReview)}
                      </RequirePermission>
                    ),
                  },
                ],
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
                    {withSuspense(AdminUsersList)}
                  </RequirePermission>
                ),
              },
              {
                path: 'users/new',
                element: (
                  <RequirePermission resource="users" action="create">
                    {withSuspense(AdminUserCreate)}
                  </RequirePermission>
                ),
              },
              {
                path: 'users/:id',
                element: (
                  <RequirePermission resource="users" action="read">
                    {withSuspense(AdminUserEdit)}
                  </RequirePermission>
                ),
              },
              {
                path: 'roles',
                element: (
                  <RequirePermission resource="roles" action="read">
                    {withSuspense(AdminRolesList)}
                  </RequirePermission>
                ),
              },
              {
                path: 'roles/:code',
                element: (
                  <RequirePermission resource="roles" action="read">
                    {withSuspense(AdminRoleEdit)}
                  </RequirePermission>
                ),
              },
              {
                path: 'branches',
                element: (
                  <RequirePermission resource="branches" action="read">
                    {withSuspense(AdminBranchesList)}
                  </RequirePermission>
                ),
              },
              {
                path: 'terminals',
                element: (
                  <RequirePermission resource="terminals" action="read">
                    {withSuspense(AdminTerminalsList)}
                  </RequirePermission>
                ),
              },
              {
                path: 'backups',
                element: (
                  <RequirePermission resource="backups" action="read">
                    {withSuspense(AdminBackupsList)}
                  </RequirePermission>
                ),
              },
              {
                path: 'notifications',
                element: (
                  <RequirePermission resource="config" action="read">
                    {withSuspense(AdminNotificationsLayout)}
                  </RequirePermission>
                ),
                children: [
                  { index: true, element: <Navigate to="templates" replace /> },
                  {
                    path: 'templates',
                    element: (
                      <RequirePermission resource="config" action="read">
                        {withSuspense(AdminTemplatesList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'templates/:kind',
                    element: (
                      <RequirePermission resource="config" action="read">
                        {withSuspense(AdminTemplateEditPage)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'schedules',
                    element: (
                      <RequirePermission resource="config" action="read">
                        {withSuspense(AdminSchedulesList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'runs',
                    element: (
                      <RequirePermission resource="config" action="read">
                        {withSuspense(AdminRunsList)}
                      </RequirePermission>
                    ),
                  },
                ],
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
