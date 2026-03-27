---
"litzjs": minor
---

Remove the legacy `pendingComponent` API, rename route and layout `errorComponent` to `errorBoundary`, and align route, layout, and resource error hooks around explicit `error()` results and fault-only boundaries.

Routes and layouts now render immediately while loaders settle, explicit loader `error()` results are exposed through `useLoaderError()` and merged `useError()`, and uncaught loader or action throws now consistently surface as sanitized `fault` results in production so `errorBoundary` handling matches development.
