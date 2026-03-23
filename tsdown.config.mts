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
    neverBundle: ["virtual:litz:route-manifest"],
    onlyBundle: false,
  },
});
