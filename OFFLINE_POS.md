# Offline POS Plan — Stub

**Status:** Consolidated into [PROJECT_STATE.md](PROJECT_STATE.md).

This document previously contained the engineering plan for offline POS synchronization (backend contracts and frontend responsibilities). All planning content has been consolidated into `PROJECT_STATE.md`:

- Offline POS principles and scope: See [PROJECT_STATE.md §5.1](PROJECT_STATE.md#51-backend-plan)
- Backend models (`PosSyncSubmission`, `PosSyncOperation`, `PosOfflineBundleSnapshot`): See [PROJECT_STATE.md §5.1 Epic 12](PROJECT_STATE.md#51-backend-plan)
- Web PWA + Dexie plan: See [PROJECT_STATE.md §5.2 Epic W-9](PROJECT_STATE.md#52-web-frontend-plan)
- Flutter offline client: See [PROJECT_STATE.md §5.3 Epic M-3](PROJECT_STATE.md#53-fluttermobile-plan)

**Key principles (unchanged):**
1. Backend is single source of truth; client is durable queue + cache
2. Idempotency via `client_uuid` on every operation
3. Provisional identifiers (`TMP-<uuid>`) on client; official fiscal numbers at sync only
4. No offline GL posting or fiscal number allocation

---

*This stub exists to preserve file path references. Do not add new content here; update PROJECT_STATE.md instead.*
