---
"litzjs": patch
---

Normalize invalid client loader and action responses into route faults so non-JSON bodies and malformed JSON no longer surface raw parse errors.
