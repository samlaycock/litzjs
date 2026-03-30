import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/troubleshooting", {
  component: DocsTroubleshootingPage,
});

function DocsTroubleshootingPage() {
  return (
    <>
      <title>Troubleshooting | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Troubleshooting</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Start with the symptom you can already observe. These entries map common Litz failures to
        the exact fix and the docs page that goes deeper.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Build fails with package or import errors
        </h2>
        <p className="text-neutral-400 mb-4">
          Start here when Bun, Vite, or your editor reports messages like{" "}
          <code className="text-sky-400">Cannot find package "litzjs"</code>,{" "}
          <code className="text-sky-400">Cannot find package "litz"</code>,{" "}
          <code className="text-sky-400">Cannot resolve import "litzjs/server"</code>, or{" "}
          <code className="text-sky-400">Cannot resolve import "litzjs/client"</code>.
        </p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            Install <code className="text-sky-400">litzjs</code>, not the older package name{" "}
            <code className="text-sky-400">litz</code>.
          </li>
          <li>
            Import runtime APIs from their published entry points:
            <code className="text-sky-400">"litzjs"</code>,{" "}
            <code className="text-sky-400">"litzjs/client"</code>,{" "}
            <code className="text-sky-400">"litzjs/server"</code>, and{" "}
            <code className="text-sky-400">"litzjs/vite"</code>.
          </li>
          <li>
            If the package resolves but React or the Vite plugin does not, revisit the peer
            dependency list on the installation page.
          </li>
        </ul>
        <CodeBlock
          language="bash"
          code={`bun add litzjs react react-dom
bun add -d typescript vite @vitejs/plugin-rsc`}
        />
        <CodeBlock
          language="ts"
          code={`import { defineRoute, server } from "litzjs";
import { Link } from "litzjs/client";
import { createServer } from "litzjs/server";
import { litz } from "litzjs/vite";`}
        />
        <p className="text-neutral-400 mt-4">
          Need the full install matrix? Read{" "}
          <Link href="/docs/installation" className="text-sky-400 hover:text-sky-300">
            Installation
          </Link>
          .
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          You get a 404 for a route that should exist
        </h2>
        <p className="text-neutral-400 mb-4">
          This usually shows up as a page-level 404, or as an internal JSON fault containing{" "}
          <code className="text-sky-400">Route not found.</code> or{" "}
          <code className="text-sky-400">Route target not found.</code>
        </p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            Export <code className="text-sky-400">route</code> from the module and define the URL in{" "}
            <code className="text-sky-400">defineRoute("/path", ...)</code>.
          </li>
          <li>
            Keep page routes inside the configured route globs. The default is{" "}
            <code className="text-sky-400">{"src/routes/**/*.{ts,tsx}"}</code>, excluding the{" "}
            <code className="text-sky-400">api</code> and{" "}
            <code className="text-sky-400">resources</code> subdirectories.
          </li>
          <li>
            If you moved routes into a custom folder, update the Vite plugin{" "}
            <code className="text-sky-400">routes</code> option so discovery can see them.
          </li>
        </ul>
        <CodeBlock
          language="ts"
          code={`// vite.config.ts
import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [
    litz({
      routes: ["app/pages/**/*.{ts,tsx}"],
    }),
  ],
});

// app/pages/dashboard.tsx
import { defineRoute } from "litzjs";

export const route = defineRoute("/dashboard", {
  component: DashboardPage,
});`}
        />
        <p className="text-neutral-400 mt-4">
          For route shape and discovery rules, see{" "}
          <Link href="/docs/routing" className="text-sky-400 hover:text-sky-300">
            Routing
          </Link>{" "}
          and{" "}
          <Link href="/docs/configuration" className="text-sky-400 hover:text-sky-300">
            Configuration
          </Link>
          .
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Loader or action code never reaches the server
        </h2>
        <p className="text-neutral-400 mb-4">
          If a loader never resolves, an action submit appears to do nothing, or server-only code
          leaks into the browser bundle, the missing piece is usually the{" "}
          <code className="text-sky-400">server(async () =&gt; ...)</code> wrapper.
        </p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            Wrap every loader and action in <code className="text-sky-400">server()</code>. Plain{" "}
            <code className="text-sky-400">async () =&gt; ...</code> functions are not treated as
            server handlers.
          </li>
          <li>
            Submit actions through <code className="text-sky-400">route.Form</code> or{" "}
            <code className="text-sky-400">resource.Form</code> so the framework can target the
            correct action endpoint.
          </li>
          <li>
            Keep database, filesystem, and secret-bearing logic inside the{" "}
            <code className="text-sky-400">server()</code> closure.
          </li>
        </ul>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, server } from "litzjs";

export const route = defineRoute("/users", {
  loader: server(async () => {
    return data({ users: await db.users.list() });
  }),
  action: server(async ({ request }) => {
    const formData = await request.formData();
    await db.users.create({ name: String(formData.get("name") ?? "") });
    return data({ ok: true });
  }),
});

function UsersPage() {
  return (
    <route.Form method="post">
      <button type="submit">Create user</button>
    </route.Form>
  );
}`}
        />
        <p className="text-neutral-400 mt-4">
          Read{" "}
          <Link href="/docs/loaders-and-actions" className="text-sky-400 hover:text-sky-300">
            Loaders &amp; Actions
          </Link>{" "}
          and{" "}
          <Link href="/docs/forms" className="text-sky-400 hover:text-sky-300">
            Forms
          </Link>{" "}
          for the full request lifecycle.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Requests to <code className="text-sky-400">/_litzjs/*</code> fail
        </h2>
        <p className="text-neutral-400 mb-4">
          Check this section when the network tab shows failures for{" "}
          <code className="text-sky-400">"/_litzjs/route"</code>,{" "}
          <code className="text-sky-400">"/_litzjs/action"</code>, or{" "}
          <code className="text-sky-400">"/_litzjs/resource"</code>, or when the response body says{" "}
          <code className="text-sky-400">Resource not found.</code> or{" "}
          <code className="text-sky-400">Route not found.</code>
        </p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            Your runtime must forward every <code className="text-sky-400">/_litzjs/*</code> request
            to the Litz handler instead of treating it as a static asset or CDN miss.
          </li>
          <li>
            Custom Bun, Node, or proxy wrappers must still call{" "}
            <code className="text-sky-400">app.fetch(request)</code> for internal transport requests
            and <code className="text-sky-400">/api/*</code>.
          </li>
          <li>
            On Cloudflare Workers, ensure your static asset configuration does not intercept the
            framework transport before the Worker runs.
          </li>
        </ul>
        <CodeBlock
          language="ts"
          code={`import path from "node:path";
import app from "./dist/server/index.js";

const clientDir = path.resolve("dist/client");

Bun.serve({
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const asset = Bun.file(path.join(clientDir, pathname.slice(1)));

    if ((request.method === "GET" || request.method === "HEAD") && (await asset.exists())) {
      return new Response(request.method === "HEAD" ? null : asset);
    }

    return app.fetch(request);
  },
});`}
        />
        <p className="text-neutral-400 mt-4">
          Check{" "}
          <Link href="/docs/server-configuration" className="text-sky-400 hover:text-sky-300">
            Server Configuration
          </Link>
          ,{" "}
          <Link href="/docs/bun" className="text-sky-400 hover:text-sky-300">
            Bun
          </Link>
          ,{" "}
          <Link href="/docs/node" className="text-sky-400 hover:text-sky-300">
            Node.js
          </Link>
          , and{" "}
          <Link href="/docs/cloudflare-workers" className="text-sky-400 hover:text-sky-300">
            Cloudflare Workers
          </Link>{" "}
          for runtime-specific wiring.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          The app builds, but deployment is missing HTML, JS, or CSS
        </h2>
        <p className="text-neutral-400 mb-4">
          Production deployments commonly fail in one of two ways: only the server bundle is
          deployed and <code className="text-sky-400">dist/client</code> never gets served, or the
          runtime starts the wrong entry file instead of{" "}
          <code className="text-sky-400">dist/server/index.js</code>.
        </p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            If you want separate static files, deploy both{" "}
            <code className="text-sky-400">dist/client</code> and{" "}
            <code className="text-sky-400">dist/server/index.js</code>.
          </li>
          <li>
            If your platform only runs a single server artifact, enable{" "}
            <code className="text-sky-400">embedAssets: true</code>.
          </li>
          <li>
            If your server entry is not <code className="text-sky-400">src/server.ts</code>, point
            the Vite plugin at the real file with{" "}
            <code className="text-sky-400">server: "..."</code>.
          </li>
        </ul>
        <CodeBlock
          language="ts"
          code={`// vite.config.ts
import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [
    litz({
      server: "src/server.ts",
      embedAssets: true,
    }),
  ],
});

// src/server.ts
import { createServer } from "litzjs/server";

export default createServer();`}
        />
        <p className="text-neutral-400 mt-4">
          Use the deployment guide for your target runtime:{" "}
          <Link href="/docs/bun" className="text-sky-400 hover:text-sky-300">
            Bun
          </Link>
          ,{" "}
          <Link href="/docs/node" className="text-sky-400 hover:text-sky-300">
            Node.js
          </Link>
          ,{" "}
          <Link href="/docs/deno-deploy" className="text-sky-400 hover:text-sky-300">
            Deno Deploy
          </Link>
          , or{" "}
          <Link href="/docs/cloudflare-workers" className="text-sky-400 hover:text-sky-300">
            Cloudflare Workers
          </Link>
          .
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          What to capture before asking for help
        </h2>
        <p className="text-neutral-400 mb-4">
          A useful bug report starts with the exact symptom, not just &quot;it doesn&apos;t
          work.&quot;
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            The exact error text, including whether it mentions a package path or a transport URL
          </li>
          <li>
            The request URL if it failed under <code className="text-sky-400">/_litzjs/*</code>
          </li>
          <li>The import statement or route file path involved in the failure</li>
          <li>
            Which runtime you are deploying to and whether you serve{" "}
            <code className="text-sky-400">dist/client</code> or use{" "}
            <code className="text-sky-400">embedAssets</code>
          </li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/testing"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Testing
        </Link>
        <Link
          href="/docs/server-configuration"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          Server Configuration &rarr;
        </Link>
      </div>
    </>
  );
}
