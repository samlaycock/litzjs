---
"litzjs": minor
---

Support FetchableDevEnvironment in dev server for Cloudflare Workers Vite plugin compatibility.

When the `rsc` environment is a `FetchableDevEnvironment` (e.g. provided by `@cloudflare/vite-plugin`), the dev server now proxies requests through `dispatchFetch()` instead of using in-process module loading. The existing `RunnableDevEnvironment` codepath is completely unchanged.
