import path from "node:path";
import { defineConfig } from "vite";

import litz from "../../src/vite";

const rootDir = __dirname;
const packageRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  root: rootDir,
  plugins: [litz()],
  resolve: {
    alias: [
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
});
