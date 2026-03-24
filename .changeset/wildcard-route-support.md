---
"litzjs": minor
---

Add wildcard/catch-all route support to path matching

Routes can now use `*` or `*paramName` as a terminal segment to match any number of remaining path segments:

- `defineRoute("/docs/*slug", { ... })` — captures remaining path as `slug`
- `defineRoute("/admin/*", { ... })` — catch-all without a named param

Wildcard routes rank below static and dynamic segments in specificity sorting, so more specific routes always take priority.
