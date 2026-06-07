---
name: mobile employee app
overview: "Detailed English implementation plan for the Flutter employee app, split by phases, screens, endpoints, and exact visual parity with the existing web design system."
todos:
  - id: foundation
    content: "Set up Flutter structure, theme tokens, navigation, localization, storage, and API client"
    status: pending
  - id: user-roles
    content: "Implement auth bootstrap, employee profile loading, branch context, and role-based visibility"
    status: pending
  - id: dashboard-attendance
    content: "Build Dashboard and QR attendance flow"
    status: pending
  - id: requests-feedback
    content: "Build leave requests and HR feedback screens"
    status: pending
  - id: payroll-notifications
    content: "Build payroll statement and in-app notifications"
    status: pending
  - id: profile-extras
    content: "Build profile, language toggle, dark mode, and digital employee badge"
    status: pending
  - id: stock-finder
    content: "Build role-gated Stock Finder for FLOOR_STAFF"
    status: pending
isProject: false
---

# Flutter Employee App Detailed Implementation Plan

## Current State
The Flutter app in [mobile](mobile) is still the default starter app. The current [mobile/lib/main.dart](mobile/lib/main.dart) only contains the counter demo, so the employee app should be built as a fresh mobile application structure while reusing the existing backend contracts and copying the web visual system.

The web app already has the brand design tokens in [web/src/styles/tokens.css](web/src/styles/tokens.css), Tailwind mappings in [web/tailwind.config.ts](web/tailwind.config.ts), shared card/button/input primitives in [web/src/components/ui](web/src/components/ui), and feature APIs in [web/src/features](web/src/features). The mobile app must treat those files as the source of truth.

## Design Parity Contract
The mobile app must look like the web app, not like a generic Flutter template.

### Brand Tokens
- Primary brand: Palm Green `#003218`, from `--primary: 149 100% 10%`.
- Secondary brand: Crown Gold `#AA8E60`, from `--secondary: 37 30% 52%`.
- Light background: white `#FFFFFF`.
- Light foreground: Palm Green `#003218`.
- Dark background: deep palm, `hsl(149 38% 8%)`.
- Dark card: `hsl(149 34% 10%)`.
- Dark foreground: `hsl(40 25% 96%)`.
- Success: `hsl(142.1 76.2% 36.3%)`.
- Warning: `hsl(32 94% 44%)`.
- Destructive: `hsl(0 84.2% 60.2%)`.
- Border/input: `hsl(149 12% 88%)` in light mode and `hsl(149 22% 18%)` in dark mode.
- Focus/ring: `hsl(149 55% 32%)` in light mode and gold `hsl(37 45% 55%)` in dark mode.

### Typography
- Arabic font: `Tajawal`, then `IBM Plex Sans Arabic`, then system fallback.
- English font: `Inter`, then system fallback.
- Numeric values should use the English font with tabular numbers, matching the web `.num-latin` behavior.
- Flutter should bundle the fonts through `pubspec.yaml` instead of relying on runtime CDN loading.

### Components
- Cards must match the web `Card`: rounded large corners, 1px border, `bg-card`, `text-card-foreground`, and small shadow.
- Card radius:
  - Small: 6px.
  - Default: 8px.
  - Large: 12px.
  - Extra large: 16px.
- Card spacing:
  - Web header/content uses `p-6` which equals 24px.
  - On mobile, use 16px for dense list cards and 20 to 24px for hero cards, while keeping the same visual feel.
- Buttons must match web variants:
  - Primary: Palm Green background, white text.
  - Secondary: Crown Gold background, Palm text.
  - Outline: transparent/background surface with border.
  - Ghost: no border, muted hover/pressed state.
  - Destructive: red background and white text.
- Inputs must match web field chrome:
  - Height around 40px.
  - Rounded 8px.
  - Border color from input token.
  - Focus border changes to ring color.
  - Invalid border changes to destructive color.
- Status badges:
  - Approved/success: green.
  - Pending/warning: amber/yellow.
  - Rejected/destructive: red.
  - Neutral/read: muted background and muted foreground.

## Critical UI/UX Execution Standards
These standards are non-negotiable during implementation. The Flutter app must feel like the mobile version of the Mezan web product, not a Material demo app with Mezan colors.

### Strict Design System Adherence
- Do not use Flutter default Material 3 accent colors, default purple seeds, or unapproved component colors.
- Every screen, widget, loading state, empty state, error state, chip, badge, and action button must pull from the Mezan token mapping defined above.
- Native Android/iOS behavior is allowed only when it does not weaken Mezan visual identity.
- Shadows, borders, contrast, spacing, and text alignment must be tuned to feel like a polished production SaaS product.
- Any component that cannot be matched with stock Flutter widgets should be wrapped in a custom Mezan widget rather than styled ad hoc per screen.

### Typography Precision
- Arabic text must use `Tajawal` with `IBM Plex Sans Arabic` as the secondary fallback.
- English text must use `Inter`.
- Headers should use bold or semibold weights matching the web hierarchy.
- Body text and labels should use regular or medium weights.
- All numeric data must use the English tabular font treatment:
  - Money values.
  - Quantities.
  - Dates.
  - Times.
  - Employee IDs.
  - Barcode or SKU-like values.
- Implement this through a shared `MezanNumberText` or equivalent helper so numeric typography is consistent everywhere.

### High-Fidelity Component Replication
- `MezanCard` must include:
  - 1px mode-dependent border.
  - Card background from the active token set.
  - Soft `shadow-sm` style elevation.
  - 12px radius for normal cards.
  - 16px radius for hero cards, digital badge, and premium surfaces.
- Status badges must use tinted backgrounds and strong text colors:
  - Approved: success tint background with success text.
  - Pending: warning tint background with warning text.
  - Rejected: destructive tint background with destructive text.
  - Read/neutral: muted tint background with muted foreground.
- Buttons must expose clear pressed, hover-equivalent, disabled, loading, and focus states.
- Inputs must never use platform-default borders; focus and validation states must follow Mezan field tokens.

### Error Handling And State UX
- Never show raw exceptions, stack traces, blank white screens, or unstyled API errors to employees.
- Every feature must implement:
  - `MezanLoadingState`.
  - `MezanEmptyState`.
  - `MezanErrorState`.
  - Retry affordance when applicable.
- API `422` validation issues should show human-readable guidance in Arabic and English.
- API `404` states should explain that the requested record was not found or is not available to the employee.
- Connection dropouts should show a friendly offline/network message and a retry button.
- Empty lists such as no payslips, no notifications, no leave requests, or no stock result must show styled empty states with concise microcopy.

### Motion And Response
- Buttons must have visible pressed feedback using Mezan color overlays, not generic ripple colors.
- Long network loads such as payroll, notifications, and stock search should use shimmer skeletons or subtle loading placeholders.
- QR scanning should transition immediately to the camera view with a clear scanning frame and gentle feedback after a successful scan.
- Expansion tiles, tab switches, and card reveals should use short, soft animations that do not feel slow or decorative.

## Recommended Flutter Architecture
Use a feature-first structure under [mobile/lib](mobile/lib):

- `app`: application bootstrap, router, app shell, theme mode, locale state.
- `core/api`: HTTP client, auth interceptors, API errors, idempotency helpers.
- `core/theme`: Mezan colors, typography, radii, shadows, component themes.
- `core/i18n`: localization delegates and AR/EN dictionaries.
- `core/storage`: secure token storage and lightweight preferences.
- `shared/widgets`: Mezan card, button, input, badge, number text, shimmer, empty state, loading state, error state.
- `features/auth`: login, session, current user, roles, permissions.
- `features/dashboard`: home screen, attendance cards, QR attendance flow.
- `features/payroll`: payroll list and payslip details.
- `features/requests`: leave requests and HR feedback.
- `features/notifications`: notification list, unread badge, mark read.
- `features/profile`: profile, settings, digital badge.
- `features/stock`: stock finder, barcode lookup, role guard.

## Phase 1: Foundation And Pixel Parity
Goal: replace the Flutter starter app with the Mezan mobile shell.

### Work Items
- Replace `MyHomePage` counter demo with `MezanApp`.
- Add a router with an auth boundary and an employee app shell.
- Add a bottom navigation layout:
  - Home.
  - Payroll.
  - Requests.
  - Profile.
  - Stock appears only for `FLOOR_STAFF`.
- Add shared design primitives:
  - `MezanCard`.
  - `MezanStatCard`.
  - `MezanButton`.
  - `MezanTextField`.
  - `MezanBadge`.
  - `MezanListTileCard`.
  - `MezanEmptyState`.
  - `MezanLoadingState`.
  - `MezanErrorState`.
- Add light and dark themes copied from the web tokens.
- Add Arabic RTL and English LTR layout support.
- Add date, money, and number formatting helpers.

### Dependencies To Add
- HTTP: `dio` or `http`.
- Secure storage: `flutter_secure_storage`.
- State management: a small provider solution such as `riverpod` or simple `ChangeNotifier` if we keep MVP light.
- Localization: Flutter built-in `flutter_localizations` plus AR/EN app strings.
- QR scanning: `mobile_scanner`.
- QR/barcode rendering: `qr_flutter` or `barcode_widget`.
- Image/network cache if needed: `cached_network_image`.

### Acceptance Criteria
- Light and dark modes visually match the web token values.
- Arabic uses RTL and Tajawal-style typography.
- English uses LTR and Inter-style typography.
- Buttons, cards, inputs, badges, and spacing match the web components closely.
- App starts on the employee shell after authentication state is resolved.

## Phase 2: Auth, User Context, And Roles
Goal: the app knows who the employee is, which branch they belong to, and which features they can see.

### Existing Endpoints
All paths below are relative to the API base. The web client uses paths without `/api/v1`, while the OpenAPI schema exposes them under `/api/v1`.

- `POST /auth/login`
  - Request: login credentials from existing `LoginRequest`.
  - Response: existing `LoginResponse`.
- `POST /auth/refresh`
  - Request: existing `RefreshRequest`.
  - Response: existing `TokenResponse`.
- `POST /auth/logout`
  - Request: existing `LogoutRequest`.
- `GET /auth/me`
  - Response fields include `id`, `email`, `first_name`, `father_name`, `family_name`, `status`, `branch_id`, `preferred_language`, `avatar_url`, and `employee_profile_id`.
- `GET /auth/me/branch`
  - Response: `id`, `name`, `code`.
- `GET /auth/me/roles`
  - Response: `{ "codes": string[] }`.
- `GET /auth/me/permissions`
  - Response: list of permissions.
- `PATCH /auth/me`
  - Used for preferred language and profile updates if allowed.
- `POST /auth/me/avatar`
  - Optional profile avatar upload.

### Mobile Behavior
- After login, load `/auth/me`, `/auth/me/branch`, and `/auth/me/roles`.
- Cache only the minimum required session/user data.
- Use role code `FLOOR_STAFF` for the Stock Finder guard.
- Use `employee_profile_id` as the key for employee-specific attendance, payroll, and leave features.
- If `employee_profile_id` is missing, show a controlled empty state explaining that the account is not linked to an employee profile.

### Acceptance Criteria
- The mobile app can bootstrap the same user identity as the web.
- Role-based visibility is deterministic.
- Stock Finder is hidden unless roles include `FLOOR_STAFF`.

## Phase 3: Dashboard And Attendance
Goal: the first screen gives the employee daily information and a fast QR attendance action.

### Screen Layout
- Top app bar:
  - Greeting with employee name.
  - Branch chip.
  - Notification bell with unread count.
- Hero attendance card:
  - Title: "Today's Attendance".
  - Current status: not checked in, checked in, or completed.
  - Large primary button: "Scan Attendance QR".
  - Secondary text: "GPS is not required for this first version."
- Quick cards:
  - Today's shift.
  - Remaining leave balance.
  - Last attendance log.
- Optional weekly schedule preview card:
  - Today row.
  - Next shift row.

### Existing Endpoints
- `GET /employees/me/schedules`
  - Response: `WeeklyScheduleRead[]`.
  - Fields: `weekday`, `start_time`, `end_time`, `is_day_off`, `branch_id`.
- `GET /employees/me/leave-balance`
  - Response: `VacationLeaveBalanceRead`.
  - Fields: `calendar_year`, `entitlement_days`, `used_days`, `remaining_days`.
- `GET /employees/{employee_profile_id}/attendance`
  - Response: `AttendanceLogRead[]`.
  - Current endpoint requires `employees:read`; for normal employees this may need a self-service endpoint.
- `POST /employees/{employee_profile_id}/attendance/clock-in`
  - Existing request: `{ "branch_id": number, "clock_in_at": string | null }`.
  - Existing response: `AttendanceLogRead`.
  - Current endpoint requires `employees:update`; for mobile self-service this should be wrapped or relaxed.
- `POST /employees/{employee_profile_id}/attendance/clock-out`
  - Existing request: `{ "clock_out_at": string | null }`.
  - Existing response: `AttendanceLogRead`.
  - Current endpoint requires `employees:update`; for mobile self-service this should be wrapped or relaxed.

### Recommended Mobile-Specific Backend Additions
- `GET /employees/me/attendance`
  - Returns the signed-in employee's attendance logs without `employees:read`.
- `POST /employees/me/attendance/clock-in`
  - Request: `{ "branch_id": number, "clock_in_at": string | null, "qr_payload": string | null }`.
  - Server derives `employee_profile_id` from the authenticated user.
  - No GPS required for MVP.
- `POST /employees/me/attendance/clock-out`
  - Request: `{ "clock_out_at": string | null, "qr_payload": string | null }`.
  - Server derives `employee_profile_id`.

### QR Flow
- User taps "Scan Attendance QR".
- Camera opens immediately.
- App scans the QR code generated by the admin/web screen.
- App sends the scanned payload plus current timestamp.
- If the employee has no open shift, call clock-in.
- If the employee already has an open shift, call clock-out.
- Show success card and refresh attendance logs.

### Acceptance Criteria
- Dashboard loads with schedule and leave balance.
- QR scan posts attendance without GPS.
- The UI uses the same card/badge/button styling as the web.
- Errors are shown as Mezan destructive alert cards, not raw exceptions.

## Phase 4: Payroll Statement
Goal: a simple monthly payroll screen using expansion tiles, matching the user's proposed UX.

### Screen Layout
- Header card:
  - Current month net pay if available.
  - Status badge: draft, approved, paid if available.
- Month list:
  - `May 2026`, `April 2026`, etc.
  - Each month is an expansion tile.
- Expanded month details:
  - Base salary.
  - Overtime.
  - Bonus.
  - Automatic deductions.
  - Manual deductions.
  - Total deductions in destructive/red.
  - Net amount.
  - Paid date if available.
- Deductions detail:
  - If the backend exposes reason-level details, show each reason under the deduction.
  - If the backend only exposes totals, show the available totals and add backend work for reasons.

### Existing Endpoints
- `GET /payroll/payslips`
  - Query: `status`, `period_start`, `period_end`, `q`, `limit`, `offset`.
  - Response: paginated list of `PayslipRead`.
  - Current endpoint requires `payroll:read`; normal employees may need a self-service endpoint.
- `GET /payroll/payslips/{payslip_id}`
  - Response: `PayslipRead`.
  - Current endpoint requires `payroll:read`.
- `GET /payroll/periods/{year}/{month}`
  - Response: `PayrollPeriodRead` with rows and summary.
  - Designed for admin/HR payroll overview, not employee self-service.

### Recommended Mobile-Specific Backend Additions
- `GET /payroll/me/payslips`
  - Query: `limit`, `offset`, optional `year`.
  - Response: list of payslips for the signed-in employee only.
- `GET /payroll/me/payslips/{year}/{month}`
  - Response: one employee payslip for the selected month.
- Optional: add deduction line details to the response:
  - `deduction_lines: [{ amount, reason, source, date }]`.

### Acceptance Criteria
- Payroll screen never exposes other employees' payroll data.
- Expansion tiles are visually aligned with Mezan cards.
- Money uses Latin digits and consistent currency formatting.
- Deductions are red/destructive and reasons appear directly below when available.

## Phase 5: Requests And HR Feedback
Goal: one screen with two tabs: leave requests and HR feedback.

### Leave Tab Layout
- Form card:
  - Leave type dropdown: vacation, sick, personal.
  - Start date.
  - End date.
  - Optional reason.
  - Submit button.
- Balance card:
  - Entitlement days.
  - Used days.
  - Remaining days.
- Previous requests list:
  - Type.
  - Date range.
  - Status badge.
  - Reason.
  - Review notes when available.

### Existing Leave Endpoints
- `GET /employees/me/leave-balance`
  - Response: `VacationLeaveBalanceRead`.
- `POST /employees/me/leave-requests`
  - Request: `LeaveRequestCreate`.
  - Shape: `{ "leave_type": "vacation" | "sick" | "personal", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "reason": string | null }`.
  - Response: `LeaveRequestRead`.
- `GET /leave-requests`
  - Query: `status`, `employee_profile_id`, `limit`, `offset`.
  - Response: `LeaveRequestRead[]`.
  - Current endpoint requires `employees:read`; normal employees may need a self-service endpoint.
- `GET /employees/{employee_profile_id}/leave-requests`
  - Response: `LeaveRequestRead[]`.
  - Current endpoint requires `employees:read`.

### Recommended Leave Backend Addition
- `GET /employees/me/leave-requests`
  - Query: optional `status`, `limit`, `offset`.
  - Response: signed-in employee's `LeaveRequestRead[]`.

### HR Feedback Tab Layout
- Text area card:
  - Placeholder: "Write your note or issue here".
  - Optional category: issue, suggestion, HR question.
  - Submit button.
- Previous feedback list:
  - Optional for MVP; can be hidden if backend is not ready.

### Backend Gap
No obvious HR feedback endpoint was found in the current web/backend files. This should be added for the mobile MVP if HR feedback is required.

### Recommended Feedback Backend Addition
- `POST /hr/feedback`
  - Request: `{ "message": string, "category": "issue" | "suggestion" | "question" | null }`.
  - Server derives `user_id`, `employee_profile_id`, and `branch_id`.
  - Response: `{ "id": number, "status": "submitted", "created_at": string }`.
- Optional:
  - `GET /hr/feedback/me`
  - Response: previous feedback submitted by the employee.

### Acceptance Criteria
- Employees can submit leave without HR permissions.
- Previous leave requests show clear color-coded status.
- HR feedback either uses a real endpoint or is explicitly deferred with a disabled/coming-soon state.

## Phase 6: In-App Notifications
Goal: add a bell on the dashboard and a read-only notification center.

### Screen Layout
- Dashboard bell:
  - Shows unread count badge.
  - Opens notification center.
- Notification center:
  - List of notification cards.
  - Title, body, sent/created time.
  - Unread state uses stronger card/badge styling.
  - Read state uses muted styling.
  - Actions: mark one as read, mark all as read, optionally clear read.

### Existing Endpoints
- `GET /notifications/deliveries/me`
  - Query: `limit`, `unread_only`.
  - Response: `{ "items": NotificationDelivery[] }`.
- `GET /notifications/deliveries/me/unread-count`
  - Response: `{ "unread_count": number }`.
- `PATCH /notifications/deliveries/{delivery_id}/read`
  - Response: updated `NotificationDelivery`.
- `POST /notifications/deliveries/me/read-all`
  - Response: `{ "updated": number }`.
- `DELETE /notifications/deliveries/me/read`
  - Clears read notifications.

### Acceptance Criteria
- Bell count refreshes periodically or after returning to dashboard.
- Notification cards match web card and badge styles.
- No push notification server setup is required for MVP.

## Phase 7: Profile, Settings, Language, Dark Mode, And Digital Badge
Goal: provide employee identity and professional settings without heavy backend work.

### Profile Screen Layout
- Employee identity card:
  - Avatar.
  - Full name.
  - Employee ID.
  - Branch.
  - Role.
  - Email and phone if available.
- Settings card:
  - Language switch: Arabic / English.
  - Theme mode: system / light / dark.
  - Logout.
- Digital badge card:
  - Employee name.
  - Employee ID.
  - Branch.
  - Static QR or barcode generated from the employee ID.
  - Works offline after profile data is cached.

### Existing Endpoints
- `GET /auth/me`
- `GET /auth/me/branch`
- `GET /auth/me/roles`
- `PATCH /auth/me`
  - Use for `preferred_language` if supported.
- `POST /auth/logout`

### Backend Considerations
- If employee full name or role label is not enough in `/auth/me`, use `GET /employees/{employee_profile_id}` only if the employee has permission.
- Better mobile addition:
  - `GET /employees/me/profile`
  - Response includes enriched fields already used by HR:
    - `employee_profile_id`.
    - `user_id`.
    - `full_name`.
    - `email`.
    - `phone`.
    - `avatar_url`.
    - `branch_id`.
    - `branch_name`.
    - `role_code`.
    - `role_name`.
    - `hire_date`.
    - `identity_document_number` if safe to expose.

### Acceptance Criteria
- Language changes immediately and layout direction updates correctly.
- Dark mode matches the web `.dark` tokens.
- Digital badge renders offline.
- Logout clears session and returns to login.

## Phase 8: Stock Finder For Floor Staff
Goal: help floor staff answer customer stock questions quickly.

### Visibility Rule
- Show the Stock tab only when `/auth/me/roles` includes `FLOOR_STAFF`.
- Hide it for normal employees, admins, and non-floor roles unless explicitly allowed.

### Screen Layout
- Search card:
  - Product name, SKU, variant SKU, or barcode/reference input.
  - Barcode scan button.
- Current branch result card:
  - Product name.
  - Variant name/attributes.
  - Current branch name.
  - Available quantity.
  - Reserved and damaged quantity if useful.
- Other branches list:
  - Branch name.
  - Available quantity.
  - In transit if useful.
- Empty/error states:
  - No product found.
  - Product exists but no stock.
  - No network.

### Existing Endpoints
- `GET /inventory/stock-on-hand`
  - Query: `branch_id`, `category_id`, `variant_id`, `q`, `reorder_only`, `status`, `sort`, `limit`, `offset`.
  - Response fields include `branch_id`, `branch_name`, `product_id`, `variant_id`, `sku`, `variant_sku`, `variant_attributes`, `variant_name`, `reference_code`, `product_name`, `on_hand`, `reserved`, `damaged`, `available`.
- `GET /products`
  - Query includes `q`, `branch_id`, `in_stock_only`, `limit`, `offset`.
  - Useful if the stock endpoint is not enough for product search.
- `GET /products/variants/search`
  - Query includes `q`, `product_id`, `attribute_value_id`, `limit`, `offset`.
  - Useful for matching variants before stock lookup.

### Recommended Stock Backend Addition
- `GET /inventory/stock-finder`
  - Query: `q` or `barcode`, optional `branch_id`.
  - Response grouped for mobile:
    - `product_id`, `variant_id`, `product_name`, `variant_name`, `sku`, `barcode`.
    - `current_branch: { branch_id, branch_name, available, on_hand, reserved, damaged }`.
    - `other_branches: [{ branch_id, branch_name, available, on_hand, reserved, damaged }]`.
- This avoids the mobile app doing grouping logic across raw stock rows.

### Acceptance Criteria
- Floor staff can search by text or scan a barcode.
- Current branch appears first.
- Other branches are sorted by available quantity or branch priority.
- Screen is read-only.

## Phase 9: Testing And Release Readiness
Goal: make the first mobile version reliable enough for daily employee use.

### Tests
- Unit tests:
  - Theme token mapping.
  - API response parsing.
  - Role guard logic.
  - Date and money formatting.
- Widget tests:
  - Dashboard cards.
  - Payroll expansion tile.
  - Leave request form validation.
  - Notification list states.
  - Profile language/theme toggles.
- Manual tests:
  - Arabic RTL layout.
  - English LTR layout.
  - Light/dark mode.
  - Login/logout.
  - QR attendance scan.
  - Offline digital badge.
  - Stock Finder hidden/visible by role.

### Release Checklist
- API base URL configurable per environment.
- Secure token storage enabled.
- Camera permission strings configured on Android/iOS.
- Network error handling consistent.
- Empty states translated.
- App icon/splash updated to Mezan brand.
- No Flutter demo text remains.

## Final Suggested Build Order
1. Foundation, design tokens, theme, fonts, and shell.
2. Auth bootstrap, roles, branch, and employee profile.
3. Dashboard with schedule and leave balance.
4. QR attendance using the existing endpoints or new self-service endpoints.
5. Requests screen with leave form and previous leave requests.
6. Notifications bell and notification center.
7. Payroll expansion tile screen.
8. Profile settings, language, dark mode, and digital badge.
9. Stock Finder for `FLOOR_STAFF`.
10. Testing, polish, camera permissions, and release build cleanup.

## Key Backend Gaps To Decide Before Implementation
- Add self-service attendance endpoints or allow current attendance endpoints for employees.
- Add `GET /employees/me/attendance`.
- Add `GET /employees/me/leave-requests`.
- Add employee-only payroll endpoints under `/payroll/me`.
- Add HR feedback endpoint if the feedback tab is required in MVP.
- Optionally add `/inventory/stock-finder` to simplify mobile stock results.