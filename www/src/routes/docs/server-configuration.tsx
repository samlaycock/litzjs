import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/server-configuration", {
  component: ServerConfiguration,
});

function ServerConfiguration() {
  return (
    <>
      <title>Server Configuration | Litz</title>

      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Server Configuration</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Configure the Litz server runtime with createServer — request context, error handling, and
        the WinterCG handler model.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">createServer</h2>
        <p className="text-neutral-400 mb-4">
          Import <code className="text-sky-400">createServer</code> from{" "}
          <code className="text-sky-400">"litzjs/server"</code>. It creates a WinterCG-compatible
          request handler: <code className="text-sky-400">Request → Response</code>.
        </p>
        <p className="text-neutral-400 mb-4">The simplest usage requires no arguments at all:</p>
        <CodeBlock
          language="tsx"
          code={`import { createServer } from "litzjs/server";

export default createServer();`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">createContext</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">createContext(request)</code> provides the{" "}
          <code className="text-sky-400">context</code> value exposed to all handlers. It is called
          once per request and can be sync or async.
        </p>
        <p className="text-neutral-400 mb-4">
          Use it to parse sessions, generate request IDs, or establish database connections:
        </p>
        <CodeBlock
          language="tsx"
          code={`export default createServer({
  createContext(request) {
    return {
      requestId: request.headers.get("x-request-id"),
      userId: parseSession(request),
    };
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">onError</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">onError(error, context)</code> is called when an unhandled
          error occurs during request handling. Use it for logging, error reporting, and alerting.
        </p>
        <CodeBlock
          language="tsx"
          code={`export default createServer({
  createContext(request) {
    return { requestId: request.headers.get("x-request-id") };
  },
  onError(error, context) {
    console.error(\`[req:\${context.requestId}]\`, error);
    reportToSentry(error);
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">notFound</h2>
        <p className="text-neutral-400 mb-4">
          Use <code className="text-sky-400">notFound</code> to return a custom 404 document for
          unmatched route-like requests while leaving asset handling alone.
        </p>
        <CodeBlock
          language="tsx"
          code={`export default createServer({
  notFound: "<!doctype html><html><body><h1>Missing</h1></body></html>",
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Production output</h2>
        <p className="text-neutral-400 mb-4">
          When you run <code className="text-sky-400">vite build</code>, Litz writes browser assets
          to <code className="text-sky-400">.output/public</code> and produces a server bundle.
        </p>
        <p className="text-neutral-400 mb-4">
          Litz emits <code className="text-sky-400">.output/server/index.mjs</code> with the
          discovered server manifest injected into{" "}
          <code className="text-sky-400">createServer()</code>. Your platform is responsible for
          serving <code className="text-sky-400">.output/public</code> as static files (via CDN,{" "}
          <code className="text-sky-400">express.static</code>, platform asset binding, etc.).
        </p>
        <p className="text-neutral-400 mb-4">
          If your runtime cannot read from the local filesystem directly, upload{" "}
          <code className="text-sky-400">.output/public</code> through that platform&apos;s asset
          pipeline and keep <code className="text-sky-400">.output/server/index.mjs</code> as the
          dynamic request handler.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">The handler model</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">createServer()</code> returns{" "}
          <code className="text-sky-400">{"{ fetch(request: Request): Promise<Response> }"}</code>{" "}
          (or just a function). It works with any WinterCG-compatible runtime: Cloudflare Workers,
          Deno, Bun, and Node.js adapters.
        </p>
        <p className="text-neutral-400 mb-4">
          Internal dispatch covers route loaders, route actions, resource requests, API routes, and
          the client document. The <code className="text-sky-400">_litzjs/*</code> transport is an
          implementation detail — treat it as a server surface.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Discovery</h2>
        <p className="text-neutral-400 mb-4">
          The Vite plugin auto-injects discovered routes, resources, and API routes into{" "}
          <code className="text-sky-400">createServer</code>. You don't wire them manually.
        </p>
        <p className="text-neutral-400 mb-4">
          Discovery paths are configured in <code className="text-sky-400">vite.config.ts</code>{" "}
          through the <code className="text-sky-400">litz()</code> plugin options.
        </p>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/testing"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Testing
        </Link>
        <Link
          href="/docs/cloudflare-workers"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          Cloudflare Workers &rarr;
        </Link>
      </div>
    </>
  );
}
