---
"litzjs": patch
---

Split the internal Vite plugin implementation into focused modules.

`src/vite.ts` now remains the orchestration entrypoint while filesystem discovery, virtual module generation, HMR helpers, dev middleware, path utilities, shared types, and virtual IDs live in dedicated internal modules. Public exports and runtime behavior are unchanged.
