import { defineRoute } from "litz";
import { Link } from "litz/client";

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
        Test loaders, actions, and API routes as plain functions. Test components with standard
        React testing patterns.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Testing loaders and actions
        </h2>
        <p className="text-neutral-400 mb-4">
          Loaders and actions are plain async functions wrapped in{" "}
          <code className="text-sky-400">server()</code>. Because they are defined inline on the
          route object, the simplest test strategy is to import the route and call the server
          handler with the expected context.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { describe, it, expect } from "vitest";

// Your loader receives { request, params, signal, context }
// and returns a result helper like data(), error(), etc.
describe("user loader", () => {
  it("returns user data", async () => {
    const request = new Request("http://localhost/users/1");
    const result = await callLoader({
      request,
      params: { id: "1" },
      signal: new AbortController().signal,
      context: { userId: "admin" },
    });

    expect(result.kind).toBe("data");
    expect(result.data.user.id).toBe("1");
  });
});`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          How you extract and call the loader depends on your project setup. If you export a
          testable reference alongside the route, you can call it directly. Otherwise, use the
          integration testing pattern below.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Testing API routes</h2>
        <p className="text-neutral-400 mb-4">
          API route handlers receive{" "}
          <code className="text-sky-400">{"{ request, params, signal, context }"}</code> and return
          a <code className="text-sky-400">Response</code>. Import the API route and call its method
          handler directly:
        </p>
        <CodeBlock
          language="tsx"
          code={`import { describe, it, expect } from "vitest";
import { api } from "./api-users";

describe("GET /api/users", () => {
  it("returns a list of users", async () => {
    const request = new Request("http://localhost/api/users");
    const response = await api.GET({
      request,
      params: {},
      signal: new AbortController().signal,
      context: { userId: "admin" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.users).toBeInstanceOf(Array);
  });

  it("returns 401 without auth", async () => {
    const request = new Request("http://localhost/api/users");
    const response = await api.GET({
      request,
      params: {},
      signal: new AbortController().signal,
      context: { userId: null },
    });

    expect(response.status).toBe(401);
  });
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Testing components</h2>
        <p className="text-neutral-400 mb-4">
          Use standard React testing library patterns. Mock the route hooks like{" "}
          <code className="text-sky-400">useLoaderData</code> and{" "}
          <code className="text-sky-400">useActionData</code> to supply test data.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { route } from "./users-detail";

vi.mock("litz/client", () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

describe("UserProfile component", () => {
  it("renders user name", () => {
    vi.spyOn(route, "useLoaderData").mockReturnValue({
      user: { id: "1", name: "Alice" },
    });

    render(<route.component />);
    expect(screen.getByText("Alice")).toBeDefined();
  });
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Integration testing</h2>
        <p className="text-neutral-400 mb-4">
          For full integration tests, use the actual server handler.{" "}
          <code className="text-sky-400">createServer()</code> returns a handler you can call with
          real <code className="text-sky-400">Request</code> objects to verify routing, middleware,
          and auth together.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { describe, it, expect } from "vitest";
import app from "./server";

describe("integration", () => {
  it("serves the homepage", async () => {
    const response = await app(
      new Request("http://localhost/")
    );
    expect(response.status).toBe(200);
  });

  it("protects authenticated routes", async () => {
    const response = await app(
      new Request("http://localhost/dashboard")
    );
    expect(response.status).toBe(401);
  });

  it("allows authenticated access", async () => {
    const response = await app(
      new Request("http://localhost/dashboard", {
        headers: { authorization: "Bearer valid-token" },
      })
    );
    expect(response.status).toBe(200);
  });
});`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          The server entry created by <code className="text-sky-400">createServer()</code> is a
          WinterCG-compatible handler: <code className="text-sky-400">Request → Response</code>.
          This makes it straightforward to test without an HTTP server.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Tips</h2>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            Keep server logic in loaders and actions, not components &mdash; functions are easier to
            test than rendered UI.
          </li>
          <li>
            Test validation logic by calling actions with various{" "}
            <code className="text-sky-400">FormData</code> inputs.
          </li>
          <li>
            Pass an <code className="text-sky-400">AbortSignal</code> from an{" "}
            <code className="text-sky-400">AbortController</code> in tests to verify cancellation
            behavior.
          </li>
          <li>
            Use the integration testing pattern for smoke tests that verify routing, middleware, and
            auth together.
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
