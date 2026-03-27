---
"litzjs": patch
---

Handle lazy client route module load failures as managed route faults so rejected imports and missing `route` exports render the framework error state instead of surfacing unhandled errors.
