import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA as pwa } from "vite-plugin-pwa";

import { litz } from "../src/vite";

const rootDir = __dirname;
const packageRoot = path.resolve(__dirname, "..");

export default defineConfig(() => ({
  root: rootDir,
  plugins: [tailwindcss(), litz(), pwa({ registerType: "autoUpdate", outDir: "dist/client" })],
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
}));
