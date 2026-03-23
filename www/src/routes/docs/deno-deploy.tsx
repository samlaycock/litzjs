import { defineRoute } from "litz";
import { Link } from "litz/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/deno-deploy", {
  component: DocsDenoDeployPage,
});

function DocsDenoDeployPage() {
  return (
    <>
      <title>Deno Deploy | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Deno Deploy</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Deploy Litz apps to Deno Deploy with server-side rendering and API routes.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Server entry</h2>
        <p className="text-neutral-400 mb-4">Create your server entry:</p>
        <CodeBlock
          language="ts"
          code={`import { createServer } from "litz/server";

export default createServer({
  async createContext(request) {
    // Parse cookies or auth headers here
    return { userId: null };
  },
  onError(error) {
    console.error("Server error:", error);
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Deno entry point</h2>
        <p className="text-neutral-400 mb-4">
          Create a Deno Deploy entry that uses the Litz handler:
        </p>
        <CodeBlock
          language="ts"
          code={`import app from "./server.ts";

Deno.serve(async (request) => {
  return app.fetch(request);
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Project config</h2>
        <p className="text-neutral-400 mb-4">In your deno.json:</p>
        <CodeBlock
          language="json"
          code={`{
  "tasks": {
    "start": "deno run --allow-all main.ts",
    "build": "vite build"
  },
  "imports": {
    "litz/": "npm:litz@latest/"
  }
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Static assets</h2>
        <p className="text-neutral-400 mb-4">
          Deno Deploy can serve static assets. After building with{" "}
          <code className="text-sky-400">vite build</code>, configure your project to serve the{" "}
          <code className="text-sky-400">dist/client</code> folder as static files.
        </p>
        <p className="text-neutral-400 mb-4">
          The Litz server handles <code className="text-sky-400">/_litz/*</code> routes and API
          routes, while the platform serves the client bundle.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Production build</h2>
        <p className="text-neutral-400 mb-4">Build the app:</p>
        <CodeBlock language="bash" code={`vite build`} />
        <p className="text-neutral-400 mt-4 mb-4">This generates:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">dist/client</code> — browser assets
          </li>
          <li>
            <code className="text-sky-400">dist/server</code> — server bundle
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Useful scripts</h2>
        <CodeBlock
          language="json"
          code={`{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "deno run --allow-all main.ts",
    "deploy": "deno run --allow-all main.ts"
  }
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Verification checklist</h2>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            App typechecks with <code className="text-sky-400">deno check</code>
          </li>
          <li>Vite build completes successfully</li>
          <li>
            Server entry exports a handler with <code className="text-sky-400">fetch</code> method
          </li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/cloudflare-workers"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Cloudflare Workers
        </Link>
        <Link href="/docs/bun" className="text-sky-500 hover:text-sky-400 transition-colors">
          Bun &rarr;
        </Link>
      </div>
    </>
  );
}
