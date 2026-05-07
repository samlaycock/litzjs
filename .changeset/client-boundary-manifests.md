---
"litzjs": minor
---

Add explicit `*.client.*` route module boundaries for browser manifests.

Route, layout, resource, and API modules can now place client-safe definitions in a sibling
`*.client.ts`, `*.client.tsx`, `*.client.js`, or `*.client.jsx` file. The Vite client manifests
prefer those files and skip the legacy AST projection transform for the paired server module,
leaving projection as a compatibility path only for modules without an explicit client boundary.
