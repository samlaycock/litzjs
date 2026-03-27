---
"litzjs": patch
---

Implement the documented `offline` route option in the client runtime. Routes with `preserveStaleOnFailure: true` now preserve stale cached data and report an `offline-stale` status when loader requests fail, and routes with a `fallbackComponent` render it when no cached data is available during a failure.
