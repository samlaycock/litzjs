---
"litzjs": patch
---

Align the setup and API surface by documenting `nitro` as a required peer dependency, adding a
`baseUrl` escape hatch to `defineApiRoute().fetch()` for server-side callers, attaching lightweight
marker metadata in `server(...)`, and making `invalid()` accept an omitted options object.
