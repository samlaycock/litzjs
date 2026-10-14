---
"litzjs": patch
---

Strip server code from route, layout, resource, and API definitions exported through local export clauses such as `export { r as route }`, and from definitions that are not the first declaration in an exported `const` statement. Client output now keeps only the definition exports, so sibling declarations and export clause entries that only server code uses no longer reach the browser. Modules that export more than one definition (for example a route and a resource) keep all of them in both client and server output. Client builds now fail with an error, instead of shipping the original server module, when a discovered definition module cannot be projected.
