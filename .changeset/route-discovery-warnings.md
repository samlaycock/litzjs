---
"litzjs": patch
---

Warn when matched route-like files import Litz discovery factories but do not export the expected static binding.

The Vite plugin now reports actionable discovery warnings for near-miss route, layout, resource, and API modules that import `defineRoute`, `defineLayout`, `defineResource`, or `defineApiRoute` from `litzjs` but either omit the required export name or use a path that cannot be read statically.
