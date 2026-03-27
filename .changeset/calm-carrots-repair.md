---
"litzjs": patch
---

Guard route and API path matching against malformed percent-encoding so invalid path segments return clean 400 or unmatched results instead of throwing `URIError`.
