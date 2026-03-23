import { defineRoute } from "litz";
import { Link } from "litz/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/resources", {
  component: DocsResourcesPage,
});

function DocsResourcesPage() {
  return (
    <>
      <title>Resources | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Resources</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Build reusable server-backed UI that can be mounted anywhere without becoming a page.
      </p>
      <p className="text-neutral-400 mb-8">
        Resources are useful when something should be shareable across routes, layouts, dashboards,
        sidebars, or app shells without becoming a page of its own.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Mental model</h2>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>routes own navigation</li>
          <li>resources own reusable server-backed UI behavior</li>
        </ul>
        <p className="text-neutral-400 mb-4">
          Each rendered <code className="text-sky-400">{"<resource.Component ... />"}</code> creates
          a scoped resource instance. Inside that subtree, resource hooks work against that
          instance.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Loader-only resource</h2>
        <CodeBlock
          language="tsx"
          code={`import { data, defineResource, server } from "litz";

export const resource = defineResource("/resource/user/:id", {
  component: UserCard,
  loader: server(async ({ params }) => {
    return data({
      user: {
        id: params.id,
        name: "Ada",
      },
    });
  }),
});

function UserCard() {
  const user = resource.useLoaderData();
  const pending = resource.usePending();

  if (!user) {
    return <p>{pending ? "Loading..." : "No user"}</p>;
  }

  return <p>{user.user.name}</p>;
}`}
        />
        <p className="text-neutral-400 mt-4 mb-4">Render it anywhere:</p>
        <CodeBlock language="tsx" code={`<resource.Component params={{ id: "u_123" }} />`} />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Params and search</h2>
        <p className="text-neutral-400 mb-4">
          Resources accept <code className="text-sky-400">params</code> and optional{" "}
          <code className="text-sky-400">search</code> at the component boundary:
        </p>
        <CodeBlock
          language="tsx"
          code={`<resource.Component params={{ id: "u_123" }} search={{ tab: "profile" }} />`}
        />
        <p className="text-neutral-400 mt-4 mb-4">Inside the resource:</p>
        <CodeBlock
          language="tsx"
          code={`function UserCard() {
  const params = resource.useParams();
  const [searchParams, setSearch] = resource.useSearch();
  const tab = searchParams.get("tab") ?? "profile";

  return (
    <>
      <p>User id: {params.id}</p>
      <p>Tab: {tab}</p>
      <button onClick={() => setSearch({ tab: "security" })}>Security</button>
    </>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">View-based resources</h2>
        <p className="text-neutral-400 mb-4">
          Resources can also return <code className="text-sky-400">{"view(...)"}</code> and consume
          it with <code className="text-sky-400">{"resource.useView()"}</code>:
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
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Action-enabled resources</h2>
        <p className="text-neutral-400 mb-4">
          Resources can define actions and submit via forms or imperatively:
        </p>
        <CodeBlock
          language="tsx"
          code={`function QuickActions() {
  const submit = resource.useSubmit();
  const pending = resource.usePending();

  return (
    <button disabled={pending} onClick={() => void submit({ message: "Pinned update" })}>
      Post preset message
    </button>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Available hooks</h2>
        <p className="text-neutral-400 mb-4">
          Resources expose the same general style of hooks as routes, including:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">{"resource.useLoaderResult()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useLoaderData()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useLoaderView()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useActionResult()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useActionData()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useActionView()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useActionError()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useInvalid()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useData()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useView()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useError()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useStatus()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.usePending()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useParams()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useSearch()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useReload()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useRetry()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"resource.useSubmit()"}</code>
          </li>
          <li>
            <code className="text-sky-400">resource.Form</code>
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Multiple instances</h2>
        <p className="text-neutral-400 mb-4">
          Resources are instance-scoped, not global. You can mount the same resource more than once
          on the same page with different params or search inputs.
        </p>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link href="/docs/forms" className="text-neutral-400 hover:text-sky-400 transition-colors">
          &larr; Forms
        </Link>
        <Link href="/docs/api-routes" className="text-sky-500 hover:text-sky-400 transition-colors">
          API Routes &rarr;
        </Link>
      </div>
    </>
  );
}
