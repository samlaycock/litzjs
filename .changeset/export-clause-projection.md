---
"litzjs": patch
---

Strip server code from route, layout, resource, and API definitions exported through local export clauses such as `export { r as route }`, and from definitions that are not the first declaration in an exported `const` statement. Client builds now fail with an error, instead of shipping the original server module, when a discovered definition module cannot be projected.
