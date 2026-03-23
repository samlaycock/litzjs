import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/api-routes", {
  component: DocsApiRoutesPage,
});

function DocsApiRoutesPage() {
  return (
    <>
      <title>API Routes | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">API Routes</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Expose raw HTTP handlers with method-level control and a small client helper.
      </p>
      <p className="text-neutral-400 mb-8">
        API routes are a good fit when you want a standard request/response surface rather than
        route or resource result helpers.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Define an API route</h2>
        <CodeBlock
          language="ts"
          code={`import { defineApiRoute } from "litzjs";

export const api = defineApiRoute("/api/health", {
  middleware: [],
  GET() {
    return Response.json({ ok: true });
  },
  ALL({ request }) {
    return Response.json({ method: request.method });
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Supported method keys</h2>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">GET</code>
          </li>
          <li>
            <code className="text-sky-400">POST</code>
          </li>
          <li>
            <code className="text-sky-400">PUT</code>
          </li>
          <li>
            <code className="text-sky-400">PATCH</code>
          </li>
          <li>
            <code className="text-sky-400">DELETE</code>
          </li>
          <li>
            <code className="text-sky-400">OPTIONS</code>
          </li>
          <li>
            <code className="text-sky-400">HEAD</code>
          </li>
          <li>
            <code className="text-sky-400">ALL</code>
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">ALL</code> acts as a fallback when there is no
          method-specific handler.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Client helper</h2>
        <p className="text-neutral-400 mb-4">API routes expose a thin fetch helper:</p>
        <CodeBlock
          language="ts"
          code={`const response = await api.fetch();
const data = await response.json();`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          <code className="text-sky-400">{"api.fetch(...)"}</code> accepts route params, search
          params, headers, and an HTTP method when needed.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Middleware</h2>
        <p className="text-neutral-400 mb-4">
          API routes can declare a <code className="text-sky-400">middleware</code> array just like
          routes and resources.
        </p>
        <p className="text-neutral-400 mb-4">
          The difference is that API middleware returns{" "}
          <code className="text-sky-400">Response</code>, not a framework{" "}
          <code className="text-sky-400">ServerResult</code>.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">When to use API routes</h2>
        <p className="text-neutral-400 mb-4">Use an API route when:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>you want raw HTTP control</li>
          <li>you are integrating with external consumers</li>
          <li>you want direct method-based semantics</li>
          <li>
            the result should be shaped as a normal <code className="text-sky-400">Response</code>
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          Use route or resource boundaries when you want the client runtime to understand the result
          as framework state.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Security</h2>
        <p className="text-neutral-400 mb-4">
          API routes are plain request handlers. Treat them like any other server endpoint:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>validate input</li>
          <li>authenticate callers</li>
          <li>authorize access</li>
          <li>avoid trusting request origin implicitly</li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/resources"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Resources
        </Link>
        <Link href="/docs/middleware" className="text-sky-500 hover:text-sky-400 transition-colors">
          Middleware &rarr;
        </Link>
      </div>
    </>
  );
}
