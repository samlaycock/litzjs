import { defineRoute } from "litz";
import { Link } from "litz/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/authentication", {
  component: DocsAuthenticationPage,
});

function DocsAuthenticationPage() {
  return (
    <>
      <title>Authentication | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Authentication</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Protect routes with middleware, create session context, and build login/logout flows.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Session context with createServer
        </h2>
        <p className="text-neutral-400 mb-4">
          Use <code className="text-sky-400">createContext(request)</code> to parse cookies or
          tokens from the incoming request and create session information that is available to every
          loader, action, and middleware.
        </p>
        <CodeBlock
          language="ts"
          code={`import { createServer } from "litz/server";

export default createServer({
  createContext(request) {
    const token = request.headers
      .get("authorization")
      ?.replace("Bearer ", "");
    return { userId: token ? verifyToken(token) : null };
  },
  onError(error) {
    console.error(error);
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Auth middleware</h2>
        <p className="text-neutral-400 mb-4">
          Create a reusable middleware function that checks the context and short-circuits with an
          error or redirect if the user is not authenticated. Middleware receives{" "}
          <code className="text-sky-400">{"{ request, params, context, signal }"}</code> and a{" "}
          <code className="text-sky-400">next()</code> function.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { error, redirect } from "litz";

// Return an error
const requireAuth = async ({ context, next }) => {
  if (!context.userId) {
    return error(401, "Unauthorized");
  }
  return next();
};

// Or redirect to login
const requireAuthRedirect = async ({ context, next }) => {
  if (!context.userId) {
    return redirect("/login");
  }
  return next();
};`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Protecting routes</h2>
        <p className="text-neutral-400 mb-4">
          Add middleware to your route definition. The middleware runs before the loader and action,
          so you can guard access to the entire route.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, error, server } from "litz";

const requireAuth = async ({ context, next }) => {
  if (!context.userId) {
    return error(401, "Unauthorized");
  }
  return next();
};

export const route = defineRoute("/dashboard", {
  component: Dashboard,
  middleware: [requireAuth],
  loader: server(async ({ context }) => {
    const user = await getUser(context.userId);
    return data({ user });
  }),
});

function Dashboard() {
  const result = route.useLoaderData();
  if (!result) return null;
  return <h1>Welcome, {result.user.name}</h1>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Protecting API routes</h2>
        <p className="text-neutral-400 mb-4">
          The same middleware pattern works for API routes, but you return a{" "}
          <code className="text-sky-400">Response</code> instead of a{" "}
          <code className="text-sky-400">ServerResult</code>.
        </p>
        <CodeBlock
          language="ts"
          code={`import { defineApiRoute } from "litz";

const apiAuth = async ({ context, next }) => {
  if (!context.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return next();
};

export const api = defineApiRoute("/api/profile", {
  middleware: [apiAuth],
  GET({ context }) {
    const user = getUser(context.userId);
    return Response.json({ user });
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Login flow</h2>
        <p className="text-neutral-400 mb-4">
          Create a login route with an action that validates credentials, sets a session cookie, and
          redirects to the authenticated area.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, invalid, redirect, server, withHeaders } from "litz";

export const route = defineRoute("/login", {
  component: LoginPage,
  action: server(async ({ request }) => {
    const formData = await request.formData();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    const user = await authenticate(email, password);

    if (!user) {
      return invalid({
        fields: { email: "Invalid credentials" },
      });
    }

    const token = await createSession(user.id);

    return withHeaders(redirect("/dashboard"), {
      "Set-Cookie": \`session=\${token}; Path=/; HttpOnly; Secure\`,
    });
  }),
});

function LoginPage() {
  const validation = route.useInvalid();

  return (
    <route.Form>
      {validation?.fields?.email && (
        <p className="text-red-400">{validation.fields.email}</p>
      )}
      <input name="email" type="email" placeholder="Email" />
      <input name="password" type="password" placeholder="Password" />
      <button type="submit">Log in</button>
    </route.Form>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Logout flow</h2>
        <p className="text-neutral-400 mb-4">
          A logout action clears the session cookie and redirects the user back to the home page.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { defineRoute, redirect, server, withHeaders } from "litz";

export const route = defineRoute("/logout", {
  component: () => null,
  action: server(async () => {
    return withHeaders(redirect("/"), {
      "Set-Cookie": "session=; Path=/; HttpOnly; Secure; Max-Age=0",
    });
  }),
});`}
        />
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/error-handling"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Error Handling
        </Link>
        <Link
          href="/docs/view-responses"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          View Responses &rarr;
        </Link>
      </div>
    </>
  );
}
