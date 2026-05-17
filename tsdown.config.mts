import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    client: "./src/client/index.ts",
    server: "./src/server/index.ts",
    vite: "./src/vite.ts",
  },
  format: ["cjs", "esm"],
  platform: "neutral",
  dts: true,
  outDir: "./dist",
  checks: {
    pluginTimings: false,
  },
  deps: {
    neverBundle: [
      "virtual:litzjs:route-manifest",
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom/client",
      "node:fs",
      "node:fs/promises",
      "node:path",
      "vite",
      "@vitejs/plugin-rsc",
    ],
    onlyBundle: false,
  },
});
