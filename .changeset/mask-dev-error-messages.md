---
"litzjs": patch
---

Fix dev server leaking raw error messages to clients in fault responses. The resource, route, and API handler catch blocks now return generic error messages instead of forwarding `error.message`, matching the production server behavior. Full errors are still logged to the terminal via `console.error` for debugging.

Also fix a related issue in the production server where unhandled errors from route and resource handlers could bypass the top-level error masking due to missing `await` on the handler return statements.
