---
"litzjs": patch
---

Fix server manifest injection silently missing namespace import call shapes.

The `injectServerManifestIntoServerEntry` transform now handles `import * as ns from "litzjs/server"` followed by `ns.createServer()` calls, in addition to the previously supported named import form. It also throws a descriptive error when a `litzjs/server` import is detected but no `createServer()` call can be located and transformed, replacing the previous silent non-injection that produced incorrectly wired builds.
