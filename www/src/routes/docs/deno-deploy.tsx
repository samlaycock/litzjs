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
        Deploy Litz apps to Deno Deploy with a single built server bundle. The recommended
        production recipe is to embed client assets into the Litz server output, then export that
        handler to Deno.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Enable a single deployable bundle
        </h2>
        <p className="text-neutral-400 mb-4">
          Deno Deploy is simplest when the server bundle also contains the document and client
          assets. Enable <code className="text-sky-400">embedAssets</code> in the Vite config:
        </p>
        <CodeBlock
          language="ts"
          code={`import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [
    ...litz({
      server: "src/server.ts",
      embedAssets: true,
    }),
  ],
});`}
        />
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
          After <code className="text-sky-400">vite build</code>, re-export the built Litz handler
          through a Deno entry module:
        </p>
        <CodeBlock
          language="ts"
          code={`import app from "./dist/server/index.js";

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
    "start": "deno serve ./server.ts",
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
        <p className="text-neutral-400 mb-4">This is the copy-pasteable path for Deno Deploy:</p>
        <CodeBlock
          language="bash"
          code={`vite build
deno serve ./server.ts
deployctl deploy --project=my-litz-app --entrypoint=server.ts`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Production build</h2>
        <p className="text-neutral-400 mb-4">Build the app before local serving or deployment:</p>
        <CodeBlock language="bash" code={`vite build`} />
        <p className="text-neutral-400 mt-4 mb-4">This generates:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">dist/client</code> — browser assets that are embedded
            into the server bundle
          </li>
          <li>
            <code className="text-sky-400">dist/server/index.js</code> — the generated fetch handler
            imported by <code className="text-sky-400">server.ts</code>
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
    "start": "deno serve ./server.ts",
    "deploy": "vite build && deno deploy --prod"
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
            The bundled app serves the document and client assets without a separate file host
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
