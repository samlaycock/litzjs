---
"litzjs": patch
---

Fix dev and production smoke regressions where root document routes could return `Not Found` and resource HMR could keep rendering stale server view results. Nitro builds now bundle the resolved RSC server entry and serve the app document fallback, dev document middleware handles `/`, and resource HMR invalidates active resource caches so edits to resource files update without a full refresh.
