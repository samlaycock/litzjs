---
"litzjs": patch
---

Replace custom server entry manifest injection with explicit manifest wiring.

Custom server entries now import `serverManifest` from `virtual:litzjs:server-manifest` and pass it to `createServer({ manifest: serverManifest })` directly. The Vite plugin still generates a default server entry with explicit manifest wiring when no custom server entry is configured, but it no longer rewrites user server files or rejects indirect `createServer` wrappers.
