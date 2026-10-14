---
"litzjs": patch
---

Strip server-only `input` parsers from client projections of `defineRoute`, `defineLayout` and `defineResource`. Input validators run only on the server, but client builds previously kept the `input` option and every import and top-level value it referenced, which could ship authentication or validation logic and secrets in public browser assets.
