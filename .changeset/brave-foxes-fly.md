---
"litzjs": minor
---

Guard non-runnable RSC dev environments and support Cloudflare fixture builds in clean checkouts.

The Vite dev middleware now bypasses the in-process resource, route, API, and document handlers when the `rsc` environment has no runnable server module loader. This prevents crashes in non-runnable environments while preserving the existing runnable codepath.

The root development install now also includes `@cloudflare/vite-plugin`, which keeps the Cloudflare smoke fixture and related production helper tests working in clean CI checkouts.
