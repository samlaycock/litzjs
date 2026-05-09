import path from "node:path";
import { defineConfig } from "vite";

import { litz } from "../../src/vite";
import { litzNitro } from "../../src/vite-nitro";

const rootDir = __dirname;
const packageRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  root: rootDir,
  plugins: [
    litz({
      routes: [
        "src/routes/**/*.{ts,tsx,js,jsx}",
        "!src/routes/api/**/*.{ts,tsx,js,jsx}",
        "!src/routes/resources/**/*.{ts,tsx,js,jsx}",
      ],
      api: ["src/routes/api/**/*.{ts,tsx,js,jsx}"],
      resources: ["src/routes/resources/**/*.{ts,tsx,js,jsx}"],
      clientEntry: "src/main.tsx",
      server: "src/custom-server.ts",
      rsc: {
        include: ["src/**/*.{ts,tsx}"],
      },
    }),
    litzNitro({
      baseURL: "/",
      compressPublicAssets: {
        gzip: true,
        brotli: false,
      },
      minify: false,
      preset: "node-server",
      routeRules: {
        "/api/**": {
          headers: {
            "x-litz-route-rule": "api",
          },
        },
      },
      server: "src/custom-server.ts",
      sourcemap: true,
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
        find: /^litzjs\/vite\/nitro$/,
        replacement: path.resolve(packageRoot, "src/vite-nitro.ts"),
      },
      {
        find: /^litzjs$/,
        replacement: path.resolve(packageRoot, "src/index.ts"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
});
