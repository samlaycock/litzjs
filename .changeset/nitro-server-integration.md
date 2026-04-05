---
"litzjs": minor
---

Integrate Nitro as the server runtime layer, replacing the custom asset embedding and deployment adapter code. The Vite plugin now includes Nitro's Vite plugin, which provides 25+ deployment presets (Cloudflare Workers, AWS Lambda, Vercel, Node.js, etc.) out of the box. A new `litzjs/server/nitro` export provides `createNitroHandler()` for direct Nitro handler usage. The `embedAssets` option has been removed in favor of Nitro's built-in static asset serving.

The `litzjs/vite` entry now also exposes `buildLitzApp()` for programmatic production builds so consumers can drive Vite's multi-environment app builder correctly, and production builds clean up intermediate Vite artifacts as part of the build lifecycle so the final output is just Nitro's `.output/public` and `.output/server` directories.
