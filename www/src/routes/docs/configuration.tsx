import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/configuration", {
  component: DocsConfigurationPage,
});

function DocsConfigurationPage() {
  return (
    <>
      <title>Configuration | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Configuration</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Configure the Litz Vite plugin and register your app explicitly in TypeScript.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Basic setup</h2>
        <p className="text-neutral-400 mb-4">
          Add the Litz plugin to your <code className="text-sky-400">vite.config.ts</code>:
        </p>
        <CodeBlock
          language="ts"
          code={`import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [litz()],
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Options</h2>
        <p className="text-neutral-400 mb-4">
          The <code className="text-sky-400">litz()</code> function accepts optional build entry
          options. Omit <code className="text-sky-400">server</code> for a client-only build:
        </p>
        <CodeBlock
          language="ts"
          code={`import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [
    litz({
      clientEntry: "src/main.tsx",
      server: "src/server.ts",
    }),
  ],
});`}
        />
      </section>

      <section className="mb-12">
        <h3 className="text-xl font-medium text-neutral-100 mb-3">App registration</h3>
        <p className="text-neutral-400 mb-4">
          Routes, resources, and API routes are registered with{" "}
          <code className="text-sky-400">defineApp()</code>. File placement does not register
          anything by itself.
        </p>
        <CodeBlock
          language="ts"
          code={`// src/app.ts
import { defineApp } from "litzjs";

import { api as healthApi } from "./api/health";
import { resource as accountResource } from "./resources/account";
import { route as homeRoute } from "./routes/home";

export const app = defineApp({
  clientLoading: "lazy",
  routes: [homeRoute],
  resources: [accountResource],
  apiRoutes: [healthApi],
});`}
        />
      </section>

      <section className="mb-12">
        <h3 className="text-xl font-medium text-neutral-100 mb-3">clientEntry</h3>
        <p className="text-neutral-400 mb-4">
          <strong>Type:</strong> <code className="text-sky-400">string</code>
        </p>
        <p className="text-neutral-400 mb-4">
          Browser entry imported by Litz&apos;s generated client runtime module.
        </p>
        <p className="text-neutral-400 mb-4">
          <strong>Default:</strong> <code className="text-sky-400">"src/main.tsx"</code>
        </p>
        <CodeBlock
          language="ts"
          code={`// app/browser.tsx
import { mountApp } from "litzjs/client";

import { app } from "./app";

mountApp(document.getElementById("app")!, { app });`}
        />
      </section>

      <section className="mb-12">
        <h3 className="text-xl font-medium text-neutral-100 mb-3">server</h3>
        <p className="text-neutral-400 mb-4">
          <strong>Type:</strong> <code className="text-sky-400">string</code>
        </p>
        <p className="text-neutral-400 mb-4">
          Path to a custom server entry file. This file should export a handler created with{" "}
          <code className="text-sky-400">createServer()</code> from{" "}
          <code className="text-sky-400">litzjs/server</code>.
        </p>
        <p className="text-neutral-400 mb-4">
          <strong>Default:</strong> omitted. When omitted, Litz does not produce a server build.
        </p>
        <CodeBlock
          language="ts"
          code={`// app/server.ts
import { createServer } from "litzjs/server";

import { app } from "./app";

export default createServer({ app });`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Complete example</h2>
        <p className="text-neutral-400 mb-4">A full Vite plugin configuration:</p>
        <CodeBlock
          language="ts"
          code={`import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [
    litz({
      // Browser entry (optional)
      clientEntry: "src/main.tsx",

      // Server entry (optional; omitted means client-only)
      server: "src/server.ts",
    }),
  ],
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Environment variables</h2>
        <p className="text-neutral-400 mb-4">
          Litz respects these environment variables in your server code:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">NODE_ENV</code> — Set to{" "}
            <code className="text-sky-400">"production"</code> in production builds
          </li>
          <li>
            <code className="text-sky-400">VITE_*</code> — Available in both client and server code
            during dev
          </li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/quick-start"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Quick Start
        </Link>
        <Link href="/docs/routing" className="text-sky-500 hover:text-sky-400 transition-colors">
          Routing &rarr;
        </Link>
      </div>
    </>
  );
}
