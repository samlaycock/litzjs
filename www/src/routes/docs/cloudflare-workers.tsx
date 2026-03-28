import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/cloudflare-workers", {
  component: DocsDeploymentPage,
});

function DocsDeploymentPage() {
  return (
    <>
      <title>Cloudflare Workers | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Cloudflare Workers</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Deploy the built client as Cloudflare static assets and route only the Litz transport plus
        API traffic through a Worker.
      </p>
      <p className="text-neutral-400 mb-4">The general approach is:</p>
      <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-8">
        <li>
          build client assets to <code className="text-sky-400">dist/client</code>
        </li>
        <li>
          run <code className="text-sky-400">/_litzjs/*</code> and{" "}
          <code className="text-sky-400">/api/*</code> through the Worker first
        </li>
        <li>let Cloudflare serve the SPA shell and static assets from the asset pipeline</li>
      </ul>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Litz server entry</h2>
        <p className="text-neutral-400 mb-4">
          Your framework server entry stays thin and focuses on request context and error handling:
        </p>
        <CodeBlock
          language="ts"
          code={`import { createServer } from "litzjs/server";

export default createServer({
  onError(error) {
    console.error("Litz docs server error", error);
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Worker entry</h2>
        <p className="text-neutral-400 mb-4">
          The Worker wrapper should send only the internal Litz transport and explicit API traffic
          to the handler. Everything else can fall back to Cloudflare&apos;s asset pipeline:
        </p>
        <CodeBlock
          language="ts"
          code={`import app from "./server";

export default {
  fetch(request, env) {
    const pathname = new URL(request.url).pathname;

    if (pathname.startsWith("/_litzjs/") || pathname.startsWith("/api/")) {
      return app.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Wrangler configuration</h2>
        <p className="text-neutral-400 mb-4">
          Configure Wrangler so framework requests run worker-first, while SPA shell requests still
          get the static asset fallback:
        </p>
        <CodeBlock
          language="json"
          code={`{
  "name": "litz-docs",
  "main": "./src/worker.ts",
  "compatibility_date": "2026-03-27",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/_litzjs/*", "/api/*"]
  }
}`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          If you use the Cloudflare Vite plugin, keeping{" "}
          <code className="text-sky-400">assets.directory</code> aligned with{" "}
          <code className="text-sky-400">dist/client</code> matches the generated output and keeps
          the JSON example copy-pasteable.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Build and deploy commands</h2>
        <CodeBlock
          language="bash"
          code={`vite build
wrangler dev
wrangler deploy`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          Build first so Wrangler uploads the current client bundle and Worker entry together. The
          same split applies in development and production.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Why this deployment model fits Litz
        </h2>
        <p className="text-neutral-400 mb-4">Litz is SPA-first. That makes this split natural:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>static assets serve the document and browser bundle</li>
          <li>the Worker handles explicit server surfaces</li>
          <li>you keep deployment concerns understandable and close to the runtime model</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Production output</h2>
        <p className="text-neutral-400 mb-4">
          When you run <code className="text-sky-400">vite build</code>, Litz writes browser assets
          to <code className="text-sky-400">dist/client</code>.
        </p>
        <p className="text-neutral-400 mb-4">
          The Worker entry remains responsible for routing requests. The Litz server entry focuses
          on the transport endpoints, route actions, route loaders, resources, and API traffic.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Useful scripts</h2>
        <CodeBlock
          language="json"
          code={`{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "wrangler dev",
    "deploy": "vite build && wrangler deploy"
  }
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Verification checklist</h2>
        <p className="text-neutral-400 mb-4">Before deploying, verify:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>the app typechecks</li>
          <li>the Vite build completes</li>
          <li>the Worker bundle resolves correctly</li>
          <li>
            <code className="text-sky-400">/_litzjs/*</code> and{" "}
            <code className="text-sky-400">/api/*</code> are routed with{" "}
            <code className="text-sky-400">run_worker_first</code>
          </li>
          <li>Wrangler dry-run succeeds</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">End state</h2>
        <p className="text-neutral-400 mb-4">You end up with a docs app that:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>is built with Litz itself</li>
          <li>uses Vite in development and production</li>
          <li>styles with Tailwind</li>
          <li>runs framework server traffic on Cloudflare Workers</li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/server-configuration"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Server Configuration
        </Link>
        <Link
          href="/docs/api-reference"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          API Reference &rarr;
        </Link>
      </div>
    </>
  );
}
