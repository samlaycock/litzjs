---
"litzjs": patch
---

Strip server-only `input` parsers from client projections of `defineRoute`, `defineLayout` and `defineResource`. Input validators run only on the server, but client builds previously kept the `input` option and every import and top-level value it referenced, which could ship authentication or validation logic and secrets in public browser assets.

Client projection now also resolves static computed option keys such as `["input"]` and `["loader"]`, and fails the build with an explicit error when a route, layout or resource definition uses spread properties, dynamic computed keys or accessors, since server-only options inside them cannot be stripped safely.
