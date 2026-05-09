---
"litzjs": patch
---

Keep the mounted route module active during same-route search parameter updates so dev runtime
revalidation cannot replace the page with a missing route export fault.
