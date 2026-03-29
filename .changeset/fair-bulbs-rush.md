---
"litzjs": patch
---

Stabilize client HMR for Litz route modules by routing projected route updates through Vite's client
module graph instead of a blanket full reload.

The client runtime now preserves HMR-sensitive runtime singletons across module replacement and
avoids re-importing route modules from the `rsc:update` path, which prevents `useNavigate()` and
related runtime-context crashes during hot updates.
