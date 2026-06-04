# SPA refresh, auth boot, and dev troubleshooting

This note complements [SECURITY.md](../SECURITY.md) and is intended for developers and on-call.

## Problem: infinite loading after browser refresh on protected routes

**Symptoms:** Spinner never clears on refresh (e.g. `/dashboard`) while first client-side navigation works.

### Causes and mitigations

1. **Auth boot must complete after React 18 Strict Mode remounts (dev)**  
   A “run once” guard (`useRef` + early `return`) on the session-restore `useEffect` is unsafe: Strict Mode unmounts and remounts; the first async boot is aborted, the second effect never runs, and `status` can remain `booting` forever.  
   **Fix in repo:** `AuthBoundary` restores the session without a permanent “booted” ref; only per-effect `cancelled` flags are used.

2. **Failed or hanging `/auth/refresh` or `/auth/me`**  
   If the API errors, the app should clear the refresh token and set `unauthenticated` (redirect to `/login`). Check the Network tab for pending or failed auth calls.  
   **Operational:** Ensure the API is reachable and not returning 5xx for these endpoints.

3. **Syntax / transform errors in lazy-loaded routes**  
   Mixing `??` and `||` without parentheses can break SWC/Vite and prevent the chunk from loading, which surfaces as a stuck Suspense state or a failed dynamic import.  
   **Fix:** Use explicit grouping, e.g. `const name = (a ?? b) || c;`

4. **Font OTS / `invalid sfntVersion`**  
   Usually means the browser received HTML (often `index.html`) for a font URL instead of binary font data—common when static files are missing or the server fallback rewrites all paths to the SPA shell.  
   **Fix:** Fonts ship via `@fontsource/*` in `src/styles/index.css` (Vite bundles them under `/assets/`). For nginx production use `web/nginx.conf` (`try_files $uri =404` for `.woff2`). Rebuild after font changes: `pnpm build`.

5. **Vite transform cache**  
   After fixing broken modules, stale cache can still serve bad output.  
   **Action:** Stop dev server, delete `web/node_modules/.vite`, restart `pnpm dev`.

6. **Chrome “Slow 4G” throttling**  
   Makes auth and lazy chunks appear to hang. Use **No throttling** while debugging boot issues.

7. **Global error UI**  
   **Fix in repo:** `AppErrorBoundary` wraps the router inside `main.tsx` and offers a **Reload** action when a render or chunk error is caught.

## Quick checklist

- [ ] Network: `/api/v1/auth/refresh` and `/auth/me` succeed or fail fast with logout behaviour  
- [ ] `public/fonts/**` populated (or expect fallbacks + possible build warnings)  
- [ ] No throttling in DevTools  
- [ ] Clean `.vite` cache if behaviour is inconsistent after a code fix  
