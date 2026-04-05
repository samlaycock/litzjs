import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

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
        Deploy Litz apps to Deno Deploy by publishing the generated server handler and uploading
        <code className="text-sky-400"> .output/public</code> as static assets alongside it.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Build outputs</h2>
        <p className="text-neutral-400 mb-4">
          A production build gives you the same two artifacts as every Nitro-backed Litz runtime:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">.output/public</code> for HTML and browser assets
          </li>
          <li>
            <code className="text-sky-400">.output/server/index.mjs</code> for the fetch-style Litz
            handler
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          Deno Deploy needs both parts of that build. Upload{" "}
          <code className="text-sky-400">.output/public</code> with your deployment so static files
          are available at runtime, and use the generated server bundle as the dynamic entry point.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Server entry</h2>
        <p className="text-neutral-400 mb-4">
          Keep the framework server entry focused on context and errors:
        </p>
        <CodeBlock
          language="ts"
          code={`import { createServer } from "litzjs/server";

export default createServer({
  async createContext(request) {
    return { userId: request.headers.get("x-user-id") };
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
          After <code className="text-sky-400">vite build</code>, re-export the generated Litz
          handler through a Deno entry module:
        </p>
        <CodeBlock
          language="ts"
          code={`import app from "./.output/server/index.mjs";

export default {
  fetch(request: Request) {
    return app.fetch(request);
  },
} satisfies Deno.ServeDefaultExport;`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Project config</h2>
        <p className="text-neutral-400 mb-4">
          Use Deno tasks to build first, then serve or deploy the generated entry:
        </p>
        <CodeBlock
          language="json"
          code={`{
  "tasks": {
    "build": "vite build",
    "start": "vite build && deno serve ./server.ts",
    "check": "deno check ./server.ts"
  },
  "imports": {
    "litzjs/": "npm:litzjs@latest/"
  }
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Build and deploy commands</h2>
        <p className="text-neutral-400 mb-4">
          Use separate commands for local verification and production deployment:
        </p>
        <CodeBlock
          language="bash"
          code={`vite build
# Local preview
deno serve ./server.ts

# Production deploy
deployctl deploy --project=my-litz-app --include=.output/public ./.output/server/index.mjs`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Production build</h2>
        <p className="text-neutral-400 mb-4">Build the app before local serving or deployment:</p>
        <CodeBlock language="bash" code={`vite build`} />
        <p className="text-neutral-400 mt-4 mb-4">This generates:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">.output/public</code> — browser assets that must be
            uploaded with the deployment
          </li>
          <li>
            <code className="text-sky-400">.output/server/index.mjs</code> — the generated fetch
            handler you publish to Deno Deploy
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
    "start": "vite build && deno serve ./server.ts",
    "deploy": "vite build && deployctl deploy --project=my-litz-app --include=.output/public ./.output/server/index.mjs"
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
            <code className="text-sky-400">server.ts</code> re-exports a handler that satisfies{" "}
            <code className="text-sky-400">Deno.ServeDefaultExport</code>
          </li>
          <li>
            <code className="text-sky-400">.output/public</code> is uploaded with the deployment
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
