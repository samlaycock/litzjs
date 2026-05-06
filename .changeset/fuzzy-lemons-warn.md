---
"litzjs": patch
---

Tighten Vite HTML entry discovery so unsupported configurations fail fast instead of producing partial client builds.

The Vite integration now allows multiple HTML entry files only when they all share the same external module script, which matches the current single-client-entry runtime model. Projects that use inline module scripts or different external entry modules per HTML file now receive a clear configuration error during startup instead of silently building an incomplete client bundle.
