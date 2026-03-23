import { defineRoute } from "litz";
import { Link } from "litz/client";

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
        Deploy the client as static assets and route framework traffic through a Worker.
      </p>
      <p className="text-neutral-400 mb-4">The general approach is:</p>
      <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-8">
        <li>
          build client assets to <code className="text-sky-400">dist/client</code>
        </li>
        <li>run framework traffic through a Worker</li>
        <li>let the platform serve the SPA document and static assets where appropriate</li>
      </ul>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Litz server entry</h2>
        <p className="text-neutral-400 mb-4">Create a small server entry:</p>
        <CodeBlock
          language="ts"
          code={`import { createServer } from "litz/server";

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
          The Worker should route internal framework traffic and API traffic to the Litz server
          handler:
        </p>
        <CodeBlock
          language="ts"
          code={`import app from "./server";

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;

    if (pathname.startsWith("/_litz/") || pathname.startsWith("/api/")) {
      return app(request);
    }

    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    return app(request);
  },
};`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Wrangler configuration</h2>
        <p className="text-neutral-400 mb-4">Example shape:</p>
        <CodeBlock
          language="json"
          code={`{
  "name": "litz-docs",
  "main": "./deploy-worker.mjs",
  "compatibility_date": "2026-03-17",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/client",
    "not_found_handling": "single-page-application"
  }
}`}
        />
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
          Server output depends on whether you provide a custom server entry. For this docs app,
          using a custom server entry means the platform is responsible for serving client assets
          while the server handler focuses on routes, resources, and API traffic.
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
    "preview": "vite preview",
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
