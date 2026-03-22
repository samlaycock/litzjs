import path from "node:path";
import { defineConfig } from "vite";

import volt from "../../src/vite";

const rootDir = __dirname;
const packageRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  root: rootDir,
  plugins: [volt()],
  resolve: {
    alias: [
      {
        find: /^volt\/client$/,
        replacement: path.resolve(packageRoot, "src/client/index.ts"),
      },
      {
        find: /^volt\/server$/,
        replacement: path.resolve(packageRoot, "src/server/index.ts"),
      },
      {
        find: /^volt\/vite$/,
        replacement: path.resolve(packageRoot, "src/vite.ts"),
      },
      {
        find: /^volt$/,
        replacement: path.resolve(packageRoot, "src/index.ts"),
      },
    ],
  },
});
