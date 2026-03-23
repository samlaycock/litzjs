import { defineRoute } from "litz";
import { Link } from "litz/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/layouts", {
  component: DocsLayoutsPage,
});

function DocsLayoutsPage() {
  return (
    <>
      <title>Layouts | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Layouts</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Wrap groups of routes in shared UI shells with optional server data.
      </p>
      <p className="text-neutral-400 mb-4">
        Layouts are explicit in Litz. A route opts into a layout by importing it and passing it as
        the <code className="text-sky-400">layout</code> option in{" "}
        <code className="text-sky-400">defineRoute</code>. There is no file-system convention or
        magic nesting &mdash; you wire layouts yourself.
      </p>
      <p className="text-neutral-400 mb-8">
        Every layout component receives{" "}
        <code className="text-sky-400">{"{ children: ReactNode }"}</code> as props and renders its
        children wherever the inner content should appear.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Defining a layout</h2>
        <p className="text-neutral-400 mb-4">
          Use <code className="text-sky-400">defineLayout(path, options)</code> to create a layout.
          The path scopes the layout and is used for loader requests.
        </p>
        <CodeBlock
          language="tsx"
          code={`import type { ReactNode } from "react";
import { defineLayout, defineRoute } from "litz";

export const dashboardLayout = defineLayout("/dashboard", {
  component: DashboardShell,
});

export const route = defineRoute("/dashboard/settings", {
  component: SettingsPage,
  layout: dashboardLayout,
});

function DashboardShell(props: { children: ReactNode }) {
  return (
    <div className="flex">
      <aside>Dashboard nav</aside>
      <main>{props.children}</main>
    </div>
  );
}

function SettingsPage() {
  return <h1>Settings</h1>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Layout loaders</h2>
        <p className="text-neutral-400 mb-4">
          Layouts can define their own loaders that run before the route loader. This is useful for
          fetching shared data like the current user or navigation items.
        </p>
        <CodeBlock
          language="tsx"
          code={`import type { ReactNode } from "react";
import { data, defineLayout, server } from "litz";

export const appLayout = defineLayout("/app", {
  component: AppShell,
  loader: server(async ({ request }) => {
    const user = await getUser(request);
    return data({ user });
  }),
});

function AppShell(props: { children: ReactNode }) {
  const layoutData = appLayout.useLoaderData();

  return (
    <div>
      <header>Welcome, {layoutData?.user.name}</header>
      <main>{props.children}</main>
    </div>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Layout hooks</h2>
        <p className="text-neutral-400 mb-4">
          Layouts expose the same style of hooks as routes, scoped to the layout instance:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">{"layout.useLoaderResult()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"layout.useLoaderData()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"layout.useLoaderView()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"layout.useData()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"layout.useView()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"layout.useParams()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"layout.useSearch()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"layout.useStatus()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"layout.usePending()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"layout.useReload()"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"layout.useRetry()"}</code>
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Nested layouts</h2>
        <p className="text-neutral-400 mb-4">
          A layout can reference another layout via the <code className="text-sky-400">layout</code>{" "}
          option, creating a chain. The outermost layout renders first and wraps the inner ones.
        </p>
        <CodeBlock
          language="tsx"
          code={`import type { ReactNode } from "react";
import { defineLayout, defineRoute } from "litz";

export const rootLayout = defineLayout("/", {
  component: RootShell,
});

export const adminLayout = defineLayout("/admin", {
  component: AdminShell,
  layout: rootLayout,
});

export const route = defineRoute("/admin/users", {
  component: UsersPage,
  layout: adminLayout,
});

function RootShell(props: { children: ReactNode }) {
  return (
    <html>
      <body>{props.children}</body>
    </html>
  );
}

function AdminShell(props: { children: ReactNode }) {
  return (
    <div className="admin">
      <nav>Admin sidebar</nav>
      <main>{props.children}</main>
    </div>
  );
}

function UsersPage() {
  return <h1>Users</h1>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Layout options</h2>
        <p className="text-neutral-400 mb-4">
          The full set of options accepted by <code className="text-sky-400">defineLayout</code>:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">component</code> (required) &mdash; the React component
            that receives <code className="text-sky-400">{"{ children }"}</code>
          </li>
          <li>
            <code className="text-sky-400">layout</code> (optional) &mdash; a parent layout to nest
            inside
          </li>
          <li>
            <code className="text-sky-400">loader</code> (optional) &mdash; a server loader wrapped
            in <code className="text-sky-400">server()</code>
          </li>
          <li>
            <code className="text-sky-400">middleware</code> (optional) &mdash; middleware to run
            before the loader
          </li>
          <li>
            <code className="text-sky-400">pendingComponent</code> (optional) &mdash; shown while
            the layout loader is in flight
          </li>
          <li>
            <code className="text-sky-400">errorComponent</code> (optional) &mdash; shown when the
            layout loader errors
          </li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/routing"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Routing
        </Link>
        <Link href="/docs/navigation" className="text-sky-500 hover:text-sky-400 transition-colors">
          Navigation &rarr;
        </Link>
      </div>
    </>
  );
}
