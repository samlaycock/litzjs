---
"litzjs": minor
---

Include the Nitro production adapter in the default `litz()` Vite plugin stack and configure it through `litz({ nitro: ... })`, so standard apps only need `plugins: [litz()]` for development and production builds.

Allow Nitro's dev runtime dependencies when Vite roots are nested inside a fixture or package, preventing module-runner load errors during `bun dev`.

Use Vite's standard `dist` directory for the default Nitro production output, with browser assets in `dist/public` and the server runtime in `dist/server`.
