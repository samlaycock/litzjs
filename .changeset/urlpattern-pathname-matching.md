---
"litzjs": major
---

Refactor route pathname matching to follow URLPattern pathname semantics. This is a breaking change that replaces the custom pathname matcher with native `URLPattern` behavior.

**Breaking changes:**

- Route syntax now uses URLPattern pathname syntax instead of Litz-specific syntax
- Wildcard routes: `/docs/*slug` becomes `/docs/:slug*`
- Trailing slashes are now significant (matching native URLPattern behavior)
- Route params are now raw matched substrings (not decoded) - `%2F` stays `%2F`, `%20` stays `%20`
- Malformed percent-encoding no longer causes automatic route non-match or 400 response
- Optional groups: `:id?` syntax supported
- Regex groups: `:id(\d+)` syntax supported
- Repeat groups: `:id*` and `:id+` syntax supported

**Migration guide:**

- Replace all `*name` wildcard patterns with `:name*` (e.g., `/files/*path` → `/files/:path*`)
- Update any code that relied on automatic param decoding - params are now raw
- Remove any custom malformed percent-encoding validation for route matching
- Update tests to account for trailing slash sensitivity
