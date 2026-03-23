import { defineRoute } from "litz";
import { Link } from "litz/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/middleware", {
  component: DocsMiddlewarePage,
});

function DocsMiddlewarePage() {
  return (
    <>
      <title>Middleware | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Middleware</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Run shared logic before handlers on routes, resources, and API routes. Middleware can
        authenticate, log, transform context, or short-circuit.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Defining middleware</h2>
        <p className="text-neutral-400 mb-4">
          Middleware is a function that receives{" "}
          <code className="text-sky-400">{"{ request, params, context, signal, next }"}</code>.
          Declare middleware as an array on route, resource, or API route options. They run in
          declaration order.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, server } from "litz";

export const route = defineRoute("/dashboard", {
  component: Dashboard,
  middleware: [
    async ({ request, context, next }) => {
      console.log("Request:", request.url);
      return next();
    },
  ],
  loader: server(async () => {
    return data({ stats: { users: 100 } });
  }),
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Continuing with next()</h2>
        <p className="text-neutral-400 mb-4">
          Call <code className="text-sky-400">next()</code> to pass control to the next middleware
          or the handler. You can extend the context by passing an object to{" "}
          <code className="text-sky-400">{"next({ context })"}</code>:
        </p>
        <CodeBlock
          language="tsx"
          code={`async ({ request, context, next }) => {
  const session = await getSession(request);

  return next({
    context: {
      ...context,
      userId: session.userId,
      role: session.role,
    },
  });
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Short-circuiting</h2>
        <p className="text-neutral-400 mb-4">
          Return a result directly — without calling <code className="text-sky-400">next()</code> —
          to skip the handler entirely. Route and resource middleware returns ServerResult values (
          <code className="text-sky-400">data</code>, <code className="text-sky-400">error</code>,{" "}
          <code className="text-sky-400">redirect</code>, etc.). API route middleware returns a{" "}
          <code className="text-sky-400">Response</code>.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { error } from "litz";

// Route/resource middleware — returns ServerResult
async ({ context, next }) => {
  if (!context.userId) {
    return error(401, "Unauthorized");
  }
  return next();
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Route and resource middleware
        </h2>
        <p className="text-neutral-400 mb-4">
          Middleware on routes and resources returns Litz ServerResult values. This is the most
          common pattern for protecting pages and reusable UI.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, error, redirect, server } from "litz";

const authMiddleware = async ({ context, next }) => {
  if (!context.userId) {
    return redirect("/login");
  }
  return next();
};

export const route = defineRoute("/account", {
  component: AccountPage,
  middleware: [authMiddleware],
  loader: server(async ({ context }) => {
    const user = await db.users.find(context.userId);
    return data({ user });
  }),
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">API route middleware</h2>
        <p className="text-neutral-400 mb-4">
          Middleware on API routes returns <code className="text-sky-400">Response</code> objects
          instead of ServerResult.
        </p>
        <CodeBlock
          language="ts"
          code={`import { defineApiRoute } from "litz";

const apiAuth = async ({ request, context, next }) => {
  const token = request.headers.get("Authorization");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return next({ context: { ...context, token } });
};

export const api = defineApiRoute("/api/data", {
  middleware: [apiAuth],
  GET({ context }) {
    return Response.json({ ok: true });
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Middleware and context</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">createContext(request)</code> in{" "}
          <code className="text-sky-400">createServer</code> provides the initial context.
          Middleware can extend it with <code className="text-sky-400">{"next({ context })"}</code>,
          and handlers read the final context.
        </p>
        <CodeBlock
          language="tsx"
          code={`// server.ts
import { createServer } from "litz/server";

export default createServer({
  async createContext(request) {
    const session = await getSession(request);
    return { userId: session?.userId ?? null };
  },
});

// routes/admin.tsx
import { data, defineRoute, error, server } from "litz";

const requireAdmin = async ({ context, next }) => {
  if (!context.userId) {
    return error(401, "Unauthorized");
  }
  const user = await db.users.find(context.userId);
  return next({
    context: { ...context, user, isAdmin: user.role === "admin" },
  });
};

export const route = defineRoute("/admin", {
  component: AdminPage,
  middleware: [requireAdmin],
  loader: server(async ({ context }) => {
    // context.user and context.isAdmin are available here
    return data({ user: context.user });
  }),
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Middleware patterns</h2>
        <h3 className="text-xl font-medium text-neutral-100 mb-3">Authentication</h3>
        <p className="text-neutral-400 mb-4">
          Check session, return an error or redirect for unauthorized users, continue for
          authenticated ones.
        </p>
        <h3 className="text-xl font-medium text-neutral-100 mb-3">Logging</h3>
        <p className="text-neutral-400 mb-4">
          Log the request before calling <code className="text-sky-400">next()</code>, then log the
          response after.
        </p>
        <h3 className="text-xl font-medium text-neutral-100 mb-3">Rate limiting</h3>
        <p className="text-neutral-400 mb-4">
          Check rate limits, short-circuit with an error if exceeded, or continue if within bounds.
        </p>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/api-routes"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; API Routes
        </Link>
        <Link
          href="/docs/error-handling"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          Error Handling &rarr;
        </Link>
      </div>
    </>
  );
}
