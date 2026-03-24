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
        Configure the Litz Vite plugin to customize routing, discovery, and server behavior.
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
          The <code className="text-sky-400">litz()</code> function accepts an options object:
        </p>
        <CodeBlock
          language="ts"
          code={`import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [
    litz({
      routes: ["src/routes/**/*.{ts,tsx}"],
      api: ["src/routes/api/**/*.{ts,tsx}"],
      resources: ["src/routes/resources/**/*.{ts,tsx}"],
      server: "src/server.ts",
    }),
  ],
});`}
        />
      </section>

      <section className="mb-12">
        <h3 className="text-xl font-medium text-neutral-100 mb-3">routes</h3>
        <p className="text-neutral-400 mb-4">
          <strong>Type:</strong> <code className="text-sky-400">string[]</code>
        </p>
        <p className="text-neutral-400 mb-4">
          Glob patterns to discover route files. Routes define pages with{" "}
          <code className="text-sky-400">defineRoute()</code>.
        </p>
        <p className="text-neutral-400 mb-4">
          <strong>Default:</strong> All .ts and .tsx files in src/routes, excluding api and
          resources subdirectories
        </p>
        <CodeBlock
          language="ts"
          code={`// Example: custom route directory
litz({
  routes: ["app/pages/**/*.{ts,tsx}"],
})`}
        />
      </section>

      <section className="mb-12">
        <h3 className="text-xl font-medium text-neutral-100 mb-3">api</h3>
        <p className="text-neutral-400 mb-4">
          <strong>Type:</strong> <code className="text-sky-400">string[]</code>
        </p>
        <p className="text-neutral-400 mb-4">
          Glob patterns to discover API route files. API routes define HTTP endpoints with{" "}
          <code className="text-sky-400">defineApiRoute()</code>.
        </p>
        <p className="text-neutral-400 mb-4">
          <strong>Default:</strong> All .ts and .tsx files in src/routes/api
        </p>
        <CodeBlock
          language="ts"
          code={`// Example: custom API directory
litz({
  api: ["app/api/**/*.{ts,tsx}"],
})`}
        />
      </section>

      <section className="mb-12">
        <h3 className="text-xl font-medium text-neutral-100 mb-3">resources</h3>
        <p className="text-neutral-400 mb-4">
          <strong>Type:</strong> <code className="text-sky-400">string[]</code>
        </p>
        <p className="text-neutral-400 mb-4">
          Glob patterns to discover resource files. Resources define reusable server-backed UI with{" "}
          <code className="text-sky-400">defineResource()</code>.
        </p>
        <p className="text-neutral-400 mb-4">
          <strong>Default:</strong> All .ts and .tsx files in src/routes/resources
        </p>
        <CodeBlock
          language="ts"
          code={`// Example: custom resources directory
litz({
  resources: ["app/components/**/*.{ts,tsx}"],
})`}
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
          <code className="text-sky-400">litz/server</code>.
        </p>
        <p className="text-neutral-400 mb-4">
          <strong>Default:</strong> <code className="text-sky-400">"src/server.ts"</code> or{" "}
          <code className="text-sky-400">"src/server/index.ts"</code> (auto-discovered)
        </p>
        <CodeBlock
          language="ts"
          code={`// Example: custom server entry
litz({
  server: "app/server.ts",
})`}
        />
      </section>

      <section className="mb-12">
        <h3 className="text-xl font-medium text-neutral-100 mb-3">embedAssets</h3>
        <p className="text-neutral-400 mb-4">
          <strong>Type:</strong> <code className="text-sky-400">boolean</code>
        </p>
        <p className="text-neutral-400 mb-4">
          When enabled, the production build inlines the document HTML and all client assets as
          strings into the server bundle. The handler serves <code className="text-sky-400">/</code>{" "}
          and <code className="text-sky-400">/assets/*</code> directly, removing the need for a
          separate static file server or CDN.
        </p>
        <p className="text-neutral-400 mb-4">
          <strong>Default:</strong> <code className="text-sky-400">false</code>
        </p>
        <CodeBlock
          language="ts"
          code={`// Example: single-file deployment (e.g. Cloudflare Workers)
litz({
  embedAssets: true,
})`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Complete example</h2>
        <p className="text-neutral-400 mb-4">A full configuration with all options:</p>
        <CodeBlock
          language="ts"
          code={`import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [
    litz({
      // Route files (pages)
      routes: ["src/routes/**/*.{ts,tsx}", "!src/routes/api/**", "!src/routes/resources/**"],
      
      // API route files
      api: ["src/routes/api/**/*.{ts,tsx}"],
      
      // Resource files (reusable server-backed UI)
      resources: ["src/routes/resources/**/*.{ts,tsx}"],
      
      // Custom server entry (optional)
      server: "src/server.ts",

      // Inline client assets into the server bundle (optional)
      embedAssets: true,
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
