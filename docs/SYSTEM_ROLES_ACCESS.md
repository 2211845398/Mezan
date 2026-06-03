# System Roles — Permissions, Pages & Sidebar Visibility

Source of truth for RBAC on all **eight** built-in roles except `ADMIN` ([ADMIN_ROLE_ACCESS.md](./ADMIN_ROLE_ACCESS.md)).

Roles are defined in `app/services/seed_service.py` (`SYSTEM_ROLE_SPECS`). Selectors `(resource, action)` expand via `*` for all actions on a resource. Re-seeding **syncs** system-role permissions (removes stale grants).

**Sidebar:** `web/src/config/navigation.ts` + `navigationFilter.ts` (parents appear when ≥1 child passes RBAC). **Routes:** `web/src/routes/router.tsx` + `RequirePermission` / role guards.

**Always available (authenticated):** `/profile`, `/notifications` (inbox), routine notification maintenance (self-only for operational roles unless org manager).

**Dashboard (`/dashboard`):** Executive BI → `ADMIN`, `OWNER`, `MARKETING_MANAGER`, `ACCOUNTANT`. Domain dashboards → `IT_ADMIN`, `HR_MANAGER`, `CASHIER`, `FLOOR_STAFF`, `WAREHOUSE_MANAGER` (fallback shortcuts).

**Leave exception:** `OWNER` and `ADMIN` cannot use personal leave filing (`/hr/leave`) — `denyRoleCodes` + `RequirePersonalLeaveAccess`.

**Org-wide notification admin** (`/admin/notifications/send-now`, `.../history`): `OWNER`, `ADMIN`, `IT_ADMIN` only (`app/core/notification_rbac.py`).

---

## Roles at a glance

| Code | Dashboard | Primary scope |
|------|-----------|---------------|
| `OWNER` | Executive BI | Full ops except POS & invoice scans |
| `ACCOUNTANT` | Executive BI | GL, inventory, HR read, payroll, CRM/marketing read |
| `MARKETING_MANAGER` | Executive BI | Growth, discounts, analytics, catalog read |
| `IT_ADMIN` | IT admin | Users, roles, branches, terminals, backups, catalog |
| `HR_MANAGER` | HR manager | Employees, payroll, onboarding, anomalies |
| `WAREHOUSE_MANAGER` | Fallback shortcuts | Catalog, inventory, purchasing (no invoice match) |
| `CASHIER` | Staff schedule | POS, customers read/create |
| `FLOOR_STAFF` | Staff schedule | POS, catalog/inventory read, register customer |

Multi-role users: permissions = **union** of roles; dashboard = highest priority in `resolveRoleDashboardKind.ts`.

---

## Owner (`OWNER`)

**Selectors (no POS, no invoice scans):**  
`catalog:*`, `inventory:*`, `purchase_orders:*`, `suppliers:*`, `ai_advisory:run`, `employees:*`, `payroll:*`, `onboarding:*`, `accounting:*`, `discounts:*`, `analytics:read`, `loyalty:*`, `customers:*`, `marketing_advisory:run`, `users:*`, `roles:*`, `audit_log:read`, `config:*`, `branches:*`, `terminals:*`, `backups:*`, `notifications:*`

**Sidebar:** Operations (dashboard, notifications, catalog, inventory, purchasing except invoice match), People, Finance, Growth, System — **no POS**.

**Blocked routes:** `/pos/*`, `/purchasing/invoice-match`, `/hr/leave` (personal).

---

## Accountant (`ACCOUNTANT`)

**Selectors:** `accounting:*`, `suppliers:*`, `sales_invoices:void`, `catalog:read`, `inventory:*`, `employees:read`, `payroll:*`, `customers:read`, `analytics:read`, `discounts:read`, `loyalty:read`, `branches:read`, `notifications:read`

**Sidebar:** Dashboard, notifications; catalog (products, categories — not attributes); inventory; purchasing (suppliers); HR (employees, attendance, leave); payroll; accounting (all); CRM customers; marketing; admin (branches, routine notifications).

**Hidden:** POS; catalog attributes; `/hr/employees/pending`; admin users/roles/terminals/backups.

---

## Floor Staff (`FLOOR_STAFF`)

**Selectors:** `pos_*`, `pos_carts:*`, `pos_payments:*`, `sales_invoices:create|read`, `returns:create`, `catalog:read`, `inventory:read`, `customers:create`, `terminals:read`, `notifications:read`

**Sidebar:** Dashboard, notifications, POS, catalog (read), inventory (read), CRM → register customer only, admin terminals (read), routine notifications.

**Blocked:** `/crm/customers` index, catalog create/edit, inventory write actions.

---

## HR Manager (`HR_MANAGER`)

**Selectors:** `employees:*`, `payroll:*`, `onboarding:*`, `ai_advisory:run`, `notifications:read|update`

**Sidebar:** Dashboard, notifications; HR (full); payroll (including approvals nav); admin routine notifications only.

---

## IT Admin (`IT_ADMIN`)

**Selectors:** `users:*`, `roles:*`, `audit_log:read`, `config:*`, `branches:*`, `terminals:*`, `backups:*`, `catalog:*`, `notifications:read|update`

**Sidebar:** Dashboard, notifications; catalog (full); admin (full). **Org notification manager.**

---

## Marketing Manager (`MARKETING_MANAGER`)

**Selectors:** `discounts:*`, `analytics:read`, `loyalty:read|update|adjust`, `customers:read|update`, `marketing_advisory:run`, `ai_advisory:run`, `catalog:read`, `notifications:read`

**Sidebar:** Dashboard, notifications; catalog (products, categories); CRM discounts; marketing (all). Customer **list** nav denied via `denyRoleCodes`.

---

## Warehouse Manager (`WAREHOUSE_MANAGER`)

**Selectors:** `catalog:*`, `purchase_orders:*`, `suppliers:read`, `inventory:*`, `stock_adjustments:*`, `ai_advisory:run`, `branches:read`, `notifications:read`

**Sidebar:** Dashboard, notifications; catalog; inventory (incl. stock count); purchasing (orders, suppliers, AI reorder — **not** invoice match); accounting taxes link; admin branches + routines.

---

## Cashier (`CASHIER`)

**Selectors:** `terminals:read`, `pos_*`, `sales_invoices:create|read`, `returns:create`, `customers:create|read`, `notifications:read|update`

**Sidebar:** Dashboard, notifications, POS, CRM customers, routine notifications.

---

## Permission selectors reference (seed)

See `SYSTEM_ROLE_SPECS` in `app/services/seed_service.py`. Re-run seed so `_sync_role_permissions` removes stale grants (e.g. Owner POS, Warehouse invoice scans).

---

## Related documentation

- [ADMIN_ROLE_ACCESS.md](./ADMIN_ROLE_ACCESS.md) — `ADMIN` role.
- `web/src/config/navigation.ts` — sidebar gates.
- `web/src/config/roleNavAccess.ts` — personal leave blocks.
