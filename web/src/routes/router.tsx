import { type ComponentType,lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import AdminLayoutOutlet from '@/components/layout/AdminLayoutOutlet';
import AuthLayoutOutlet from '@/components/layout/AuthLayoutOutlet';

import { RequireAuth, RequireBranchContext, RequireOrgNotificationManager, RequirePermission } from './guards';
import RouteErrorBoundary from './RouteErrorBoundary';
import RouteLoader from './RouteLoader';

/*
 * React Router v7 data router. The route tree mirrors `WEB_FRONTEND_PLAN.md`
 * §4.1 one-to-one, with `RequirePermission` wrappers carrying the exact
 * `resource:action` strings from that document. Feature pages that have not
 * shipped yet should render a thin placeholder or redirect until implemented.
 */

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));
const OnboardingCompletePage = lazy(
  () => import('@/features/auth/pages/OnboardingCompletePage'),
);
const ProfilePage = lazy(() => import('@/features/auth/pages/ProfilePage'));
const NotificationsInboxPage = lazy(() => import('@/features/notifications/pages/NotificationsInboxPage'));

const DashboardPage = lazy(() => import('@/features/bi/pages/DashboardPage'));
const HomePage = lazy(() => import('@/features/bi/pages/HomePage'));

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
const AdminUserPermissionOverrides = lazy(
  () => import('@/features/admin/pages/users/UserPermissionOverrides'),
);
const AdminRolesList = lazy(() => import('@/features/admin/pages/roles/RolesList'));
const AdminRoleEdit = lazy(() => import('@/features/admin/pages/roles/RoleEdit'));
const AdminBranchesList = lazy(() => import('@/features/admin/pages/branches/BranchesList'));
const AdminTerminalsList = lazy(() => import('@/features/admin/pages/terminals/TerminalsList'));
const AdminBackupsList = lazy(() => import('@/features/admin/pages/backups/BackupsList'));
const AdminNotificationsIndexRedirect = lazy(
  () => import('@/features/admin/pages/notifications/AdminNotificationsIndexRedirect'),
);
const AdminSendNow = lazy(
  () => import('@/features/admin/pages/notifications/SendNow'),
);
const AdminRoutineSchedules = lazy(
  () => import('@/features/admin/pages/notifications/RoutineSchedules'),
);
const AdminNotificationHistory = lazy(
  () => import('@/features/admin/pages/notifications/NotificationHistory'),
);
const AdminNotificationsLayout = lazy(
  () => import('@/features/admin/pages/notifications/NotificationsLayout'),
);

const CatalogProductsList = lazy(() => import('@/features/catalog/pages/products/ProductsList'));
const CatalogProductFormPage = lazy(() => import('@/features/catalog/pages/products/ProductFormPage'));
const CatalogCategoriesTree = lazy(() => import('@/features/catalog/pages/categories/CategoriesTree'));
const CatalogCategoryProperties = lazy(
  () => import('@/features/catalog/pages/categories/CategoryPropertiesPage'),
);
const InventoryStockOnHand = lazy(() => import('@/features/inventory/pages/stock/StockOnHand'));
const InventoryProductStockCard = lazy(() => import('@/features/inventory/pages/stock/ProductStockCard'));
const InventoryAdjustmentsList = lazy(
  () => import('@/features/inventory/pages/adjustments/AdjustmentsList'),
);
const InventoryAdjustmentForm = lazy(
  () => import('@/features/inventory/pages/adjustments/AdjustmentForm'),
);
const InventoryTransfersList = lazy(() => import('@/features/inventory/pages/transfers/TransfersList'));
const InventoryTransferForm = lazy(() => import('@/features/inventory/pages/transfers/TransferForm'));
const InventoryScansIndexRedirect = lazy(
  () => import('@/features/invoice_scans/pages/InventoryScansIndexRedirect'),
);
const InventoryScansDetailRedirect = lazy(
  () => import('@/features/invoice_scans/pages/InventoryScansDetailRedirect'),
);

const PurchasingOrdersList = lazy(() => import('@/features/purchasing/pages/orders/OrdersList'));
const PurchasingOrderForm = lazy(() => import('@/features/purchasing/pages/orders/OrderForm'));
const PurchasingOrderDetail = lazy(() => import('@/features/purchasing/pages/orders/OrderDetail'));
const PurchasingSuppliersList = lazy(() => import('@/features/purchasing/pages/suppliers/SuppliersList'));
const PurchasingSupplierForm = lazy(() => import('@/features/purchasing/pages/suppliers/SupplierForm'));
const InvoiceScanQueue = lazy(() => import('@/features/invoice_scans/pages/InvoiceScanQueue'));
const InvoiceScanDetail = lazy(() => import('@/features/invoice_scans/pages/InvoiceScanDetail'));

const AccountingJournalList = lazy(() => import('@/features/accounting/pages/journal/JournalList'));
const AccountingJournalDetail = lazy(() => import('@/features/accounting/pages/journal/JournalDetail'));
const AccountingManualJournalForm = lazy(
  () => import('@/features/accounting/pages/journal/ManualJournalForm'),
);
const AccountingReversalForm = lazy(() => import('@/features/accounting/pages/journal/ReversalForm'));
const AccountingTrialBalance = lazy(() => import('@/features/accounting/pages/trial-balance/TrialBalance'));
const AccountingIncomeStatement = lazy(
  () => import('@/features/accounting/pages/income-statement/IncomeStatement'),
);
const AccountingBalanceSheet = lazy(() => import('@/features/accounting/pages/balance-sheet/BalanceSheet'));
const AccountingGeneralLedger = lazy(() => import('@/features/accounting/pages/general-ledger/GeneralLedger'));
const AccountingAROpenItems = lazy(() => import('@/features/accounting/pages/ar/AROpenItems'));
const AccountingApOpenItems = lazy(() => import('@/features/accounting/pages/ap/ApOpenItems'));
const AccountingFiscalPeriodsList = lazy(
  () => import('@/features/accounting/pages/fiscal-periods/FiscalPeriodsList'),
);
const AccountingOperations = lazy(() => import('@/features/accounting/pages/operations/AccountingOperations'));

const CrmCustomersList = lazy(() => import('@/features/crm/pages/customers/CustomersList'));
const CrmCustomerForm = lazy(() => import('@/features/crm/pages/customers/CustomerForm'));
const CrmCustomerDetail = lazy(() => import('@/features/crm/pages/customers/CustomerDetail'));
const CrmAccrualRulesList = lazy(() => import('@/features/crm/pages/loyalty/AccrualRulesList'));
const CrmAccrualRuleForm = lazy(() => import('@/features/crm/pages/loyalty/AccrualRuleForm'));
const CrmDiscountsList = lazy(() => import('@/features/crm/pages/discounts/DiscountsList'));
const CrmDiscountForm = lazy(() => import('@/features/crm/pages/discounts/DiscountForm'));

const MarketingAnalytics = lazy(() => import('@/features/marketing/pages/analytics/Analytics'));
const MarketingAdvisoryPage = lazy(() => import('@/features/marketing/pages/advisory/MarketingAdvisory'));
const MarketingCampaignAdvisor = lazy(() => import('@/features/marketing/pages/campaigns/CampaignAdvisor'));

const HrEmployeesList = lazy(() => import('@/features/hr/pages/employees/EmployeesList'));
const HrEmployeeForm = lazy(() => import('@/features/hr/pages/employees/EmployeeForm'));
const HrPendingOnboardingList = lazy(() => import('@/features/hr/pages/employees/PendingOnboardingList'));
const HrPendingOnboardingDetail = lazy(() => import('@/features/hr/pages/employees/PendingOnboardingDetail'));
const HrEmployeeDetailLayout = lazy(() => import('@/features/hr/pages/employees/EmployeeDetailLayout'));
const HrEmployeePerformance = lazy(() => import('@/features/hr/pages/employees/EmployeePerformance'));
const HrEmployeeAttendance = lazy(() => import('@/features/hr/pages/employees/EmployeeAttendance'));
const HrEmployeeLeave = lazy(() => import('@/features/hr/pages/employees/EmployeeLeave'));
const HrEmployeeSchedule = lazy(() => import('@/features/hr/pages/employees/EmployeeSchedule'));
const HrEmployeeData = lazy(() => import('@/features/hr/pages/employees/EmployeeData'));
const HrAttendanceList = lazy(() => import('@/features/hr/pages/attendance/AttendanceList'));
const HrTimesheetDetail = lazy(() => import('@/features/hr/pages/attendance/TimesheetDetail'));
const HrLeaveList = lazy(() => import('@/features/hr/pages/leave/LeaveList'));
const HrAnomaliesDashboard = lazy(() => import('@/features/hr/pages/anomalies/AnomaliesDashboard'));

const AiPurchaseReorder = lazy(() => import('@/features/ai/pages/PurchaseReorderAdvisor'));
const AiHrAnomaliesView = lazy(() => import('@/features/ai/pages/HrAnomaliesView'));
const AiInvoiceMatchReview = lazy(() => import('@/features/ai/pages/InvoiceMatchReview'));

const PayrollRunsList = lazy(() => import('@/features/payroll/pages/runs/RunsList'));
const PayrollRunDetail = lazy(() => import('@/features/payroll/pages/runs/RunDetail'));
const PayrollApprovalsQueue = lazy(() => import('@/features/payroll/pages/approvals/ApprovalsQueue'));
const PayrollOverview = lazy(() => import('@/features/payroll/pages/overview/PayrollOverview'));
const PayrollDeductionPolicies = lazy(() => import('@/features/payroll/pages/policies/DeductionPolicies'));

function withSuspense(Component: ComponentType): JSX.Element {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Component />
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
          { index: true, element: withSuspense(HomePage) },
          {
            path: '/profile',
            element: withSuspense(ProfilePage),
          },
          {
            path: '/notifications',
            element: (
              <RequirePermission resource="notifications" action="read">
                {withSuspense(NotificationsInboxPage)}
              </RequirePermission>
            ),
          },
          {
            path: '/dashboard',
            element: withSuspense(DashboardPage),
          },

          // POS
          {
            path: '/pos',
            children: [
              {
                index: true,
                element: (
                  <RequireBranchContext>
                    <RequirePermission resource="pos_shifts" action="read">
                      {withSuspense(ShiftGatePage)}
                    </RequirePermission>
                  </RequireBranchContext>
                ),
              },
              {
                path: 'register',
                element: (
                  <RequireBranchContext>
                    <RequirePermission resource="pos_carts" action="update">
                      {withSuspense(PosRegisterPage)}
                    </RequirePermission>
                  </RequireBranchContext>
                ),
              },
              {
                path: 'close',
                element: (
                  <RequireBranchContext>
                    <RequirePermission resource="pos_shifts" action="close">
                      {withSuspense(ShiftClosePage)}
                    </RequirePermission>
                  </RequireBranchContext>
                ),
              },
              {
                path: 'invoices',
                element: (
                  <RequireBranchContext>
                    <RequirePermission resource="sales_invoices" action="read">
                      {withSuspense(InvoiceLookupPage)}
                    </RequirePermission>
                  </RequireBranchContext>
                ),
              },
            ],
          },

          // Catalog
          {
            path: '/catalog',
            children: [
              { index: true, element: <Navigate to="/catalog/products" replace /> },
              {
                path: 'products',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="catalog" action="read">
                        {withSuspense(CatalogProductsList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="catalog" action="create">
                        {withSuspense(CatalogProductFormPage)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':productId/edit',
                    element: (
                      <RequirePermission resource="catalog" action="update">
                        {withSuspense(CatalogProductFormPage)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'categories',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="catalog" action="read">
                        {withSuspense(CatalogCategoriesTree)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':categoryId',
                    element: (
                      <RequirePermission resource="catalog" action="read">
                        {withSuspense(CatalogCategoryProperties)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'price-lists/*',
                element: <Navigate to="/catalog/products" replace />,
              },
            ],
          },

          // Inventory
          {
            path: '/inventory',
            children: [
              { index: true, element: <Navigate to="/inventory/stock" replace /> },
              {
                path: 'stock/:productId',
                element: (
                  <RequirePermission resource="inventory" action="read">
                    {withSuspense(InventoryProductStockCard)}
                  </RequirePermission>
                ),
              },
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
                        {withSuspense(InventoryScansIndexRedirect)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="invoice_scans" action="read">
                        {withSuspense(InventoryScansDetailRedirect)}
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
                      <RequirePermission resource="invoice_scans" action="read">
                        {withSuspense(InvoiceScanQueue)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="invoice_scans" action="read">
                        {withSuspense(InvoiceScanDetail)}
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
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="employees" action="read">
                        {withSuspense(HrEmployeesList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'pending',
                    children: [
                      {
                        index: true,
                        element: (
                          <RequirePermission resource="onboarding" action="read">
                            {withSuspense(HrPendingOnboardingList)}
                          </RequirePermission>
                        ),
                      },
                      {
                        path: ':onboardingId',
                        element: (
                          <RequirePermission resource="onboarding" action="update">
                            {withSuspense(HrPendingOnboardingDetail)}
                          </RequirePermission>
                        ),
                      },
                    ],
                  },
                  {
                    path: ':id/edit',
                    element: (
                      <RequirePermission resource="employees" action="update">
                        {withSuspense(HrEmployeeForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="employees" action="read">
                        {withSuspense(HrEmployeeDetailLayout)}
                      </RequirePermission>
                    ),
                    children: [
                      {
                        index: true,
                        element: <Navigate to="performance" replace />,
                      },
                      {
                        path: 'performance',
                        element: (
                          <RequirePermission resource="employees" action="read">
                            {withSuspense(HrEmployeePerformance)}
                          </RequirePermission>
                        ),
                      },
                      {
                        path: 'data',
                        element: (
                          <RequirePermission resource="employees" action="read">
                            {withSuspense(HrEmployeeData)}
                          </RequirePermission>
                        ),
                      },
                      {
                        path: 'attendance',
                        element: (
                          <RequirePermission resource="employees" action="read">
                            {withSuspense(HrEmployeeAttendance)}
                          </RequirePermission>
                        ),
                      },
                      {
                        path: 'leave',
                        element: (
                          <RequirePermission resource="employees" action="read">
                            {withSuspense(HrEmployeeLeave)}
                          </RequirePermission>
                        ),
                      },
                      {
                        path: 'schedule',
                        element: (
                          <RequirePermission resource="employees" action="update">
                            {withSuspense(HrEmployeeSchedule)}
                          </RequirePermission>
                        ),
                      },
                    ],
                  },
                ],
              },
              {
                path: 'attendance',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="employees" action="read">
                        {withSuspense(HrAttendanceList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'timesheet/:employeeProfileId',
                    element: (
                      <RequirePermission resource="employees" action="read">
                        {withSuspense(HrTimesheetDetail)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'leave',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="employees" action="read">
                        {withSuspense(HrLeaveList)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'anomalies',
                element: (
                  <RequirePermission resource="ai_advisory" action="run">
                    {withSuspense(HrAnomaliesDashboard)}
                  </RequirePermission>
                ),
              },
            ],
          },

          // Payroll
          {
            path: '/payroll',
            children: [
              { index: true, element: <Navigate to="/payroll/overview" replace /> },
              {
                path: 'overview',
                element: (
                  <RequirePermission resource="payroll" action="read">
                    {withSuspense(PayrollOverview)}
                  </RequirePermission>
                ),
              },
              {
                path: 'deduction-policies',
                element: (
                  <RequirePermission resource="payroll" action="read">
                    {withSuspense(PayrollDeductionPolicies)}
                  </RequirePermission>
                ),
              },
              {
                path: 'runs',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="payroll" action="read">
                        {withSuspense(PayrollRunsList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="payroll" action="read">
                        {withSuspense(PayrollRunDetail)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'approvals',
                element: (
                  <RequirePermission resource="payroll" action="approve">
                    {withSuspense(PayrollApprovalsQueue)}
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
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="accounting" action="read">
                        {withSuspense(AccountingJournalList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="accounting" action="create">
                        {withSuspense(AccountingManualJournalForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id/reverse',
                    element: (
                      <RequirePermission resource="accounting" action="create">
                        {withSuspense(AccountingReversalForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="accounting" action="read">
                        {withSuspense(AccountingJournalDetail)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'trial-balance',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingTrialBalance)}
                  </RequirePermission>
                ),
              },
              {
                path: 'income-statement',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingIncomeStatement)}
                  </RequirePermission>
                ),
              },
              {
                path: 'balance-sheet',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingBalanceSheet)}
                  </RequirePermission>
                ),
              },
              {
                path: 'general-ledger',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingGeneralLedger)}
                  </RequirePermission>
                ),
              },
              {
                path: 'ar',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingAROpenItems)}
                  </RequirePermission>
                ),
              },
              {
                path: 'ap',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingApOpenItems)}
                  </RequirePermission>
                ),
              },
              {
                path: 'fiscal-periods',
                element: (
                  <RequirePermission resource="accounting" action="update">
                    {withSuspense(AccountingFiscalPeriodsList)}
                  </RequirePermission>
                ),
              },
              {
                path: 'operations',
                element: (
                  <RequirePermission resource="accounting" action="create">
                    {withSuspense(AccountingOperations)}
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
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="customers" action="read">
                        {withSuspense(CrmCustomersList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="customers" action="create">
                        {withSuspense(CrmCustomerForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id/edit',
                    element: (
                      <RequirePermission resource="customers" action="update">
                        {withSuspense(CrmCustomerForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="customers" action="read">
                        {withSuspense(CrmCustomerDetail)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'loyalty',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="loyalty" action="read">
                        {withSuspense(CrmAccrualRulesList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="loyalty" action="create">
                        {withSuspense(CrmAccrualRuleForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':ruleId/edit',
                    element: (
                      <RequirePermission resource="loyalty" action="update">
                        {withSuspense(CrmAccrualRuleForm)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'discounts',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="discounts" action="read">
                        {withSuspense(CrmDiscountsList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="discounts" action="create">
                        {withSuspense(CrmDiscountForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':discountId/edit',
                    element: (
                      <RequirePermission resource="discounts" action="update">
                        {withSuspense(CrmDiscountForm)}
                      </RequirePermission>
                    ),
                  },
                ],
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
                    {withSuspense(MarketingAnalytics)}
                  </RequirePermission>
                ),
              },
              {
                path: 'advisory',
                element: (
                  <RequirePermission resource="marketing_advisory" action="run">
                    {withSuspense(MarketingAdvisoryPage)}
                  </RequirePermission>
                ),
              },
              {
                path: 'campaigns',
                element: (
                  <RequirePermission resource="ai_advisory" action="run">
                    {withSuspense(MarketingCampaignAdvisor)}
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
                    {withSuspense(AiPurchaseReorder)}
                  </RequirePermission>
                ),
              },
              {
                path: 'hr-anomalies',
                element: (
                  <RequirePermission resource="ai_advisory" action="run">
                    {withSuspense(AiHrAnomaliesView)}
                  </RequirePermission>
                ),
              },
              {
                path: 'invoice-match',
                element: (
                  <RequirePermission resource="ai_advisory" action="run">
                    {withSuspense(AiInvoiceMatchReview)}
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
                path: 'users/:id/permissions',
                element: (
                  <RequirePermission resource="users" action="read">
                    {withSuspense(AdminUserPermissionOverrides)}
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
                  <RequirePermission resource="notifications" action="read">
                    {withSuspense(AdminNotificationsLayout)}
                  </RequirePermission>
                ),
                children: [
                  { index: true, element: withSuspense(AdminNotificationsIndexRedirect) },
                  {
                    path: 'send-now',
                    element: (
                      <RequireOrgNotificationManager>
                        {withSuspense(AdminSendNow)}
                      </RequireOrgNotificationManager>
                    ),
                  },
                  {
                    path: 'routine',
                    element: withSuspense(AdminRoutineSchedules),
                  },
                  {
                    path: 'history',
                    element: (
                      <RequireOrgNotificationManager>
                        {withSuspense(AdminNotificationHistory)}
                      </RequireOrgNotificationManager>
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
