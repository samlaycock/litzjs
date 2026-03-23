import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/typescript", {
  component: DocsTypeScriptPage,
});

function DocsTypeScriptPage() {
  return (
    <>
      <title>TypeScript | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">TypeScript</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Litz infers types from your route paths, loader returns, and action returns &mdash; no
        manual type annotations needed.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Path parameter inference</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">{'defineRoute("/users/:id", ...)'}</code> automatically
          types <code className="text-sky-400">params</code> as{" "}
          <code className="text-sky-400">{"{ id: string }"}</code>. This works in loaders, actions,
          and <code className="text-sky-400">useParams()</code>.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, server } from "litzjs";

export const route = defineRoute("/users/:id", {
  component: UserProfile,
  loader: server(async ({ params }) => {
    // params.id is typed as string
    const user = await getUser(params.id);
    return data({ user });
  }),
});

function UserProfile() {
  // Also typed — params.id is string
  const params = route.useParams();
  const result = route.useLoaderData();

  if (!result) return null;
  return <h1>{result.user.name}</h1>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Loader data inference</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">route.useLoaderData()</code> infers the type from what your
          loader returns with <code className="text-sky-400">data()</code>. No generics required.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, server } from "litzjs";

export const route = defineRoute("/users/:id", {
  component: UserProfile,
  loader: server(async ({ params }) => {
    const user = await getUser(params.id);
    // data() preserves the shape
    return data({ user: { id: user.id, name: user.name } });
  }),
});

function UserProfile() {
  // Typed as { user: { id: string; name: string } } | null
  const result = route.useLoaderData();

  if (!result) return null;
  return <p>{result.user.name}</p>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Action result inference</h2>
        <p className="text-neutral-400 mb-4">
          Each action result hook infers its type from the corresponding return:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">route.useActionData()</code> infers from{" "}
            <code className="text-sky-400">data()</code> returns
          </li>
          <li>
            <code className="text-sky-400">route.useInvalid()</code> infers from{" "}
            <code className="text-sky-400">invalid()</code> returns
          </li>
          <li>
            <code className="text-sky-400">route.useActionError()</code> infers from{" "}
            <code className="text-sky-400">error()</code> returns
          </li>
        </ul>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, invalid, server } from "litzjs";

export const route = defineRoute("/users/:id/edit", {
  component: EditUser,
  action: server(async ({ request }) => {
    const formData = await request.formData();
    const name = String(formData.get("name") ?? "").trim();

    if (!name) {
      // useInvalid() will type this as { fields: { name: string } }
      return invalid({ fields: { name: "Name is required" } });
    }

    const user = await updateUser(name);
    // useActionData() will type this as { user: User }
    return data({ user });
  }),
});

function EditUser() {
  // Typed as { fields: { name: string } } | null
  const validation = route.useInvalid();
  // Typed as { user: User } | null
  const result = route.useActionData();

  return (
    <route.Form>
      {validation?.fields?.name && <p className="text-red-400">{validation.fields.name}</p>}
      <input name="name" />
      <button type="submit">Save</button>
    </route.Form>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Typed context</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">{"createServer<TContext>({ createContext })"}</code>{" "}
          establishes the context type, which flows through to all handlers and middleware via
          generics.
        </p>
        <CodeBlock
          language="ts"
          code={`import { createServer } from "litzjs/server";

type AppContext = {
  userId: string | null;
  locale: string;
};

export default createServer<AppContext>({
  createContext(request): AppContext {
    const token = request.headers.get("authorization");
    const locale = request.headers.get("accept-language") ?? "en";
    return {
      userId: token ? verifyToken(token) : null,
      locale,
    };
  },
});`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          In any loader or action, <code className="text-sky-400">context</code> is typed as{" "}
          <code className="text-sky-400">AppContext</code>:
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, server } from "litzjs";

export const route = defineRoute("/settings", {
  component: SettingsPage,
  loader: server(async ({ context }) => {
    // context.userId is string | null
    // context.locale is string
    return data({ locale: context.locale });
  }),
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Resource types</h2>
        <p className="text-neutral-400 mb-4">
          The same inference rules apply to resources.{" "}
          <code className="text-sky-400">resource.useLoaderData()</code> and{" "}
          <code className="text-sky-400">resource.useActionData()</code> are fully typed, and path
          params are inferred from resource paths too.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineResource, server } from "litzjs";

export const resource = defineResource("/resource/user/:id", {
  component: UserCard,
  loader: server(async ({ params }) => {
    // params.id is typed as string
    const user = await getUser(params.id);
    return data({ user });
  }),
});

function UserCard() {
  // Typed as { user: User } | null
  const result = resource.useLoaderData();

  if (!result) return null;
  return <p>{result.user.name}</p>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Tips</h2>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            Use the <code className="text-sky-400">server()</code> wrapper for best type inference
            in loaders and actions.
          </li>
          <li>
            The framework's generics handle most typing automatically &mdash; you rarely need
            explicit type annotations.
          </li>
          <li>
            Path parameters are always typed as <code className="text-sky-400">string</code>. Parse
            them to numbers or other types inside your handlers.
          </li>
          <li>
            If you need to share types between server and client, export a type alias from the route
            module.
          </li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/view-responses"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; View Responses
        </Link>
        <Link href="/docs/testing" className="text-sky-500 hover:text-sky-400 transition-colors">
          Testing &rarr;
        </Link>
      </div>
    </>
  );
}
