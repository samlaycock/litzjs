import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/bun", {
  component: DocsBunPage,
});

function DocsBunPage() {
  return (
    <>
      <title>Bun | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Bun</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Deploy Litz apps to Bun by importing the built Litz handler and letting Bun serve either the
        built client files or a single embedded bundle.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Server entry</h2>
        <p className="text-neutral-400 mb-4">
          Keep the framework server entry thin and let the Bun runtime wrapper import the built
          bundle after <code className="text-sky-400">vite build</code>:
        </p>
        <CodeBlock
          language="ts"
          code={`import { createServer } from "litzjs/server";

export default createServer({
  async createContext(request) {
    const token = request.headers.get("authorization");
    return { userId: token ? verifyToken(token) : null };
  },
  onError(error) {
    console.error("Server error:", error);
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Production Bun server</h2>
        <p className="text-neutral-400 mb-4">
          The production Bun process should import{" "}
          <code className="text-sky-400">dist/server/index.js</code> and serve built client files
          from <code className="text-sky-400">dist/client</code>:
        </p>
        <CodeBlock
          language="ts"
          code={`import path from "node:path";
import app from "./dist/server/index.js";

const clientDir = path.resolve("dist/client");

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
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
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Static assets</h2>
        <p className="text-neutral-400 mb-4">
          This recipe serves the exact files produced by{" "}
          <code className="text-sky-400">vite build</code>. Requests for hashed assets,{" "}
          <code className="text-sky-400">index.html</code>, and other browser files are satisfied
          from <code className="text-sky-400">dist/client</code>; the Litz handler receives
          everything else.
        </p>
        <p className="text-neutral-400 mb-4">
          If you would rather ship a single server bundle, enable{" "}
          <code className="text-sky-400">embedAssets</code> and remove the filesystem lookup above.
          In that mode, the built server bundle serves the document and client assets by itself.
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
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Build and start commands</h2>
        <CodeBlock
          language="bash"
          code={`vite build
bun run ./server.ts`}
        />
        <p className="text-neutral-400 mt-4 mb-4">After the build, Bun starts with:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">dist/client</code> — browser assets and HTML shell
          </li>
          <li>
            <code className="text-sky-400">dist/server/index.js</code> — the generated Litz fetch
            handler
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
    "start": "bun run ./server.ts",
    "preview": "vite preview"
  }
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Verification checklist</h2>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>App typechecks</li>
          <li>Vite build completes</li>
          <li>Bun starts without errors after importing the built server bundle</li>
          <li>
            Browser requests resolve from <code className="text-sky-400">dist/client</code> or the{" "}
            <code className="text-sky-400">embedAssets</code> bundle
          </li>
          <li>
            <code className="text-sky-400">/_litzjs/*</code> and{" "}
            <code className="text-sky-400">/api/*</code> still reach{" "}
            <code className="text-sky-400">app.fetch(request)</code>
          </li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/deno-deploy"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Deno Deploy
        </Link>
        <Link href="/docs/node" className="text-sky-500 hover:text-sky-400 transition-colors">
          Node.js &rarr;
        </Link>
      </div>
    </>
  );
}
