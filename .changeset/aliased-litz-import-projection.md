---
"litzjs": patch
---

Strip server-only definition options from client builds when Litz factories and `server` are imported with aliases (`import { defineRoute as make, server as mark } from "litzjs"`) or through a namespace (`import * as litz from "litzjs"`). Client projection now also fails the build instead of emitting raw server code when a route, layout, resource, or API route definition's options are not an inline object literal.
