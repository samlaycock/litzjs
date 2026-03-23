import { defineRoute } from "litz";
import { Link } from "litz/client";

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
        Handle expected errors with error(), catch faults with errorComponent, and read error state
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
          code={`import { data, defineRoute, error, server } from "litz";

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
          <code className="text-sky-400">fault</code> is an unexpected runtime failure — an
          exception escaped your handler's control flow.
        </p>
        <p className="text-neutral-400 mb-4">
          Both are normalized into a <code className="text-sky-400">RouteErrorLike</code> shape:
        </p>
        <CodeBlock
          language="tsx"
          code={`// error — you returned error() explicitly
{ kind: "error", status: 404, message: "Post not found", code: "POST_NOT_FOUND" }

// fault — an unhandled exception
{ kind: "fault", status: 500, message: "Internal server error", digest: "abc123" }`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">errorComponent</h2>
        <p className="text-neutral-400 mb-4">
          Routes and layouts accept an{" "}
          <code className="text-sky-400">
            {"errorComponent: React.ComponentType<{ error: RouteErrorLike }>"}
          </code>{" "}
          option. It renders when the loader or action produces an error or fault.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { defineRoute, server, error, data } from "litz";

function PostError({ error }: { error: RouteErrorLike }) {
  if (error.kind === "error" && error.status === 404) {
    return <p>Post not found. It may have been deleted.</p>;
  }
  return <p>Something went wrong. Please try again later.</p>;
}

export const route = defineRoute("/posts/:id", {
  component: PostPage,
  errorComponent: PostError,
  loader: server(async ({ params }) => {
    const post = await db.posts.find(params.id);
    if (!post) return error(404, "Not found");
    return data({ post });
  }),
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">pendingComponent</h2>
        <p className="text-neutral-400 mb-4">
          Routes and layouts also accept a{" "}
          <code className="text-sky-400">pendingComponent: React.ComponentType</code> option. It
          renders on first load when no settled loader state exists yet. Once data arrives, it
          switches to the normal component.
        </p>
        <CodeBlock
          language="tsx"
          code={`function PostSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-neutral-800 rounded w-3/4 mb-4" />
      <div className="h-4 bg-neutral-800 rounded w-full mb-2" />
      <div className="h-4 bg-neutral-800 rounded w-5/6" />
    </div>
  );
}

export const route = defineRoute("/posts/:id", {
  component: PostPage,
  pendingComponent: PostSkeleton,
  errorComponent: PostError,
  loader: server(async ({ params }) => {
    const post = await db.posts.find(params.id);
    if (!post) return error(404, "Not found");
    return data({ post });
  }),
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Error hooks</h2>
        <p className="text-neutral-400 mb-4">
          Litz provides hooks to read error state inside your components:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">route.useError()</code> — latest settled error from
            loader or action
          </li>
          <li>
            <code className="text-sky-400">route.useActionError()</code> — explicit action error()
            only
          </li>
          <li>
            <code className="text-sky-400">route.useStatus()</code> — returns{" "}
            <code className="text-sky-400">'error'</code> when in error state
          </li>
        </ul>
        <CodeBlock
          language="tsx"
          code={`function PostPage() {
  const data = route.useLoaderData();
  const error = route.useError();
  const actionError = route.useActionError();
  const status = route.useStatus();

  if (status === "error" && error) {
    return <p>Error {error.status}: {error.message}</p>;
  }

  return (
    <div>
      {actionError && <p className="text-red-400">{actionError.message}</p>}
      <h1>{data.post.title}</h1>
    </div>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Retry and reload</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">route.useRetry()</code> retries the failed loader.{" "}
          <code className="text-sky-400">route.useReload()</code> reloads the loader regardless of
          whether it failed.
        </p>
        <CodeBlock
          language="tsx"
          code={`function PostError({ error }: { error: RouteErrorLike }) {
  const retry = route.useRetry();

  return (
    <div>
      <p>Error: {error.message}</p>
      <button onClick={retry}>Try again</button>
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
