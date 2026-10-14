---
"litzjs": patch
---

Strip server-only handlers from route, layout, resource, and API route modules that have a `.client` companion file. Generated client manifests still import the companion, but an app passed to `defineApp(...)` imports the server module directly, and the browser imported it unprojected. Loaders, actions, middleware, and their dependencies were then shipped in client assets. The server module is now always projected when it is reached from the client graph.
