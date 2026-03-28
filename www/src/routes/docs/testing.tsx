import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/testing", {
  component: DocsTestingPage,
});

function DocsTestingPage() {
  return (
    <>
      <title>Testing | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Testing</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Test loaders, actions, and API routes as plain functions. Use Bun&apos;s test runner for
        unit tests and the real server entry for integration coverage.
      </p>
      <p className="text-neutral-400 mb-8">
        Run the examples on this page with <code className="text-sky-400">bun test</code>. During
        development, <code className="text-sky-400">bun test --watch</code> gives you the same
        feedback loop without swapping to a different test runner.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Testing loaders and actions
        </h2>
        <p className="text-neutral-400 mb-4">
          The simplest pattern is to export the handler you pass to{" "}
          <code className="text-sky-400">defineRoute()</code>.{" "}
          <code className="text-sky-400">server()</code> is the boundary Litz uses for route
          handlers, so the exported handler can be called directly in a Bun test with the same
          context shape Litz passes at runtime.
        </p>
        <CodeBlock
          language="tsx"
          code={`// src/routes/users.$id.tsx
import { data, defineRoute, server } from "litzjs";

export const loader = server(async ({ params, context }) => {
  return data({
    user: {
      id: params.id,
      canEdit: context.role === "admin",
    },
  });
});

export const route = defineRoute("/users/:id", {
  component: UserPage,
  loader,
});

function UserPage() {
  const result = route.useLoaderData();

  return <h1>{result?.user.id}</h1>;
}

// tests/users.$id.test.ts
import { describe, expect, test } from "bun:test";
import { loader } from "../src/routes/users.$id";

describe("users loader", () => {
  test("returns user data for admins", async () => {
    const result = await loader({
      request: new Request("http://localhost/users/1"),
      params: { id: "1" },
      signal: new AbortController().signal,
      context: { role: "admin" },
      input: undefined,
    });

    expect(result).toMatchObject({
      kind: "data",
      data: {
        user: {
          id: "1",
          canEdit: true,
        },
      },
    });
  });
});`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          The same pattern works for actions. Export the action handler, pass a real{" "}
          <code className="text-sky-400">Request</code> plus any route params and context, then
          assert on the returned <code className="text-sky-400">data()</code>,{" "}
          <code className="text-sky-400">invalid()</code>, or{" "}
          <code className="text-sky-400">redirect()</code> result.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Testing API routes</h2>
        <p className="text-neutral-400 mb-4">
          API route handlers receive{" "}
          <code className="text-sky-400">{"{ request, params, signal, context, input }"}</code> and
          return a <code className="text-sky-400">Response</code>. Import the route and call the
          method you want to exercise directly:
        </p>
        <CodeBlock
          language="tsx"
          code={`// src/routes/api.users.ts
import { defineApiRoute } from "litzjs";

export const api = defineApiRoute("/api/users", {
  GET({ context }) {
    if (!context.userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    return Response.json({
      users: [{ id: "1", name: "Ada" }],
    });
  },
});

// tests/api.users.test.ts
import { describe, expect, test } from "bun:test";
import { api } from "../src/routes/api.users";

describe("GET /api/users", () => {
  test("returns a list of users", async () => {
    const response = await api.GET({
      request: new Request("http://localhost/api/users"),
      params: {},
      signal: new AbortController().signal,
      context: { userId: "admin" },
      input: undefined,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: [{ id: "1", name: "Ada" }],
    });
  });

  test("returns 401 without auth", async () => {
    const response = await api.GET({
      request: new Request("http://localhost/api/users"),
      params: {},
      signal: new AbortController().signal,
      context: { userId: null },
      input: undefined,
    });

    expect(response.status).toBe(401);
  });
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Testing components</h2>
        <p className="text-neutral-400 mb-4">
          Keep route hooks in a thin wrapper and move the view you want to assert on into a plain
          component. That lets you test rendering with Bun and React Testing Library without mocking
          internal route state.
        </p>
        <p className="text-neutral-400 mb-4">
          If you want DOM-focused assertions, install the helpers once with{" "}
          <code className="text-sky-400">
            bun add -d @testing-library/react @testing-library/dom
          </code>
          .
        </p>
        <CodeBlock
          language="tsx"
          code={`// src/routes/users.$id.tsx
import { data, defineRoute, server } from "litzjs";

interface UserProfileViewProps {
  readonly user: {
    readonly name: string;
  };
}

export function UserProfileView({ user }: UserProfileViewProps) {
  return <h1>{user.name}</h1>;
}

export const loader = server(async () => {
  return data({
    user: {
      name: "Ada",
    },
  });
});

export const route = defineRoute("/users/:id", {
  component: UserProfilePage,
  loader,
});

function UserProfilePage() {
  const result = route.useLoaderData();

  return result ? <UserProfileView user={result.user} /> : null;
}

// tests/user-profile-view.test.tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { UserProfileView } from "../src/routes/users.$id";

describe("UserProfileView", () => {
  test("renders the user name", () => {
    render(<UserProfileView user={{ name: "Ada" }} />);

    expect(screen.getByText("Ada")).toBeTruthy();
  });
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Integration testing</h2>
        <p className="text-neutral-400 mb-4">
          For end-to-end request handling, build a server with{" "}
          <code className="text-sky-400">createServer()</code> and call{" "}
          <code className="text-sky-400">app.fetch(request)</code>. This exercises your real
          routing, context creation, and middleware decisions with WinterCG-style{" "}
          <code className="text-sky-400">Request</code> objects.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { describe, expect, test } from "bun:test";
import { defineApiRoute } from "litzjs";
import { createServer } from "litzjs/server";

const profileApi = defineApiRoute("/api/profile", {
  GET({ context }) {
    if (!context.userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    return Response.json({ userId: context.userId });
  },
});

const app = createServer({
  createContext(request) {
    return {
      userId:
        request.headers.get("authorization") === "Bearer valid-token" ? "u_123" : null,
    };
  },
  manifest: {
    apiRoutes: [{ path: profileApi.path, api: profileApi }],
  },
});

describe("app.fetch", () => {
  test("rejects anonymous requests", async () => {
    const response = await app.fetch(new Request("http://localhost/api/profile"));

    expect(response.status).toBe(401);
  });

  test("returns the authenticated user", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/profile", {
        headers: { authorization: "Bearer valid-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: "u_123" });
  });
});`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          The server entry created by <code className="text-sky-400">createServer()</code> exposes a
          WinterCG-compatible <code className="text-sky-400">fetch(request)</code> method, so you
          can test real request handling without starting an HTTP server.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Tips</h2>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>Export route handlers as named constants so your tests can import them directly.</li>
          <li>Keep route components thin and test presentational components with plain props.</li>
          <li>
            Test validation logic by calling actions with real{" "}
            <code className="text-sky-400">Request</code> and{" "}
            <code className="text-sky-400">FormData</code> inputs.
          </li>
          <li>
            Pass an <code className="text-sky-400">AbortSignal</code> from an{" "}
            <code className="text-sky-400">AbortController</code> when you want to verify
            cancellation behaviour.
          </li>
          <li>
            Reserve <code className="text-sky-400">app.fetch(...)</code> tests for request flow,
            middleware, and authentication smoke coverage.
          </li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/typescript"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; TypeScript
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
