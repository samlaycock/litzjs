---
"litzjs": patch
---

Avoid rebuilding a fresh TypeScript program for each client module projection by tracing top-level dependencies directly from the module AST.
