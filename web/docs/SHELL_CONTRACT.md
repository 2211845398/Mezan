# Admin shell contract (`AdminLayout`)

Single reference for layout engineers. RTL uses **logical** Tailwind only (`ms-*`, `border-e`, etc.).

## Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| `< lg` (default) | Primary sidebar **hidden**. Navigation opens in a **Sheet** (z-index below modals, above content). |
| `lg+` | Sidebar **visible** as a column; Sheet unused for nav. |

## Dimensions

- **Topbar height:** `4rem` (`h-16`) — global chrome.
- **Sidebar expanded:** `16rem` (`w-64`) content column.
- **Sidebar collapsed (desktop):** `4.5rem` (`w-[4.5rem]`) icon rail; labels hidden; tooltips on icons.
- **Main content:** `flex-1`, `overflow-y-auto`; horizontal padding `p-4`–`p-6` at `lg`.

## Z-index

- Sheet overlay/content: shadcn defaults (`z-50` on content) — must stay **below** full-screen dialogs if both exist.
- Topbar: `sticky top-0 z-40` optional later; currently static in flow.

## Scroll ownership

- **Sidebar nav:** `flex-1 overflow-y-auto` inside the aside so long menus scroll **inside** the rail, not the window.
- **Main:** Only `<main>` scrolls for document content; Topbar + sidebar chrome do not scroll away on desktop.

## Responsibilities

| Area | Owns |
|------|------|
| **Sidebar** | App brand, collapse toggle (desktop), RBAC-filtered nav from `config/navigation.ts`. |
| **Topbar** | Mobile menu trigger, **current page title** (from `getTitleKeyForPath`), optional branch line, lang, theme, sign-out. |
| **Main** | `<Outlet />` — feature pages only. |

## State persistence

- `sidebarCollapsed`: persisted under storage key `mezan-ui-shell` (Zustand `persist`, **partial** — only collapsed flag).
- `mobileNavOpen`: memory only; closes after route change.

## Performance

- Shell components **must not** import chart libraries, PDF, or feature `api.ts` modules. Heavy UI loads inside route chunks or lazy feature subchunks.
