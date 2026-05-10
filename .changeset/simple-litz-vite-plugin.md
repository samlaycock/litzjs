---
"litzjs": minor
---

Make the default `litz()` Vite plugin own the framework production build directly, so standard apps only need `plugins: [litz()]` for development and production builds.

Emit a platform-neutral fetch-handler server bundle at `dist/server/index.mjs`, with browser assets in `dist/client`, and remove Nitro options from the public `litz()` configuration surface.

Forward the top-level `server` option into the framework server build so custom server entries only need to be configured once.
