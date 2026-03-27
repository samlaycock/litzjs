import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/error-handling", {
  component: DocsErrorHandlingPage,
});

function DocsErrorHandlingPage() {
  return (
    <>
      <title>Error Handling | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Error Handling</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Handle expected errors with error(), catch faults with errorBoundary, and read error state
        with hooks.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">The error() result</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">error(status, message, options?)</code> creates an
          application-level error. Options include{" "}
          <code className="text-sky-400">{"{ headers?, code?, data? }"}</code>.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, error, server } from "litzjs";

export const route = defineRoute("/posts/:id", {
  component: PostPage,
  loader: server(async ({ params }) => {
    const post = await db.posts.find(params.id);
    if (!post) {
      return error(404, "Post not found", { code: "POST_NOT_FOUND" });
    }
    return data({ post });
  }),
  action: server(async ({ request, context }) => {
    if (!context.userId) {
      return error(403, "You must be logged in to comment", {
        code: "AUTH_REQUIRED",
      });
    }
    // save comment...
    return data({ success: true });
  }),
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Error vs Fault</h2>
        <p className="text-neutral-400 mb-4">
          An <code className="text-sky-400">error</code> is an expected application-level failure —
          you returned <code className="text-sky-400">error()</code> explicitly. A{" "}
          <code className="text-sky-400">fault</code> is an unexpected runtime failure. You can
          either return <code className="text-sky-400">fault()</code> explicitly or let an exception
          escape your handler's control flow.
        </p>
        <p className="text-neutral-400 mb-4">
          Both are normalized into a <code className="text-sky-400">RouteErrorLike</code> shape:
        </p>
        <CodeBlock
          language="tsx"
          code={`// error — you returned error() explicitly
return error(404, "Post not found", { code: "POST_NOT_FOUND" });

// fault — an unexpected failure
return fault(500, "Internal server error", { digest: "abc123" });`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">errorBoundary</h2>
        <p className="text-neutral-400 mb-4">
          Routes and layouts accept an{" "}
          <code className="text-sky-400">
            {"errorBoundary: React.ComponentType<{ error: RouteFaultLike }>"}
          </code>{" "}
          option. It renders only when the loader or action faults.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { defineRoute, server } from "litzjs";

function PostFault({ error }: { error: RouteFaultLike }) {
  return <p>Something went wrong. Please try again later.</p>;
}

export const route = defineRoute("/posts/:id", {
  component: PostPage,
  errorBoundary: PostFault,
  loader: server(async () => {
    throw new Error("Database unavailable");
  }),
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Initial Loading</h2>
        <p className="text-neutral-400 mb-4">
          Routes and layouts render immediately on first mount. While a loader is still pending,
          data, view, and error hooks stay <code className="text-sky-400">null</code> and{" "}
          <code className="text-sky-400">route.usePending()</code> stays{" "}
          <code className="text-sky-400">true</code>.
        </p>
        <CodeBlock
          language="tsx"
          code={`function PostPage() {
  const post = route.useLoaderData();
  const pending = route.usePending();

  if (pending && !post) {
    return <p>Loading post...</p>;
  }

  return <h1>{post?.title ?? "Untitled"}</h1>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Error hooks</h2>
        <p className="text-neutral-400 mb-4">
          Litz provides hooks to read error state inside your components:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">route.useLoaderError()</code> — explicit loader error()
            only
          </li>
          <li>
            <code className="text-sky-400">route.useActionError()</code> — explicit action error()
            only
          </li>
          <li>
            <code className="text-sky-400">route.useError()</code> — latest settled explicit error
            from loader or action
          </li>
          <li>
            <code className="text-sky-400">route.useStatus()</code> — returns{" "}
            <code className="text-sky-400">'error'</code> when the active route/layout chain is in
            an error state
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          Status is page-scoped, but <code className="text-sky-400">route.useError()</code> is
          route-scoped. If a parent layout has an explicit loader error,{" "}
          <code className="text-sky-400">route.useStatus()</code> can be{" "}
          <code className="text-sky-400">'error'</code> while{" "}
          <code className="text-sky-400">route.useError()</code> stays{" "}
          <code className="text-sky-400">null</code>.
        </p>
        <CodeBlock
          language="tsx"
          code={`function PostPage() {
  const data = route.useLoaderData();
  const loaderError = route.useLoaderError();
  const actionError = route.useActionError();
  const error = route.useError();
  const status = route.useStatus();

  if (loaderError) {
    return <p>Loader error {loaderError.status}: {loaderError.message}</p>;
  }

  return (
    <div>
      {actionError && <p className="text-red-400">{actionError.message}</p>}
      {status === "error" && error ? <p>Latest error: {error.message}</p> : null}
      <h1>{data.post.title}</h1>
    </div>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Reload</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">route.useReload()</code> reloads the loader regardless of
          whether it is currently pending, idle, or in an explicit error state.
        </p>
        <CodeBlock
          language="tsx"
          code={`function PostPage() {
  const reload = route.useReload();
  const error = route.useError();

  return (
    <div>
      {error ? <p>Error: {error.message}</p> : null}
      <button onClick={reload}>Reload</button>
    </div>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Offline support</h2>
        <p className="text-neutral-400 mb-4">
          Routes accept an <code className="text-sky-400">offline</code> option for handling network
          failures gracefully:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">fallbackComponent</code> — renders when offline with no
            cached data
          </li>
          <li>
            <code className="text-sky-400">preserveStaleOnFailure</code> — keeps stale data visible
            when a reload fails
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          When stale data is being preserved,{" "}
          <code className="text-sky-400">route.useStatus()</code> returns{" "}
          <code className="text-sky-400">'offline-stale'</code> so you can show a banner or
          indicator.
        </p>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/middleware"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Middleware
        </Link>
        <Link
          href="/docs/authentication"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          Authentication &rarr;
        </Link>
      </div>
    </>
  );
}
