# `web/` — Mezan frontend

React 18 + Vite 7 + TypeScript strict SPA. Arabic-first, RTL-first. Consumes the
FastAPI backend at `/api/v1`.

This README is a quick-start + troubleshooting reference. The authoritative
engineering plan is [`../WEB_FRONTEND_PLAN.md`](../WEB_FRONTEND_PLAN.md); epic
progress lives in [`../PROJECT_STATE.md`](../PROJECT_STATE.md) §5.

---

## Prerequisites

- **Node 22 LTS** (pinned in `.nvmrc` and `package.json#engines`).
- **pnpm 9+** (`corepack enable` then `corepack prepare pnpm@9 --activate`).
- **Docker Compose 2.22+** if you choose the Docker-first workflow.

The backend must be reachable at `http://localhost:8000` (host mode) or
`http://api:8000` (Docker mode). Start it with:

```bash
docker compose -f docker-compose.yml up -d db api
```

---

## Quick start — Docker (recommended for uniform dev parity)

Bring up the backend in one compose project and the frontend in a second,
opt-in compose file:

```bash
docker compose -f docker-compose.yml -f docker-compose.web.yml up
```

The `web` service:

- Runs `node:22-bookworm-slim` on `http://localhost:5173`.
- Binds `./web → /app/web` (cached) — source edits are picked up immediately.
- Uses a **named volume** (`web_node_modules`) for `/app/web/node_modules` so
  host/container Node ABIs never clash.
- Proxies `/api` → `http://api:8000` (set via `VITE_API_PROXY_TARGET`).
- Runs Vite in polling mode (`CHOKIDAR_USEPOLLING=true`) so HMR works on
  macOS/Windows bind mounts.

Stop everything:

```bash
docker compose -f docker-compose.yml -f docker-compose.web.yml down
```

---

## Quick start — Host (lightest on RAM, matches `WEB_FRONTEND_PLAN.md` §10.2)

```bash
cd web
pnpm install
pnpm dev
```

Vite listens on `http://localhost:5173`. The dev server proxies `/api` to
`VITE_API_PROXY_TARGET` (default `http://localhost:8000`, overridable via
environment).

---

## Codegen

`pnpm --dir web codegen` regenerates `src/api/generated/schema.ts` from the
backend's `/openapi.json`. The script reads `OPENAPI_URL`:

| Mode   | `OPENAPI_URL` default                |
| ------ | ------------------------------------ |
| Host   | `http://localhost:8000/openapi.json` |
| Docker | `http://api:8000/openapi.json`       |

Examples:

```bash
# Host:
pnpm --dir web codegen

# Docker (one-shot, reuses the same service image):
docker compose -f docker-compose.web.yml run --rm web pnpm codegen
```

Commit the regenerated `schema.ts` in the same PR as the backend change. The
codegen-drift CI gate ships in Epic W-4.

---

## Scripts reference

| Script           | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `pnpm dev`       | Vite dev server with HMR.                                     |
| `pnpm build`     | `tsc --noEmit` + `vite build` — zero TS errors required to succeed. |
| `pnpm preview`   | Serve the built bundle on `http://localhost:4173`.            |
| `pnpm lint`      | ESLint 9 flat config across `src/` and config files.          |
| `pnpm typecheck` | `tsc --noEmit` (reads [`tsconfig.json`](tsconfig.json); resolves `@/*` → `src/`). |
| `pnpm format`    | Prettier + `prettier-plugin-tailwindcss`.                     |
| `pnpm codegen`   | `openapi-typescript` into `src/api/generated/schema.ts`.      |

---

## Environment variables

Copy `.env.example` → `.env.development` and adjust. Only `VITE_*` variables
are shipped to the browser. Parsing is done by `src/config/env.ts` (Zod); a
typo fails fast at module load.

---

## Troubleshooting

### HMR is silent / edits don't reload

- Confirm `CHOKIDAR_USEPOLLING=true` and `WATCHPACK_POLLING=true` (already set
  in `docker-compose.web.yml`).
- Confirm `vite.config.ts` still has `server.watch.usePolling = true`.
- On host mode, polling is usually unnecessary; remove the env vars if the OS
  is Linux with inotify watchers available.

### `node_modules` named volume drifted after a big dep change

The `web_node_modules` named volume caches the install. After a Node or pnpm
upgrade, reset it:

```bash
docker compose -f docker-compose.web.yml down -v
docker compose -f docker-compose.yml -f docker-compose.web.yml up
```

`down -v` destroys the named volume so the next `up` runs a clean
`pnpm install`.

### Codegen URL is wrong

- In Docker, the container resolves `api:8000` via the shared `mezan_network`.
- On host, the backend exposes `localhost:8000` via Compose's port mapping.
- Override explicitly when needed: `OPENAPI_URL=http://x:8000/openapi.json pnpm codegen`.

### `VITE_*` secrets are public by design

Anything shipped to the browser is public. Sentry DSNs and PostHog keys are
rate-limited per project; they are intentionally public. Never place a DB
password or a server secret behind `VITE_*`.

### Font OTS errors / very slow LCP

Typography is bundled via `@fontsource/*` in `src/styles/index.css` (hashed
files under `dist/assets/`). If DevTools shows `invalid sfntVersion` with
`<!DO`, the server returned `index.html` for a missing font URL — rebuild and
use `web/nginx.conf` for production (`docker build -f web/Dockerfile .`).
See `docs/SPA_REFRESH_TROUBLESHOOTING.md`.
