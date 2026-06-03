# Admin Role — Full Access Reference

This document describes the **Admin** system role (`code: ADMIN`, display name **Admin**): every permission granted at seed time, every web route the role can open, and UI areas that are not permission-gated but still require authentication.

**Source of truth in code**

| Area | Location |
|------|----------|
| Role definition & permission assignment | `app/services/seed_service.py` (`ADMIN_ROLE_CODE`, `DEFAULT_PERMISSIONS`) |
| Effective permissions (roles ∪ user overrides) | `app/services/effective_permissions.py` |
| Sidebar navigation & required permissions | `web/src/config/navigation.ts` |
| Route guards (`RequirePermission`) | `web/src/routes/router.tsx` |
| Post-login path checks | `web/src/lib/canAccessPath.ts` |
| Org-wide notification admin pages | `web/src/config/notificationOrgRoles.ts` |

---

## Role summary

| Property | Value |
|----------|--------|
| **Code** | `ADMIN` |
| **Name** | Admin |
| **Description** | Full system access |
| **System role** | Yes (`is_system: true`) |
| **Permission model** | On every seed run, the Admin role is assigned **every** row in the `permissions` table (all entries in `DEFAULT_PERMISSIONS`, plus any permissions added later by migrations or manual DB changes). |
| **Default user** | `seed_default_admin()` assigns this role to the first user when the database has no users (bootstrap administrator). |

### Related role: Owner (`OWNER`)

`OWNER` is a separate system role with broad explicit selectors (all modules except POS and invoice scans). **This document targets `ADMIN`**, which is the primary “main administrator” role created by seed and assigned to the bootstrap user. See [SYSTEM_ROLES_ACCESS.md](./SYSTEM_ROLES_ACCESS.md) for Owner specifics.

### Dashboard home

Users with `ADMIN` (or `OWNER`) resolve to the **executive** dashboard on `/dashboard` (`resolveRoleDashboardKind` in `web/src/config/resolveRoleDashboardKind.ts`), which shows executive BI when `analytics:read` is present (Admin has it).

---

## Complete permission list

Permissions use the format `resource:action`. Admin has **all** of the following (89 selectors from `DEFAULT_PERMISSIONS` at the time of writing).

### Identity & administration

| Permission | Typical use |
|------------|-------------|
| `users:create` | Create users (`/admin/users/new`) |
| `users:read` | List/view users, permission overrides |
| `users:update` | Edit users, assign roles |
| `users:delete` | API: deactivate/delete users (no dedicated delete page in SPA) |
| `roles:read` | Roles list & role editor |
| `roles:create` | API: create custom roles |
| `roles:update` | API & UI: edit role permissions |
| `audit_log:read` | API: list audit logs (no SPA page) |
| `config:read` | API: read global configuration |
| `config:update` | API: update global configuration |
| `branches:read` | Branches list |
| `branches:create` | Create branches |
| `branches:update` | Edit branches |
| `branches:delete` | Archive/delete branches |
| `terminals:read` | POS terminals list |
| `terminals:create` | Register terminals |
| `terminals:update` | Edit terminals |
| `terminals:authorize` | API: authorize terminal devices |
| `backups:read` | Backups list |
| `backups:run` | Trigger backup jobs |
| `notifications:read` | Inbox + admin notification screens |
| `notifications:update` | Mark read, delivery preferences, templates/schedules (API) |
| `onboarding:read` | Pending employee onboarding queue |
| `onboarding:update` | Review/approve onboarding requests |

### Catalog

| Permission | Typical use |
|------------|-------------|
| `catalog:read` | Products, categories, attributes, taxes |
| `catalog:create` | New product |
| `catalog:update` | Edit product, price lists (API) |
| `catalog:delete` | API: delete catalog entities |

### Inventory & stock

| Permission | Typical use |
|------------|-------------|
| `inventory:read` | Stock on hand, transfers (view), stock count |
| `inventory:update` | Create/edit stock transfers, post movements |
| `stock_adjustments:read` | Adjustments, reservations, damage lists |
| `stock_adjustments:create` | New adjustment, receipt, reserve, damage |
| `invoice_scans:read` | Invoice scan queue & detail (purchasing + inventory redirects) |
| `invoice_scans:create` | API: upload scans |
| `invoice_scans:update` | API: edit scan metadata |
| `invoice_scans:validate` | API: validate/match scans |

### Purchasing & suppliers

| Permission | Typical use |
|------------|-------------|
| `purchase_orders:read` | PO list & detail |
| `purchase_orders:create` | New PO |
| `purchase_orders:update` | Edit PO, goods receipt |
| `suppliers:read` | Supplier list, detail, statement |
| `suppliers:create` | New supplier |
| `suppliers:update` | API: update supplier (edit route redirects to data tab) |

### Point of sale

| Permission | Typical use |
|------------|-------------|
| `pos_shifts:open` | API: open shift |
| `pos_shifts:read` | POS entry / shift gate |
| `pos_shifts:update` | API: shift updates |
| `pos_shifts:close` | Close shift page |
| `pos_carts:create` | API: create cart |
| `pos_carts:read` | API: read cart |
| `pos_carts:update` | POS register (active selling) |
| `pos_carts:discount` | Apply cart discounts |
| `pos_payments:create` | API: create payment |
| `pos_payments:capture` | API: capture payment |
| `sales_invoices:create` | API: issue sale |
| `sales_invoices:read` | POS invoice lookup, marketing register |
| `sales_invoices:void` | API: void invoices |
| `returns:create` | API: process returns |
| `customers:create` | New customer (CRM); also used for nav gate on customer list |
| `customers:read` | Customer list & detail |
| `customers:update` | Edit customer |

### Human resources & payroll

| Permission | Typical use |
|------------|-------------|
| `employees:create` | API / onboarding assignee eligibility |
| `employees:read` | Employees, attendance, leave, timesheets |
| `employees:update` | Edit employee, schedule |
| `employees:delete` | API: remove employee |
| `employees:approve` | API: approve HR actions |
| `payroll:read` | Overview, policies, runs |
| `payroll:create` | API: create payroll run |
| `payroll:approve` | Payroll approvals queue |
| `payroll:export` | API: export payroll |

### Accounting

| Permission | Typical use |
|------------|-------------|
| `accounting:read` | Journal, reports, AR/AP, CoA, currencies, payment terms |
| `accounting:create` | Manual journal, reversals, accounting operations |
| `accounting:update` | Fiscal periods close/reopen |

### CRM, loyalty & marketing

| Permission | Typical use |
|------------|-------------|
| `loyalty:create` | New accrual rule |
| `loyalty:read` | Accrual rules list |
| `loyalty:update` | Edit accrual rule |
| `loyalty:adjust` | API: manual loyalty adjustments |
| `discounts:create` | New discount |
| `discounts:read` | Discounts list |
| `discounts:update` | Edit discount |
| `discounts:delete` | API: delete discount |
| `analytics:read` | Marketing analytics & inventory insights; executive dashboard |
| `marketing_advisory:run` | Marketing advisory page |
| `ai_advisory:run` | AI purchase reorder, HR anomalies, campaigns, invoice match review |

---

## Web application — accessible pages

All routes below assume an **authenticated** session. Routes under **POS** additionally require **branch context** (`activeBranchId` set; otherwise redirect to `/select-branch`).

Routes **without** `RequirePermission` are available to any logged-in user (Admin included).

### Public (unauthenticated)

| Path | Page |
|------|------|
| `/login` | Login |
| `/forgot-password` | Forgot password |
| `/reset-password/:token` | Reset password |
| `/onboarding/complete/:token` | Employee onboarding completion (token) |
| `/customer-onboarding` | Customer onboarding (public) |

### Authenticated — no extra permission

| Path | Page |
|------|------|
| `/` | Home (redirects into app) |
| `/profile` | User profile |
| `/select-branch` | Branch picker |
| `/dashboard` | Role dashboard (Admin → executive BI) |
| `/403`, `/404`, `/offline` | Error / offline pages |

### Notifications

| Path | Required permission | Notes |
|------|---------------------|-------|
| `/notifications` | `notifications:read` | User inbox |

### Point of sale (`/pos`)

| Path | Required permission |
|------|---------------------|
| `/pos` | `pos_shifts:read` | Shift gate (branch required) |
| `/pos/register` | `pos_carts:update` | Register (branch required) |
| `/pos/close` | `pos_shifts:close` | Close shift (branch required) |
| `/pos/invoices` | `sales_invoices:read` | Invoice lookup (branch required) |

### Catalog (`/catalog`)

| Path | Required permission |
|------|---------------------|
| `/catalog/products` | `catalog:read` |
| `/catalog/products/new` | `catalog:create` |
| `/catalog/products/:productId/edit` | `catalog:update` |
| `/catalog/taxes` | `catalog:read` |
| `/catalog/attributes` | `catalog:read` |
| `/catalog/categories` | `catalog:read` |
| `/catalog/categories/:categoryId` | `catalog:read` |

### Inventory (`/inventory`)

| Path | Required permission |
|------|---------------------|
| `/inventory/stock` | `inventory:read` |
| `/inventory/stock/:productId` | `inventory:read` |
| `/inventory/adjustments` | `stock_adjustments:read` |
| `/inventory/adjustments/new` | `stock_adjustments:create` |
| `/inventory/transfers` | `inventory:read` |
| `/inventory/transfers/new` | `inventory:update` |
| `/inventory/transfers/:id` | `inventory:read` |
| `/inventory/transfers/:id/edit` | `inventory:update` |
| `/inventory/receipts/new` | `stock_adjustments:create` |
| `/inventory/reservations` | `stock_adjustments:read` |
| `/inventory/reservations/new` | `stock_adjustments:create` |
| `/inventory/damage` | `stock_adjustments:read` |
| `/inventory/damage/new` | `stock_adjustments:create` |
| `/inventory/stock-count` | `inventory:read` |
| `/inventory/stock-count/:sessionId` | `inventory:read` |
| `/inventory/scans` | `invoice_scans:read` |
| `/inventory/scans/:id` | `invoice_scans:read` |

*Not in sidebar; reachable by URL or deep links.*

### Purchasing (`/purchasing`)

| Path | Required permission |
|------|---------------------|
| `/purchasing/orders` | `purchase_orders:read` |
| `/purchasing/orders/new` | `purchase_orders:create` |
| `/purchasing/orders/:id` | `purchase_orders:read` |
| `/purchasing/orders/:id/edit` | `purchase_orders:update` |
| `/purchasing/orders/:id/receive` | `purchase_orders:update` |
| `/purchasing/suppliers` | `suppliers:read` |
| `/purchasing/suppliers/new` | `suppliers:create` |
| `/purchasing/suppliers/:id` | `suppliers:read` |
| `/purchasing/suppliers/:id/data` | `suppliers:read` |
| `/purchasing/suppliers/:id/statement` | `suppliers:read` |
| `/purchasing/invoice-match` | `invoice_scans:read` |
| `/purchasing/invoice-match/:id` | `invoice_scans:read` |

### Human resources (`/hr`)

| Path | Required permission |
|------|---------------------|
| `/hr/employees` | `employees:read` |
| `/hr/employees/pending` | `onboarding:read` |
| `/hr/employees/pending/:onboardingId` | `onboarding:update` |
| `/hr/employees/:id` | `employees:read` |
| `/hr/employees/:id/edit` | `employees:update` |
| `/hr/employees/:id/performance` | `employees:read` |
| `/hr/employees/:id/data` | `employees:read` |
| `/hr/employees/:id/attendance` | `employees:read` |
| `/hr/employees/:id/leave` | `employees:read` |
| `/hr/employees/:id/schedule` | `employees:update` |
| `/hr/attendance` | `employees:read` |
| `/hr/attendance/timesheet/:employeeProfileId` | `employees:read` |
| `/hr/leave` | `employees:read` |
| `/hr/anomalies` | `ai_advisory:run` |

### Payroll (`/payroll`)

| Path | Required permission |
|------|---------------------|
| `/payroll/overview` | `payroll:read` |
| `/payroll/deduction-policies` | `payroll:read` |
| `/payroll/runs` | `payroll:read` |
| `/payroll/runs/:id` | `payroll:read` |
| `/payroll/approvals` | `payroll:approve` |

*Approvals not listed in sidebar; Admin can open directly.*

### Accounting (`/accounting`)

| Path | Required permission |
|------|---------------------|
| `/accounting/journal` | `accounting:read` |
| `/accounting/journal/new` | `accounting:create` |
| `/accounting/journal/:id` | `accounting:read` |
| `/accounting/journal/:id/reverse` | `accounting:create` |
| `/accounting/trial-balance` | `accounting:read` |
| `/accounting/income-statement` | `accounting:read` |
| `/accounting/balance-sheet` | `accounting:read` |
| `/accounting/general-ledger` | `accounting:read` |
| `/accounting/ar` | `accounting:read` |
| `/accounting/ap` | `accounting:read` |
| `/accounting/fiscal-periods` | `accounting:update` |
| `/accounting/chart-accounts` | `accounting:read` |
| `/accounting/operations` | `accounting:create` |
| `/accounting/currencies` | `accounting:read` |
| `/accounting/payment-terms` | `accounting:read` |

### CRM (`/crm`)

| Path | Required permission |
|------|---------------------|
| `/crm/customers` | `customers:read` |
| `/crm/customers/new` | `customers:create` |
| `/crm/customers/:id` | `customers:read` |
| `/crm/customers/:id/edit` | `customers:update` |
| `/crm/loyalty` | `loyalty:read` |
| `/crm/loyalty/new` | `loyalty:create` |
| `/crm/loyalty/:ruleId/edit` | `loyalty:update` |
| `/crm/discounts` | `discounts:read` |
| `/crm/discounts/new` | `discounts:create` |
| `/crm/discounts/:discountId/edit` | `discounts:update` |

*Loyalty routes are not in the sidebar tree; Admin still has access.*

### Marketing (`/marketing`)

| Path | Required permission |
|------|---------------------|
| `/marketing/analytics` | `analytics:read` |
| `/marketing/sales-invoices` | `sales_invoices:read` |
| `/marketing/inventory-insights` | `analytics:read` |
| `/marketing/advisory` | `marketing_advisory:run` |
| `/marketing/campaigns` | `ai_advisory:run` |

### AI advisory (`/ai`)

| Path | Required permission |
|------|---------------------|
| `/ai/purchase-reorder` | `ai_advisory:run` |
| `/ai/hr-anomalies` | `ai_advisory:run` |
| `/ai/invoice-match` | `ai_advisory:run` |

### System admin (`/admin`)

| Path | Required permission | Extra guard |
|------|---------------------|-------------|
| `/admin/users` | `users:read` | |
| `/admin/users/new` | `users:create` | |
| `/admin/users/:id` | `users:read` | |
| `/admin/users/:id/permissions` | `users:read` | |
| `/admin/roles` | `roles:read` | |
| `/admin/roles/:code` | `roles:read` | |
| `/admin/branches` | `branches:read` | |
| `/admin/terminals` | `terminals:read` | |
| `/admin/backups` | `backups:read` | Run uses `backups:run` via API |
| `/admin/notifications` | `notifications:read` | |
| `/admin/notifications/routine` | `notifications:read` | |
| `/admin/notifications/send-now` | `notifications:read` | **Role:** `ADMIN` is in org notification manager set |
| `/admin/notifications/history` | `notifications:read` | **Role:** org notification manager |

**Org notification manager** (`RequireOrgNotificationManager`): allowed role codes are `OWNER`, `ADMIN`, `IT_ADMIN`. Admin can use **Send now** and **History** under `/admin/notifications/*`.

---

## Sidebar navigation (visible items)

When permissions are loaded, Admin sees **all** sidebar sections and children defined in `web/src/config/navigation.ts`:

| Section | Items |
|---------|--------|
| **Operations** | Dashboard, Notifications inbox, POS, Catalog (products, categories, attributes), Inventory (stock, adjustments, transfers), Purchasing (orders, suppliers, invoice match, AI purchase reorder) |
| **People** | HR (employees, attendance, leave, anomalies), Payroll (overview, policies, runs) |
| **Finance** | Accounting (journal, trial balance, income statement, taxes, balance sheet, general ledger, chart of accounts, AR, AP, fiscal periods, operations, currencies, payment terms) |
| **Growth** | CRM (customers, discounts), Marketing (analytics, sales invoices, inventory insights, advisory, campaigns) |
| **System** | Admin (users, roles, branches, terminals, backups, notifications) |

Items without a `permission` field (e.g. top-level Catalog, HR, Payroll) still render; child links enforce RBAC.

---

## API access (backend)

Every `require_permission(...)` check in `app/api/v1/` succeeds for Admin on current resources. Notable API-only capabilities (no dedicated SPA screen):

- `GET /api/v1/audit-logs` — `audit_log:read`
- Global config endpoints — `config:read`, `config:update`
- Terminal authorization, invoice scan validate, payroll export, backup run, loyalty adjust, sales void, etc.

Admin can call **all** documented REST operations that map to the permission table above.

---

## What is *not* hidden from Admin

| Topic | Behavior for Admin |
|-------|-------------------|
| **Route guards** | Passes every `RequirePermission` in `router.tsx` |
| **Sidebar** | All nav entries that declare a permission |
| **Deep links** | Sub-routes not in sidebar (loyalty, payroll approvals, inventory receipts/damage/stock-count, etc.) are allowed when URL is known |
| **Org notifications** | Send now & history allowed via role code, not only via permission |
| **Executive dashboard** | Shown on `/dashboard` |
| **403 redirect** | Missing permission redirects to `/dashboard`, not a partial UI |

---

## Practical constraints (not RBAC)

These apply even with full Admin permissions:

1. **Branch context for POS** — Must select a branch at `/select-branch` before `/pos/*` (except navigating away).
2. **Bootstrap administrator** — If `DEFAULT_ADMIN_EMAIL` matches the user, extra API rules apply (`app/services/bootstrap_admin_protection.py`): cannot be deactivated, cannot remove `ADMIN` role, cannot add other roles, cannot use permission overrides, password reset blocked. This protects the seeded account, not the role itself.
3. **User permission overrides** — A `deny` override on a specific user could remove a permission even from Admin; normal Admin users without overrides have the full set.
4. **System roles** — Custom roles can be edited; built-in roles (including Admin) cannot be deleted (`is_system` on role model).
5. **No SPA for audit log / global config** — Permissions exist; use API or future UI.

---

## Comparison with other system roles (context)

| Role | Scope |
|------|--------|
| **ADMIN** | All permissions in DB |
| **OWNER** | Broad explicit selectors; no POS or invoice scans — see [SYSTEM_ROLES_ACCESS.md](./SYSTEM_ROLES_ACCESS.md) |
| **IT_ADMIN** | Users, roles, config, branches, terminals, onboarding read, backups, notifications |
| **HR_MANAGER** | Employees, payroll, onboarding, notifications |
| **Others** | Domain-scoped (accountant, cashier, warehouse, marketing, floor staff) |

For a new deployment, the first user created by seed typically has **only** the `ADMIN` role and therefore matches this document end-to-end.

---

*Generated from Mezan codebase state. Re-run seed or inspect `permissions` / `role_permissions` tables if permissions are added after this document was written.*
