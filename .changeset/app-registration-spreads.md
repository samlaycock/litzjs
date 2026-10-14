---
"litzjs": patch
---

Resolve `defineApp(...)` registrations that use spreads of top-level `const` arrays, `const` array bindings, shorthand properties, `const` aliases of imported definitions, and spreads of `const` option objects, so those routes, resources, and API routes are discovered and their server handlers are stripped from client builds. Registrations that cannot be resolved statically (function calls, conditionals, `let` bindings, definitions declared in the app file, computed option keys, or unresolvable spreads) now fail the build with an error naming the expression instead of being silently dropped from discovery and shipping raw server code to the client. Build-time discovery also rejects `const` registration bindings that are mutated, passed to functions, aliased outside registrations, or exported, and `defineApp(...)` now freezes copies of its `routes`, `resources`, and `apiRoutes` lists, so registrations cannot change after discovery has read them.
