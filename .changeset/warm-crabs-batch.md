---
"litzjs": patch
---

Batch internal route loader requests so layout and route loader chains can reuse one client round-trip while preserving ordered loader results and falling back to individual fetches when batching is unavailable.
