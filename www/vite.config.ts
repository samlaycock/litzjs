import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";

import { litz } from "../src/vite";

const packageRoot = path.resolve(__dirname, "..");
const docsNodeModules = path.resolve(__dirname, "node_modules");

export default defineConfig(() => ({
  plugins: [litz(), tailwindcss(), cloudflare()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: /^react$/,
        replacement: path.resolve(docsNodeModules, "react/index.js"),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: path.resolve(docsNodeModules, "react/jsx-runtime.js"),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: path.resolve(docsNodeModules, "react/jsx-dev-runtime.js"),
      },
      {
        find: /^react-dom$/,
        replacement: path.resolve(docsNodeModules, "react-dom/index.js"),
      },
      {
        find: /^react-dom\/client$/,
        replacement: path.resolve(docsNodeModules, "react-dom/client.js"),
      },
      {
        find: /^litz\/client$/,
        replacement: path.resolve(packageRoot, "src/client/index.ts"),
      },
      {
        find: /^litz\/server$/,
        replacement: path.resolve(packageRoot, "src/server/index.ts"),
      },
      {
        find: /^litz\/vite$/,
        replacement: path.resolve(packageRoot, "src/vite.ts"),
      },
      {
        find: /^litz$/,
        replacement: path.resolve(packageRoot, "src/index.ts"),
      },
    ],
  },
}));
