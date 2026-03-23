import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/routing", {
  component: DocsRoutingPage,
});

function DocsRoutingPage() {
  return (
    <>
      <title>Routing | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Routing</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Define routes with explicit paths, configure loaders and actions, and connect to layouts.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">defineRoute</h2>
        <p className="text-neutral-400 mb-4">
          The path passed to <code className="text-sky-400">defineRoute(...)</code> is the source of
          truth. Routes are explicit, not filesystem-based. The file can live anywhere in your
          project; only the path string matters.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { defineRoute } from "litzjs";

export const route = defineRoute("/", {
  component: HomePage,
});

function HomePage() {
  return <h1>Welcome</h1>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Route options</h2>
        <p className="text-neutral-400 mb-4">
          The second argument to <code className="text-sky-400">defineRoute</code> accepts:
        </p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">component</code> (required) &mdash; the React component
            rendered when the route matches.
          </li>
          <li>
            <code className="text-sky-400">loader</code> &mdash; a server function that provides
            data to the component. See{" "}
            <Link href="/docs/loaders-and-actions" className="text-sky-500 hover:text-sky-400">
              Loaders &amp; Actions
            </Link>{" "}
            for details.
          </li>
          <li>
            <code className="text-sky-400">action</code> &mdash; a server function that handles
            writes and form submissions.
          </li>
          <li>
            <code className="text-sky-400">layout</code> &mdash; an imported layout to wrap this
            route. See{" "}
            <Link href="/docs/layouts" className="text-sky-500 hover:text-sky-400">
              Layouts
            </Link>
            .
          </li>
          <li>
            <code className="text-sky-400">middleware</code> &mdash; an array of middleware
            functions that run before the loader or action.
          </li>
          <li>
            <code className="text-sky-400">pendingComponent</code> &mdash; shown while the loader is
            in flight.
          </li>
          <li>
            <code className="text-sky-400">errorComponent</code> &mdash; rendered when the route
            errors.
          </li>
          <li>
            <code className="text-sky-400">offline</code> &mdash; marks the route as available
            without a server connection.
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Path parameters</h2>
        <p className="text-neutral-400 mb-4">
          Use <code className="text-sky-400">{":paramName"}</code> in the path to define dynamic
          segments. Access them with <code className="text-sky-400">useParams()</code>:
        </p>
        <CodeBlock
          language="tsx"
          code={`import { defineRoute } from "litzjs";

export const route = defineRoute("/users/:id", {
  component: UserPage,
});

function UserPage() {
  const params = route.useParams();

  return <p>User ID: {params.id}</p>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Loader example</h2>
        <p className="text-neutral-400 mb-4">
          A minimal loader to fetch server data. For the full API, see{" "}
          <Link href="/docs/loaders-and-actions" className="text-sky-500 hover:text-sky-400">
            Loaders &amp; Actions
          </Link>
          .
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, server } from "litzjs";

export const route = defineRoute("/me", {
  component: ProfilePage,
  loader: server(async () => {
    return data({
      user: { id: "u_123", name: "Ada" },
    });
  }),
});

function ProfilePage() {
  const profile = route.useLoaderData();

  return <p>{profile?.user.name}</p>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Connecting to layouts</h2>
        <p className="text-neutral-400 mb-4">
          A route opts into a layout by importing it and assigning it to the{" "}
          <code className="text-sky-400">layout</code> option:
        </p>
        <CodeBlock
          language="tsx"
          code={`import { defineRoute } from "litzjs";
import { dashboardLayout } from "./dashboard-layout";

export const route = defineRoute("/dashboard/settings", {
  component: SettingsPage,
  layout: dashboardLayout,
});

function SettingsPage() {
  return <h1>Settings</h1>;
}`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          See{" "}
          <Link href="/docs/layouts" className="text-sky-500 hover:text-sky-400">
            Layouts
          </Link>{" "}
          for how to define layouts with <code className="text-sky-400">defineLayout</code>.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Route discovery</h2>
        <p className="text-neutral-400 mb-4">
          The Litz Vite plugin scans your project for files that export a{" "}
          <code className="text-sky-400">route</code> binding created by{" "}
          <code className="text-sky-400">defineRoute</code>. It collects these at build time so the
          client router knows every path.
        </p>
        <p className="text-neutral-400 mb-4">
          Because routes are path-based rather than filesystem-based, you can organise route files
          however you like. The plugin only cares about the exported{" "}
          <code className="text-sky-400">route</code> binding, not the directory structure.
        </p>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/quick-start"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Quick Start
        </Link>
        <Link href="/docs/layouts" className="text-sky-500 hover:text-sky-400 transition-colors">
          Layouts &rarr;
        </Link>
      </div>
    </>
  );
}
