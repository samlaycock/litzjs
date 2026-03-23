import { defineRoute } from "litz";
import { Link } from "litz/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/view-responses", {
  component: DocsViewResponsesPage,
});

function DocsViewResponsesPage() {
  return (
    <>
      <title>View Responses | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">View Responses</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Return server-rendered UI fragments with <code className="text-sky-400">view()</code> using
        React Server Components as a transport.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">How view() works</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">view(node, options?)</code> returns a React Server
          Component fragment that is sent to the client via the RSC/Flight wire format. The route
          component stays client-rendered &mdash; <code className="text-sky-400">view()</code> only
          delivers a fragment for the client to embed.
        </p>
        <CodeBlock
          language="tsx"
          code={`import * as React from "react";
import { defineRoute, server, view } from "litz";

export const route = defineRoute("/dashboard", {
  component: Dashboard,
  loader: server(async ({ context }) => {
    const stats = await getStats(context.userId);
    return view(
      <div>
        <h2>Your Stats</h2>
        <p>Posts: {stats.posts}</p>
        <p>Followers: {stats.followers}</p>
      </div>
    );
  }),
});

function Dashboard() {
  const loaderView = route.useLoaderView();

  return (
    <div>
      <h1>Dashboard</h1>
      <React.Suspense fallback={<p>Loading...</p>}>
        {loaderView}
      </React.Suspense>
    </div>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          When to use view() vs data()
        </h2>
        <p className="text-neutral-400 mb-4">
          Use <code className="text-sky-400">data()</code> when the component knows how to render
          the data &mdash; this covers most cases. Use <code className="text-sky-400">view()</code>{" "}
          when you want the server to decide the UI, such as complex rendering logic, server-only
          data shaping, or heavy computation.
        </p>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">view()</code> is{" "}
          <strong className="text-neutral-200">not</strong> SSR &mdash; it is a UI fragment
          transport. The route component is still client-rendered.
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">data()</code> &mdash; client renders the data, best for
            simple JSON payloads, smaller wire size, easier to cache
          </li>
          <li>
            <code className="text-sky-400">view()</code> — server renders a JSX fragment, best for
            complex or sensitive UI assembly, can stream heavy content via Suspense
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Performance considerations</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">view()</code> and{" "}
          <code className="text-sky-400">data()</code> have different performance characteristics:
        </p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            <strong>Wire size</strong> — <code className="text-sky-400">data()</code> sends JSON
            (smaller), <code className="text-sky-400">view()</code> sends serialized React nodes
            (larger but pre-rendered)
          </li>
          <li>
            <strong>Client work</strong> — <code className="text-sky-400">data()</code> requires
            client-side rendering, <code className="text-sky-400">view()</code> is ready to render
          </li>
          <li>
            <strong>Caching</strong> — <code className="text-sky-400">data()</code> responses are
            easier to cache as JSON, <code className="text-sky-400">view()</code> can use HTTP
            caching via <code className="text-sky-400">withHeaders()</code>
          </li>
          <li>
            <strong>Streaming</strong> — <code className="text-sky-400">view()</code> supports
            streaming with Suspense for large or slow content
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          In general: start with <code className="text-sky-400">data()</code> and use{" "}
          <code className="text-sky-400">view()</code> when you have a specific reason to shift
          rendering work to the server.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Consuming view results</h2>
        <p className="text-neutral-400 mb-4">
          Litz provides three hooks for consuming view results:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">route.useLoaderView()</code> &mdash; view from the loader
          </li>
          <li>
            <code className="text-sky-400">route.useActionView()</code> &mdash; view from the action
          </li>
          <li>
            <code className="text-sky-400">route.useView()</code> &mdash; latest settled view from
            either loader or action
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          Wrap the view in <code className="text-sky-400">{"<React.Suspense>"}</code> for streaming:
        </p>
        <CodeBlock
          language="tsx"
          code={`import * as React from "react";

function ReportsPage() {
  const view = route.useView();

  if (!view) {
    return <p>Loading reports...</p>;
  }

  return (
    <React.Suspense fallback={<p>Loading reports...</p>}>
      {view}
    </React.Suspense>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">View in actions</h2>
        <p className="text-neutral-400 mb-4">
          Actions can also return <code className="text-sky-400">view()</code>. This is useful for
          server-rendered confirmation UI, updated lists, or any fragment the server should produce
          after a mutation.
        </p>
        <CodeBlock
          language="tsx"
          code={`import * as React from "react";
import { data, defineRoute, server, view } from "litz";

export const route = defineRoute("/posts/new", {
  component: NewPostPage,
  action: server(async ({ request }) => {
    const formData = await request.formData();
    const title = String(formData.get("title") ?? "");
    const post = await createPost(title);

    return view(
      <div>
        <p>Post "{post.title}" created successfully.</p>
        <a href={\`/posts/\${post.id}\`}>View post</a>
      </div>
    );
  }),
});

function NewPostPage() {
  const actionView = route.useActionView();

  return (
    <div>
      {actionView ? (
        <React.Suspense fallback={<p>Loading...</p>}>
          {actionView}
        </React.Suspense>
      ) : (
        <route.Form>
          <input name="title" placeholder="Post title" />
          <button type="submit">Create</button>
        </route.Form>
      )}
    </div>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">View in resources</h2>
        <p className="text-neutral-400 mb-4">
          Resources support <code className="text-sky-400">view()</code> for reusable
          server-rendered fragments that can be consumed from any component.
        </p>
        <CodeBlock
          language="tsx"
          code={`import * as React from "react";
import { defineResource, server, view } from "litz";

export const resource = defineResource("/resource/account/:id", {
  component: AccountMenu,
  loader: server(async ({ params }) => {
    return view(<section>Account {params.id}</section>);
  }),
});

function AccountMenu() {
  const view = resource.useView();

  if (!view) {
    return <p>Loading account menu...</p>;
  }

  return (
    <React.Suspense fallback={<p>Loading account menu...</p>}>
      {view}
    </React.Suspense>
  );
}`}
        />
        <p className="text-neutral-400 mt-4 mb-4">Render it anywhere:</p>
        <CodeBlock language="tsx" code={`<resource.Component params={{ id: "u_123" }} />`} />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Options</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">{"view(node, { headers?, revalidate? })"}</code> accepts an
          optional second argument. You can combine it with{" "}
          <code className="text-sky-400">withHeaders()</code> for additional cache control:
        </p>
        <CodeBlock
          language="tsx"
          code={`import { server, view, withHeaders } from "litz";

// Using the options argument directly
const loader = server(async () => {
  const content = await getContent();
  return view(
    <article>{content.body}</article>,
    { revalidate: ["/dashboard"] },
  );
});

// Or combining with withHeaders
const loaderWithHeaders = server(async () => {
  const content = await getContent();
  return withHeaders(
    view(<article>{content.body}</article>),
    { "Cache-Control": "public, max-age=3600" },
  );
});`}
        />
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/authentication"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Authentication
        </Link>
        <Link href="/docs/typescript" className="text-sky-500 hover:text-sky-400 transition-colors">
          TypeScript &rarr;
        </Link>
      </div>
    </>
  );
}
