---
"litzjs": patch
---

Strip server-only definition options from client builds when Litz factories and `server` are imported with aliases (`import { defineRoute as make, server as mark } from "litzjs"`) or through a namespace (`import * as litz from "litzjs"`). Local variables and parameters that shadow those imports are left untouched. Method-style `loader() {}` and `action() {}` handlers are now replaced in client output, and the server placeholder is declared whenever any handler is replaced, so plain function loaders and actions no longer crash the client with a `ReferenceError`. Client projection also fails the build instead of emitting raw server code when a route, layout, resource, or API route definition's options are not an inline object literal.
