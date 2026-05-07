---
"litzjs": minor
---

Move Nitro production output behind the explicit `litzNitro()` adapter exported from `litzjs/vite/nitro`, leaving the core `litz()` Vite plugin free of the required Nitro plugin path.
