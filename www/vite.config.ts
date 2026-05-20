import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA as pwa } from "vite-plugin-pwa";

import { litz } from "../src/vite";

const rootDir = __dirname;
const packageRoot = path.resolve(__dirname, "..");
const pwaPlugins = pwa({ registerType: "autoUpdate", outDir: "dist/client" });

for (const plugin of pwaPlugins) {
  plugin.applyToEnvironment = (environment) => environment.name === "client";
}

export default defineConfig({
  root: rootDir,
  build: {
    chunkSizeWarningLimit: 2_000,
  },
  plugins: [
    tailwindcss(),
    litz({ server: "src/server.ts" }),
    ...pwaPlugins,
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^litzjs\/client$/,
        replacement: path.resolve(packageRoot, "src/client/index.ts"),
      },
      {
        find: /^litzjs\/server$/,
        replacement: path.resolve(packageRoot, "src/server/index.ts"),
      },
      {
        find: /^litzjs\/vite$/,
        replacement: path.resolve(packageRoot, "src/vite.ts"),
      },
      {
        find: /^litzjs$/,
        replacement: path.resolve(packageRoot, "src/index.ts"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
});
