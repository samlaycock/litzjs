---
"litzjs": patch
---

Replace custom server entry injection with explicit manifest and base wiring.

Custom server entries now import `serverManifest` from `virtual:litzjs:server-manifest` and `base` from `virtual:litzjs:base`, then pass both to `createServer({ base, manifest: serverManifest })` directly. The Vite plugin still generates a default server entry with explicit manifest and base wiring when no custom server entry is configured, but it no longer rewrites user server files or rejects indirect `createServer` wrappers.
