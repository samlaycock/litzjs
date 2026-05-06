---
"litzjs": patch
---

Extend dev watcher and HMR to cover `.js` and `.jsx` route-like modules.

Previously, the default manifest glob patterns only matched `.ts` and `.tsx` files, and the `hotUpdate()` hook filtered on the same extensions. This meant `.js` and `.jsx` route, resource, and API files were discovered at startup (AST parsing supports all four extensions) but were silently ignored during file edits.

The default patterns for routes, resources, and API routes now include `.js` and `.jsx`, and the `hotUpdate()` extension guard is expanded to match, so edits to JavaScript route modules trigger watch refresh and client hot-update exactly as TypeScript ones do.
