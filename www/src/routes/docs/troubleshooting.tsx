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
      <p className="text-xl text-neutral-300 mb-8">Common issues and how to resolve them.</p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Loader not running</h2>
        <p className="text-neutral-400 mb-4">
          If your loader doesn't execute, check these common causes:
        </p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            <strong>Missing server() wrapper</strong> — Loaders must be wrapped in{" "}
            <code className="text-sky-400">server()</code> to run on the server
          </li>
          <li>
            <strong>Route not discovered</strong> — Ensure your route file matches the discovery
            pattern
          </li>
          <li>
            <strong>defineRoute not exported</strong> — The route must export a{" "}
            <code className="text-sky-400">route</code> constant
          </li>
        </ul>
        <CodeBlock
          language="tsx"
          code={`// ✅ Correct - loader wrapped in server()
export const route = defineRoute("/users", {
  loader: server(async () => {
    return data({ users: [] });
  }),
});

// ❌ Wrong - missing server() wrapper
export const route = defineRoute("/users", {
  loader: async () => {
    // This runs on client, not server
    return data({ users: [] });
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Action not firing</h2>
        <p className="text-neutral-400 mb-4">If your form action doesn't trigger:</p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            <strong>Use route.Form or resource.Form</strong> — Regular HTML forms won't trigger
            actions
          </li>
          <li>
            <strong>Check method attribute</strong> — Actions respond to{" "}
            <code className="text-sky-400">POST</code> by default
          </li>
          <li>
            <strong>Verify server() wrapper</strong> — Actions must also be wrapped in{" "}
            <code className="text-sky-400">server()</code>
          </li>
        </ul>
        <CodeBlock
          language="tsx"
          code={`// ✅ Correct - use route.Form
export const route = defineRoute("/submit", {
  action: server(async ({ request }) => {
    // handle form submission
  }),
});

function MyPage() {
  return (
    <route.Form method="post">
      <button type="submit">Submit</button>
    </route.Form>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">404 on valid route</h2>
        <p className="text-neutral-400 mb-4">If you're getting 404s on routes that should exist:</p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            <strong>Check file location</strong> — Routes must be in{" "}
            <code className="text-sky-400">src/routes/</code> (or your configured routes directory)
          </li>
          <li>
            <strong>File extension matters</strong> — Use <code className="text-sky-400">.tsx</code>{" "}
            for components, <code className="text-sky-400">.ts</code> for API routes
          </li>
          <li>
            <strong>Path must match defineRoute</strong> — The path in{" "}
            <code className="text-sky-400">defineRoute("/path", ...)</code> must match the URL
          </li>
          <li>
            <strong>Restart dev server</strong> — Sometimes needed after adding new routes
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Type errors with route hooks
        </h2>
        <p className="text-neutral-400 mb-4">If TypeScript can't infer types:</p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            <strong>Use server() wrapper</strong> — Type inference requires the{" "}
            <code className="text-sky-400">server()</code> wrapper on loaders/actions
          </li>
          <li>
            <strong>Check your data() returns</strong> — Ensure you're returning proper shapes from
            loaders
          </li>
          <li>
            <strong>Route must be module-exported</strong> — The route needs to be exported as a
            constant
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">HMR not working</h2>
        <p className="text-neutral-400 mb-4">If hot module replacement isn't working:</p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            <strong>Check console for errors</strong> — Vite errors can break HMR
          </li>
          <li>
            <strong>File must be in routes/api/resources</strong> — Changes to other files may not
            trigger HMR
          </li>
          <li>
            <strong>Try restarting dev server</strong> — Sometimes gets into a broken state
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Context is undefined</h2>
        <p className="text-neutral-400 mb-4">If context is undefined in your handlers:</p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            <strong>Check createServer has createContext</strong> — Context must be defined in your
            server entry
          </li>
          <li>
            <strong>Production build context</strong> — In production, ensure your server entry is
            being used
          </li>
        </ul>
        <CodeBlock
          language="ts"
          code={`// server.ts - ensure createContext is defined
import { createServer } from "litzjs/server";

export default createServer({
  createContext(request) {
    // This provides context to all handlers
    return { userId: request.headers.get("x-user-id") };
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Getting help</h2>
        <p className="text-neutral-400 mb-4">If you're still stuck:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>Check the browser console for runtime errors</li>
          <li>Check the terminal for server-side errors</li>
          <li>Try simplifying your code to isolate the issue</li>
          <li>Search existing GitHub issues</li>
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
