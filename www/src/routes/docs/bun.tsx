import { defineRoute } from "litz";
import { Link } from "litz/client";

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
        Deploy Litz apps to Bun with built-in server support.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Server entry</h2>
        <p className="text-neutral-400 mb-4">Create your server entry with context:</p>
        <CodeBlock
          language="ts"
          code={`import { createServer } from "litz/server";

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
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Bun server</h2>
        <p className="text-neutral-400 mb-4">Create a server entry that starts the Bun server:</p>
        <CodeBlock
          language="ts"
          code={`import app from "./server";

Bun.serve({
  port: 3000,
  fetch(request) {
    return app.fetch(request);
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Static assets</h2>
        <p className="text-neutral-400 mb-4">
          Bun can serve static files. After building with{" "}
          <code className="text-sky-400">vite build</code>, use Bun.serve's static file handling:
        </p>
        <CodeBlock
          language="ts"
          code={`import app from "./server";
import { fileServer } from "bun";

Bun.serve({
  port: 3000,
  fetch(request) {
    const url = new URL(request.url);
    
    // Serve static assets from dist/client
    if (!url.pathname.startsWith("/_litz/") && !url.pathname.startsWith("/api/")) {
      const asset = Bun.file(\`./dist/client\${url.pathname}\`);
      if (asset.exists) {
        return new Response(asset);
      }
    }
    
    return app.fetch(request);
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Production build</h2>
        <CodeBlock language="bash" code={`vite build`} />
        <p className="text-neutral-400 mt-4 mb-4">Output:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">dist/client</code> — browser bundle
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
    "start": "bun run server.ts",
    "preview": "bun run server.ts"
  }
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Verification checklist</h2>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>App typechecks</li>
          <li>Vite build completes</li>
          <li>Server starts without errors</li>
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
