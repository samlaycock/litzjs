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
  deps: {
    neverBundle: [
      "virtual:litzjs:route-manifest",
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom/client",
      "@vitejs/plugin-rsc",
    ],
    onlyBundle: false,
  },
});
