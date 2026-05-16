---
"litzjs": minor
---

Add explicit `defineApp(...)` registration for routes, resources, and API routes.

Applications can now pass the same app definition to `mountApp(root, { app })` and
`createServer({ app })`, and route/layout/resource definitions accept `clientLoading`
metadata for client loading strategy selection. Duplicate route, resource, and API
route registrations are rejected by path.
