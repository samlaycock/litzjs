import { defineRoute } from "litz";
import { Link } from "litz/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/loaders-and-actions", {
  component: DocsLoadersAndActionsPage,
});

function DocsLoadersAndActionsPage() {
  return (
    <>
      <title>Loaders &amp; Actions | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Loaders &amp; Actions</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Fetch server data with loaders and handle writes with actions. All server logic lives behind
        explicit <code className="text-sky-400">server()</code> boundaries.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">The server() boundary</h2>
        <p className="text-neutral-400 mb-4">
          The <code className="text-sky-400">server()</code> wrapper marks a function as
          server-only. The bundler tree-shakes it and its dependencies from the client bundle. It
          can only be used inside Litz-owned boundaries &mdash; route and resource loaders and
          actions &mdash; never inside arbitrary components.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, server } from "litz";

export const route = defineRoute("/dashboard", {
  component: DashboardPage,
  loader: server(async ({ request, params, signal, context }) => {
    // Everything in here is server-only.
    // It will never appear in the client bundle.
    const stats = await db.getStats();
    return data({ stats });
  }),
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Loaders</h2>
        <p className="text-neutral-400 mb-4">
          Loaders fetch data when a route is navigated to. The handler receives{" "}
          <code className="text-sky-400">{"{ request, params, signal, context }"}</code>.
        </p>
        <p className="text-neutral-400 mb-4">
          Routes without loaders are fully client-side &mdash; no server request is made on
          navigation.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, server } from "litz";

export const route = defineRoute("/projects/:id", {
  component: ProjectPage,
  loader: server(async ({ params }) => {
    const project = await db.projects.findById(params.id);
    return data({ project });
  }),
});

function ProjectPage() {
  const result = route.useLoaderData();

  if (!result) return <p>Loading...</p>;

  return <h1>{result.project.name}</h1>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Result types</h2>
        <p className="text-neutral-400 mb-4">
          Loaders and actions return typed results. Each result type serves a different purpose:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">{"data(value, options?)"}</code> &mdash; JSON data,
            populates <code className="text-sky-400">useLoaderData()</code>. Options:{" "}
            <code className="text-sky-400">{"{ headers?, status?, revalidate? }"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"view(node, options?)"}</code> &mdash; RSC fragment,
            populates <code className="text-sky-400">useLoaderView()</code>. Options:{" "}
            <code className="text-sky-400">{"{ headers?, revalidate? }"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"redirect(location, options?)"}</code> &mdash; client
            redirect, interrupts navigation. Options:{" "}
            <code className="text-sky-400">{"{ headers?, status?, replace?, revalidate? }"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"error(status, message, options?)"}</code> &mdash; route
            error state. Options:{" "}
            <code className="text-sky-400">{"{ headers?, code?, data? }"}</code>
          </li>
          <li>
            <code className="text-sky-400">{"withHeaders(result, headers)"}</code> &mdash; merge
            headers onto any result
          </li>
        </ul>
        <h3 className="text-xl font-medium text-neutral-100 mb-3 mt-6">Example</h3>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, error, redirect, server, withHeaders } from "litz";

export const route = defineRoute("/projects/:id", {
  component: ProjectPage,
  loader: server(async ({ params, request }) => {
    const session = await getSession(request);

    if (!session) {
      return redirect("/login");
    }

    const project = await db.projects.findById(params.id);

    if (!project) {
      return error(404, "Project not found");
    }

    return withHeaders(
      data({ project }, { revalidate: ["/projects"] }),
      { "Cache-Control": "private, max-age=60" },
    );
  }),
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Actions</h2>
        <p className="text-neutral-400 mb-4">
          Actions handle writes and form submissions. They use the same handler signature as loaders
          and support an additional result type:{" "}
          <code className="text-sky-400">{"invalid({ fields?, formError?, data? })"}</code> for
          validation errors.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, invalid, redirect, server } from "litz";

export const route = defineRoute("/projects/new", {
  component: NewProjectPage,
  action: server(async ({ request }) => {
    const formData = await request.formData();
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (!name) {
      return invalid({
        fields: { name: "Name is required" },
      });
    }

    if (name.length < 3) {
      return invalid({
        fields: { name: "Name must be at least 3 characters" },
      });
    }

    const project = await db.projects.create({ name, description });

    return redirect(\`/projects/\${project.id}\`, {
      revalidate: ["/projects"],
    });
  }),
});

function NewProjectPage() {
  const validation = route.useInvalid();

  return (
    <route.Form>
      <label>
        Name
        <input name="name" />
        {validation?.fields?.name && (
          <p className="text-red-400">{validation.fields.name}</p>
        )}
      </label>
      <label>
        Description
        <textarea name="description" />
      </label>
      <button type="submit">Create</button>
    </route.Form>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Result hooks</h2>
        <p className="text-neutral-400 mb-4">
          Litz provides a layered hook system. Each hook targets a specific slice of the result:
        </p>
        <h3 className="text-xl font-medium text-neutral-100 mb-3">Raw result hooks</h3>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">route.useLoaderResult()</code> &mdash; normalized loader
            result branches
          </li>
          <li>
            <code className="text-sky-400">route.useActionResult()</code> &mdash; normalized action
            result branches
          </li>
        </ul>
        <h3 className="text-xl font-medium text-neutral-100 mb-3">Loader-specific hooks</h3>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">route.useLoaderData()</code> &mdash; JSON data from the
            loader
          </li>
          <li>
            <code className="text-sky-400">route.useLoaderView()</code> &mdash; RSC view node from
            the loader
          </li>
        </ul>
        <h3 className="text-xl font-medium text-neutral-100 mb-3">Action-specific hooks</h3>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">route.useActionData()</code> &mdash; JSON data from the
            action
          </li>
          <li>
            <code className="text-sky-400">route.useActionView()</code> &mdash; RSC view node from
            the action
          </li>
          <li>
            <code className="text-sky-400">route.useActionError()</code> &mdash; error result from
            the action
          </li>
          <li>
            <code className="text-sky-400">route.useInvalid()</code> &mdash; validation errors from
            the action
          </li>
        </ul>
        <h3 className="text-xl font-medium text-neutral-100 mb-3">Merged hooks</h3>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">route.useData()</code> &mdash; latest settled data from
            either loader or action
          </li>
          <li>
            <code className="text-sky-400">route.useView()</code> &mdash; latest settled view from
            either loader or action
          </li>
          <li>
            <code className="text-sky-400">route.useError()</code> &mdash; latest settled error from
            either loader or action
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          Unresolved values are <code className="text-sky-400">null</code> until the corresponding
          loader or action completes.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Route status</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">route.useStatus()</code> returns the current route
          lifecycle state:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">'idle'</code> &mdash; no pending operations
          </li>
          <li>
            <code className="text-sky-400">'loading'</code> &mdash; loader is fetching
          </li>
          <li>
            <code className="text-sky-400">'submitting'</code> &mdash; action is in flight
          </li>
          <li>
            <code className="text-sky-400">'revalidating'</code> &mdash; reloading after an action
          </li>
          <li>
            <code className="text-sky-400">'offline-stale'</code> &mdash; serving stale data while
            offline
          </li>
          <li>
            <code className="text-sky-400">'error'</code> &mdash; an error occurred
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">route.usePending()</code> returns a boolean &mdash;{" "}
          <code className="text-sky-400">true</code> whenever the route is loading, submitting, or
          revalidating.
        </p>
        <CodeBlock
          language="tsx"
          code={`function SaveToolbar() {
  const status = route.useStatus();
  const pending = route.usePending();

  return (
    <div className="flex items-center gap-2">
      <button type="submit" disabled={pending}>
        {status === "submitting" ? "Saving..." : "Save"}
      </button>
      {status === "error" && <span className="text-red-400">Something went wrong</span>}
    </div>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Revalidation</h2>
        <p className="text-neutral-400 mb-4">
          The <code className="text-sky-400">revalidate</code> option on{" "}
          <code className="text-sky-400">data</code>, <code className="text-sky-400">view</code>,
          and <code className="text-sky-400">redirect</code> results takes an array of path
          patterns. After the result is applied, Litz re-fetches any currently mounted routes or
          resources whose paths match.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, redirect, server, withHeaders } from "litz";

export const route = defineRoute("/projects/:id/settings", {
  component: ProjectSettingsPage,
  action: server(async ({ request, params }) => {
    const formData = await request.formData();
    const name = String(formData.get("name") ?? "").trim();

    await db.projects.update(params.id, { name });

    return withHeaders(
      redirect(\`/projects/\${params.id}\`, {
        revalidate: ["/projects/:id", "/projects"],
      }),
      { "X-Toast": "Project updated" },
    );
  }),
});`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          Revalidation targets routes and resources uniformly by path pattern, so{" "}
          <code className="text-sky-400">{`"/projects/:id"`}</code> revalidates both a route at that
          path and any resource mounted with matching params.
        </p>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/navigation"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Navigation
        </Link>
        <Link href="/docs/forms" className="text-sky-500 hover:text-sky-400 transition-colors">
          Forms &rarr;
        </Link>
      </div>
    </>
  );
}
