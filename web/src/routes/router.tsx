import { type ComponentType,lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import AdminLayoutOutlet from '@/components/layout/AdminLayoutOutlet';
import AuthLayoutOutlet from '@/components/layout/AuthLayoutOutlet';

import {
  RequireAuth,
  RequireBranchContext,
  RequireCorrespondenceInboxAccess,
  RequireMarketingCampaignAccess,
  RequireOrgNotificationManager,
  RequirePermission,
  RequirePricingEvaluationAccess,
} from './guards';
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
const PasswordResetOtpPage = lazy(() => import('@/features/auth/pages/PasswordResetOtpPage'));
const PasswordResetNewPasswordPage = lazy(
  () => import('@/features/auth/pages/PasswordResetNewPasswordPage'),
);
const RequiredPasswordChangePage = lazy(
  () => import('@/features/auth/pages/RequiredPasswordChangePage'),
);
const TwoFactorVerifyPage = lazy(() => import('@/features/auth/pages/TwoFactorVerifyPage'));
const OnboardingCompletePage = lazy(
  () => import('@/features/auth/pages/OnboardingCompletePage'),
);
const CustomerOnboardingPage = lazy(() => import('@/features/crm/pages/customers/CustomerOnboardingPage'));
const ProfilePage = lazy(() => import('@/features/auth/pages/ProfilePage'));
const MyLeavesPage = lazy(() => import('@/features/hr/pages/leave/MyLeavesPage'));
const CorrespondenceInboxPage = lazy(
  () => import('@/features/correspondence/pages/CorrespondenceInboxPage'),
);
const CorrespondenceThreadPage = lazy(
  () => import('@/features/correspondence/pages/CorrespondenceThreadPage'),
);
const CorrespondenceComposePage = lazy(
  () => import('@/features/correspondence/pages/CorrespondenceComposePage'),
);
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
const ProformaInvoicePage = lazy(() => import('@/features/pos/pages/ProformaInvoicePage'));

const AdminUsersList = lazy(() => import('@/features/admin/pages/users/UsersList'));
const AdminUserCreate = lazy(() => import('@/features/admin/pages/users/UserCreate'));
const AdminUserEdit = lazy(() => import('@/features/admin/pages/users/UserEdit'));
const AdminUserPermissionOverrides = lazy(
  () => import('@/features/admin/pages/users/UserPermissionOverrides'),
);
const AdminRolesList = lazy(() => import('@/features/admin/pages/roles/RolesList'));
const AdminRoleEdit = lazy(() => import('@/features/admin/pages/roles/RoleEdit'));
const AdminBranchesList = lazy(() => import('@/features/admin/pages/branches/BranchesList'));
const AdminBranchDetail = lazy(() => import('@/features/admin/pages/branches/BranchDetail'));
const AdminTerminalsList = lazy(() => import('@/features/admin/pages/terminals/TerminalsList'));
const AdminTerminalDetail = lazy(() => import('@/features/admin/pages/terminals/TerminalDetailPage'));
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
const AdminAuditLogsPage = lazy(() => import('@/features/admin/pages/audit/AuditLogsPage'));

const CatalogProductsList = lazy(() => import('@/features/catalog/pages/products/ProductsList'));
const CatalogProductFormPage = lazy(() => import('@/features/catalog/pages/products/ProductFormPage'));
const CatalogTaxesList = lazy(() => import('@/features/catalog/pages/taxes/TaxesList'));
const CatalogTaxDetailPage = lazy(() => import('@/features/catalog/pages/taxes/TaxDetailPage'));
const CatalogCategoriesTree = lazy(() => import('@/features/catalog/pages/categories/CategoriesTree'));
const CatalogAttributesPage = lazy(() => import('@/features/catalog/pages/attributes/AttributesPage'));
const CatalogCategoryProperties = lazy(
  () => import('@/features/catalog/pages/categories/CategoryPropertiesPage'),
);
const CatalogPricingEvaluationPage = lazy(
  () => import('@/features/catalog/pages/pricing/PricingEvaluationPage'),
);
const CatalogPricingEvaluationDetailPage = lazy(
  () => import('@/features/catalog/pages/pricing/PricingEvaluationDetailPage'),
);
const InventoryStockOnHand = lazy(() => import('@/features/inventory/pages/stock/StockOnHand'));
const InventoryProductStockCard = lazy(() => import('@/features/inventory/pages/stock/ProductStockCard'));
const InventoryProductMovements = lazy(() => import('@/features/inventory/pages/stock/ProductMovementsPage'));
const InventoryAdjustmentsList = lazy(
  () => import('@/features/inventory/pages/adjustments/AdjustmentsList'),
);
const InventoryAdjustmentForm = lazy(
  () => import('@/features/inventory/pages/adjustments/AdjustmentForm'),
);
const InventoryTransfersList = lazy(() => import('@/features/inventory/pages/transfers/TransfersList'));
const InventoryCommercialRestockAlerts = lazy(
  () => import('@/features/inventory/pages/alerts/CommercialRestockAlertsPage'),
);
const InventoryTransferForm = lazy(() => import('@/features/inventory/pages/transfers/TransferForm'));
const InventoryAdhocReceiptPage = lazy(
  () => import('@/features/inventory/pages/receipts/AdhocReceiptPage'),
);
const InventoryReservationsList = lazy(
  () => import('@/features/inventory/pages/reservations/ReservationsListPage'),
);
const InventoryReserveMovementPage = lazy(
  () => import('@/features/inventory/pages/reservations/ReserveMovementPage'),
);
const InventoryDamagedListPage = lazy(
  () => import('@/features/inventory/pages/damage/DamagedListPage'),
);
const InventoryDamageMovementPage = lazy(
  () => import('@/features/inventory/pages/damage/DamageMovementPage'),
);
const InventoryStockCountPage = lazy(
  () => import('@/features/inventory/pages/stock-count/StockCountPage'),
);
const InventoryProductionHome = lazy(
  () => import('@/features/inventory/pages/production/ProductionHomePage'),
);
const InventoryBomForm = lazy(() => import('@/features/inventory/pages/production/BomFormPage'));
const InventoryBomDetail = lazy(() => import('@/features/inventory/pages/production/BomDetailPage'));
const InventoryProductionOrderForm = lazy(
  () => import('@/features/inventory/pages/production/ProductionOrderFormPage'),
);
const InventoryProductionOrderDetail = lazy(
  () => import('@/features/inventory/pages/production/ProductionOrderDetailPage'),
);
const InventoryStockCountFillPage = lazy(
  () => import('@/features/inventory/pages/stock-count/StockCountFillPage'),
);
const MyStockCountListPage = lazy(
  () => import('@/features/inventory/pages/stock-count/MyStockCountListPage'),
);
const InventoryScansIndexRedirect = lazy(
  () => import('@/features/invoice_scans/pages/InventoryScansIndexRedirect'),
);
const InventoryScansDetailRedirect = lazy(
  () => import('@/features/invoice_scans/pages/InventoryScansDetailRedirect'),
);

const PurchasingOrdersList = lazy(() => import('@/features/purchasing/pages/orders/OrdersList'));
const PurchasingOrderForm = lazy(() => import('@/features/purchasing/pages/orders/OrderForm'));
const PurchasingOrderDetail = lazy(() => import('@/features/purchasing/pages/orders/OrderDetail'));
const PurchasingGoodsReceiptPage = lazy(
  () => import('@/features/purchasing/pages/receipts/GoodsReceiptPage'),
);
const PurchasingSuppliersList = lazy(() => import('@/features/purchasing/pages/suppliers/SuppliersList'));
const PurchasingSupplierForm = lazy(() => import('@/features/purchasing/pages/suppliers/SupplierForm'));
const PurchasingSupplierDetailLayout = lazy(
  () => import('@/features/purchasing/pages/suppliers/SupplierDetailLayout'),
);
const PurchasingSupplierData = lazy(() => import('@/features/purchasing/pages/suppliers/SupplierData'));
const PurchasingSupplierStatement = lazy(
  () => import('@/features/purchasing/pages/suppliers/SupplierStatement'),
);
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
const AccountingBalanceDiagnostics = lazy(
  () => import('@/features/accounting/pages/balance-sheet/BalanceDiagnostics'),
);
const AccountingGeneralLedger = lazy(() => import('@/features/accounting/pages/general-ledger/GeneralLedger'));
const AccountingAROpenItems = lazy(() => import('@/features/accounting/pages/ar/AROpenItems'));
const AccountingApOpenItems = lazy(() => import('@/features/accounting/pages/ap/ApOpenItems'));
const AccountingFiscalPeriodsList = lazy(
  () => import('@/features/accounting/pages/fiscal-periods/FiscalPeriodsList'),
);
const AccountingFiscalPeriodDetail = lazy(
  () => import('@/features/accounting/pages/fiscal-periods/FiscalPeriodDetailPage'),
);
const AccountingOperations = lazy(() => import('@/features/accounting/pages/operations/AccountingOperations'));
const ChartOfAccountsPage = lazy(
  () => import('@/features/accounting/pages/chart-accounts/ChartOfAccountsPage'),
);
const AccountingCurrencies = lazy(() => import('@/features/accounting/pages/currencies/CurrenciesPage'));
const AccountingPaymentTerms = lazy(
  () => import('@/features/accounting/pages/payment-terms/PaymentTermsList'),
);

const CrmCustomersList = lazy(() => import('@/features/crm/pages/customers/CustomersList'));
const CrmCustomerForm = lazy(() => import('@/features/crm/pages/customers/CustomerForm'));
const CrmCustomerDetail = lazy(() => import('@/features/crm/pages/customers/CustomerDetail'));
const CrmAccrualRulesList = lazy(() => import('@/features/crm/pages/loyalty/AccrualRulesList'));
const CrmAccrualRuleForm = lazy(() => import('@/features/crm/pages/loyalty/AccrualRuleForm'));
const CrmDiscountsList = lazy(() => import('@/features/crm/pages/discounts/DiscountsList'));
const CrmDiscountsQueryRedirect = lazy(() => import('@/features/crm/pages/discounts/DiscountsQueryRedirect'));

const MarketingAnalytics = lazy(() => import('@/features/marketing/pages/analytics/Analytics'));
const MarketingSalesInvoiceRegister = lazy(
  () => import('@/features/marketing/pages/sales-invoices/SalesInvoiceRegister'),
);
const MarketingInventoryInsights = lazy(
  () => import('@/features/marketing/pages/inventory-insights/InventoryInsights'),
);
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
const HrAttendanceDevicesList = lazy(
  () => import('@/features/hr/pages/attendance/AttendanceDevicesList'),
);
const AttendanceKioskSelfPage = lazy(
  () => import('@/features/hr/pages/attendance/AttendanceKioskSelfPage'),
);
const HrTimesheetDetail = lazy(() => import('@/features/hr/pages/attendance/TimesheetDetail'));
const HrLeaveList = lazy(() => import('@/features/hr/pages/leave/LeaveList'));
const HrAnomaliesDashboard = lazy(() => import('@/features/hr/pages/anomalies/AnomaliesDashboard'));

const AiPurchaseReorder = lazy(() => import('@/features/ai/pages/PurchaseReorderAdvisor'));
const AiHrAnomaliesView = lazy(() => import('@/features/ai/pages/HrAnomaliesView'));
const AiInvoiceMatchReview = lazy(() => import('@/features/ai/pages/InvoiceMatchReview'));

const PayrollRunsList = lazy(() => import('@/features/payroll/pages/runs/RunsList'));
const PayrollRunDetail = lazy(() => import('@/features/payroll/pages/runs/RunDetail'));
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
      { path: '/password-reset-otp', element: withSuspense(PasswordResetOtpPage) },
      { path: '/password-reset-new', element: withSuspense(PasswordResetNewPasswordPage) },
      { path: '/reset-password/:token', element: withSuspense(ForgotPasswordPage) },
      { path: '/two-factor-verify', element: withSuspense(TwoFactorVerifyPage) },
      {
        path: '/onboarding/complete/:token',
        element: withSuspense(OnboardingCompletePage),
      },
      {
        path: '/customer-onboarding',
        element: withSuspense(CustomerOnboardingPage),
      },
    ],
  },

  {
    element: (
      <RequireAuth>
        <AuthLayoutOutlet />
      </RequireAuth>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: '/change-password-required',
        element: withSuspense(RequiredPasswordChangePage),
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

  // Attendance kiosk fullscreen (no admin chrome)
  {
    path: '/attendance-kiosk',
    element: (
      <RequireAuth>
        <RequirePermission resource="attendance_kiosk" action="read">
          {withSuspense(AttendanceKioskSelfPage)}
        </RequirePermission>
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
            path: '/my-leaves',
            element: withSuspense(MyLeavesPage),
          },
          {
            path: '/my-stock-count',
            children: [
              { index: true, element: withSuspense(MyStockCountListPage) },
              { path: ':sessionId', element: withSuspense(InventoryStockCountFillPage) },
            ],
          },
          {
            path: '/correspondence',
            element: (
              <RequireCorrespondenceInboxAccess>
                {withSuspense(CorrespondenceInboxPage)}
              </RequireCorrespondenceInboxAccess>
            ),
          },
          {
            path: '/correspondence/compose',
            element: (
              <RequireCorrespondenceInboxAccess>
                {withSuspense(CorrespondenceComposePage)}
              </RequireCorrespondenceInboxAccess>
            ),
          },
          {
            path: '/correspondence/:id',
            element: (
              <RequireCorrespondenceInboxAccess>
                {withSuspense(CorrespondenceThreadPage)}
              </RequireCorrespondenceInboxAccess>
            ),
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
              {
                path: 'proforma',
                element: (
                  <RequireBranchContext>
                    <RequirePermission resource="pos_carts" action="read">
                      {withSuspense(ProformaInvoicePage)}
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
                    path: ':productId',
                    children: [
                      {
                        index: true,
                        element: (
                          <RequirePermission resource="catalog" action="read">
                            {withSuspense(CatalogProductFormPage)}
                          </RequirePermission>
                        ),
                      },
                      {
                        path: 'edit',
                        element: <Navigate to=".." replace />,
                      },
                    ],
                  },
                ],
              },
              {
                path: 'taxes',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="catalog" action="read">
                        {withSuspense(CatalogTaxesList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="catalog" action="read">
                        {withSuspense(CatalogTaxDetailPage)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'attributes',
                element: (
                  <RequirePermission resource="catalog" action="update">
                    {withSuspense(CatalogAttributesPage)}
                  </RequirePermission>
                ),
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
              {
                path: 'pricing',
                element: <Navigate to="/accounting/pricing-evaluation" replace />,
              },
              {
                path: 'pricing/:productId/:variantId',
                element: <Navigate to="/accounting/pricing-evaluation" replace />,
              },
            ],
          },

          // Inventory
          {
            path: '/inventory',
            children: [
              { index: true, element: <Navigate to="/inventory/stock" replace /> },
              {
                path: 'stock/:productId/movements',
                element: (
                  <RequirePermission resource="inventory" action="read">
                    {withSuspense(InventoryProductMovements)}
                  </RequirePermission>
                ),
              },
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
                path: 'alerts',
                element: (
                  <RequirePermission resource="inventory" action="read">
                    {withSuspense(InventoryCommercialRestockAlerts)}
                  </RequirePermission>
                ),
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
                    path: ':id/edit',
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
                path: 'receipts',
                children: [
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="stock_adjustments" action="create">
                        {withSuspense(InventoryAdhocReceiptPage)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'reservations',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="stock_adjustments" action="read">
                        {withSuspense(InventoryReservationsList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="stock_adjustments" action="create">
                        {withSuspense(InventoryReserveMovementPage)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'damage',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="stock_adjustments" action="read">
                        {withSuspense(InventoryDamagedListPage)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'new',
                    element: (
                      <RequirePermission resource="stock_adjustments" action="create">
                        {withSuspense(InventoryDamageMovementPage)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'stock-count',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="inventory" action="read">
                        {withSuspense(InventoryStockCountPage)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':sessionId',
                    element: (
                      <RequirePermission resource="inventory" action="read">
                        {withSuspense(InventoryStockCountFillPage)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'production',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="production_orders" action="read">
                        {withSuspense(InventoryProductionHome)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'boms/new',
                    element: (
                      <RequirePermission resource="production_orders" action="create">
                        {withSuspense(InventoryBomForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'boms/:id',
                    element: (
                      <RequirePermission resource="production_orders" action="read">
                        {withSuspense(InventoryBomDetail)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'orders/new',
                    element: (
                      <RequirePermission resource="production_orders" action="create">
                        {withSuspense(InventoryProductionOrderForm)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: 'orders/:id',
                    element: (
                      <RequirePermission resource="production_orders" action="read">
                        {withSuspense(InventoryProductionOrderDetail)}
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
                    path: ':id/receive',
                    element: (
                      <RequirePermission resource="purchase_orders" action="update">
                        {withSuspense(PurchasingGoodsReceiptPage)}
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
                    element: <Navigate to="../data" replace relative="path" />,
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="suppliers" action="read">
                        {withSuspense(PurchasingSupplierDetailLayout)}
                      </RequirePermission>
                    ),
                    children: [
                      {
                        index: true,
                        element: <Navigate to="data" replace />,
                      },
                      {
                        path: 'data',
                        element: (
                          <RequirePermission resource="suppliers" action="read">
                            {withSuspense(PurchasingSupplierData)}
                          </RequirePermission>
                        ),
                      },
                      {
                        path: 'statement',
                        element: (
                          <RequirePermission resource="suppliers" action="read">
                            {withSuspense(PurchasingSupplierStatement)}
                          </RequirePermission>
                        ),
                      },
                    ],
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
                  {
                    path: 'devices',
                    children: [
                      {
                        index: true,
                        element: (
                          <RequirePermission resource="attendance_devices" action="read">
                            {withSuspense(HrAttendanceDevicesList)}
                          </RequirePermission>
                        ),
                      },
                    ],
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
                element: <Navigate to="/payroll/overview" replace />,
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
                path: 'balance-diagnostics',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingBalanceDiagnostics)}
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
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingFiscalPeriodsList)}
                  </RequirePermission>
                ),
              },
              {
                path: 'fiscal-periods/:periodKey',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingFiscalPeriodDetail)}
                  </RequirePermission>
                ),
              },
              {
                path: 'chart-accounts',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(ChartOfAccountsPage)}
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
              {
                path: 'currencies',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingCurrencies)}
                  </RequirePermission>
                ),
              },
              {
                path: 'payment-terms',
                element: (
                  <RequirePermission resource="accounting" action="read">
                    {withSuspense(AccountingPaymentTerms)}
                  </RequirePermission>
                ),
              },
              {
                path: 'pricing-evaluation',
                element: (
                  <RequirePricingEvaluationAccess>
                    {withSuspense(CatalogPricingEvaluationPage)}
                  </RequirePricingEvaluationAccess>
                ),
              },
              {
                path: 'pricing-evaluation/:productId/:variantId',
                element: (
                  <RequirePricingEvaluationAccess>
                    {withSuspense(CatalogPricingEvaluationDetailPage)}
                  </RequirePricingEvaluationAccess>
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
                        {withSuspense(CrmDiscountsQueryRedirect)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':discountId/edit',
                    element: (
                      <RequirePermission resource="discounts" action="update">
                        {withSuspense(CrmDiscountsQueryRedirect)}
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
                path: 'sales-invoices',
                element: (
                  <RequirePermission resource="sales_invoices" action="read">
                    {withSuspense(MarketingSalesInvoiceRegister)}
                  </RequirePermission>
                ),
              },
              {
                path: 'inventory-insights',
                element: (
                  <RequirePermission resource="analytics" action="read">
                    {withSuspense(MarketingInventoryInsights)}
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
                  <RequireMarketingCampaignAccess>
                    {withSuspense(MarketingCampaignAdvisor)}
                  </RequireMarketingCampaignAccess>
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
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="branches" action="read">
                        {withSuspense(AdminBranchesList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="branches" action="read">
                        {withSuspense(AdminBranchDetail)}
                      </RequirePermission>
                    ),
                  },
                ],
              },
              {
                path: 'terminals',
                children: [
                  {
                    index: true,
                    element: (
                      <RequirePermission resource="terminals" action="read">
                        {withSuspense(AdminTerminalsList)}
                      </RequirePermission>
                    ),
                  },
                  {
                    path: ':id',
                    element: (
                      <RequirePermission resource="terminals" action="read">
                        {withSuspense(AdminTerminalDetail)}
                      </RequirePermission>
                    ),
                  },
                ],
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
                path: 'audit-logs',
                element: (
                  <RequirePermission resource="audit_log" action="read">
                    {withSuspense(AdminAuditLogsPage)}
                  </RequirePermission>
                ),
              },
              {
                path: 'catalog-attributes',
                element: <Navigate to="/catalog/attributes" replace />,
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
