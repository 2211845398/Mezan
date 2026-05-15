# POS Cart State Machine — Stub

**Status:** Consolidated into [PROJECT_STATE.md](PROJECT_STATE.md).

This document previously contained the cart state machine reference for POS. The state transitions and rules remain valid but are now documented in the consolidated plan:

- Cart state transitions: See [PROJECT_STATE.md §3](PROJECT_STATE.md#3-completed-work) (Epic 3 — Point of Sale)
- Offline POS sync: See [PROJECT_STATE.md §5.1 Epic 12](PROJECT_STATE.md#51-backend-plan)
- Web POS implementation: See [PROJECT_STATE.md §5.2 Epic W-5.2](PROJECT_STATE.md#52-web-frontend-plan)

**Allowed transitions (unchanged):**
| Current | Action | Next |
|---------|--------|------|
| `active` | `park` | `parked` |
| `parked` | `resume` | `active` |
| `active` | `lock` | `checkout_locked` |
| `checkout_locked` | `cancel` | `active` (exit tender; clears lock) |

---

*This stub exists to preserve file path references. Implementation source of truth remains `app/services/cart_service.py` in the backend.*
