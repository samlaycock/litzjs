---
"litzjs": patch
---

Stop serializing loader `Set-Cookie` and other private headers into batched loader JSON responses. Batched loader cookies are now applied to the real HTTP response, the batch response respects `no-store`/`private` cache policies from any target, and only public `x-litzjs-*` result headers are exposed per target.
