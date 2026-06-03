# Plan Divergences — Stub

**Status:** Consolidated into [PROJECT_STATE.md](PROJECT_STATE.md).

This document previously tracked pragmatic deviations from the authoritative design docs. All divergences have been consolidated into `PROJECT_STATE.md`:

- Active divergences (D-1 through D-6): See [PROJECT_STATE.md §4.3](PROJECT_STATE.md#43-known-divergences)
- Closing actions and owners: See [PROJECT_STATE.md §4.3](PROJECT_STATE.md#43-known-divergences)

**Summary of current divergences:**

| ID | Divergence | Status |
|----|------------|--------|
| D-1 | Refresh token in `sessionStorage` not httpOnly cookie | Closing via Epic 15.3 + W-7.2 |
| D-2 | Dashboard permission is `analytics:read` not `bi:read` | Closed — correction applied |
| D-3 | Backups UI shows last run only | Optional backend endpoint pending |
| D-4 | AI idempotency: client header only | Optional store pending |
| D-5 | Branch admin fields match model only | Model extension pending if needed |
| D-6 | Effective permissions client-computed | Optional endpoint pending |

---

*This stub exists to preserve file path references. Do not add new content here; update PROJECT_STATE.md §4.3 instead.*
