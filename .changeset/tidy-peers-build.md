---
"litzjs": patch
---

Reduce the default install peer surface by keeping `@vitejs/plugin-rsc` and `typescript` as implementation dependencies while documenting only React, React DOM, and Vite as the core app-provided packages. Clarify that Nitro is only needed for the optional `litzNitro()` adapter.
