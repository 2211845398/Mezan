# UI layout review checklist (`web/`)

Use this list when changing the **admin shell**, **POS full-screen shell**, or **dashboard** so layouts stay consistent, RTL-safe, and touch-friendly. Everything lives in this repository; attach screenshots to PRs if you are matching a mockup—**do not** link or import code from paths outside `web/`.

## Admin shell

1. Sidebar: scroll region, collapse rail, mobile sheet, section labels.
2. Topbar: route title, branch line, global actions; no duplicate product name.
3. Main: padding and max-width; keyboard focus order.

## POS (`features/pos/`)

1. `PosLayout`: header height, nav links, offline badge, pending sync text.
2. `PosRegister`: grid on large screens, single column on small; cart list scroll; primary actions reachable on touch.
3. Drawers (`TenderDrawer`, `ReturnDrawer`): width, close control, RTL logical spacing.

## Tokens and contrast

1. Light and dark: `tokens.css` variables still read correctly on cards and inputs.
2. Primary/secondary brand contrast on buttons (see `WEB_FRONTEND_PLAN.md` §6.1).

## Capture for reviewers (optional)

- Export 1–2 screenshots (RTL + LTR if relevant) and attach to the PR or internal wiki—**snapshots only**, not live links to repos you plan to delete.
