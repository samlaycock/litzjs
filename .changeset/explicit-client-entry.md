---
"litzjs": minor
---

Stop inferring the browser entry from HTML module scripts. Litz now uses an explicit `clientEntry`
option, defaulting to `src/main.tsx`, and leaves explicit MPA HTML document requests for Vite to
serve while retaining `index.html` fallback for extensionless app routes during development.
