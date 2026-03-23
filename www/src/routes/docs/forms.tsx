import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/forms", {
  component: DocsFormsPage,
});

function DocsFormsPage() {
  return (
    <>
      <title>Forms | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Forms</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Submit data with route.Form, validate with invalid(), and build responsive form UIs with
        React 19.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">route.Form</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">route.Form</code> is bound to the current route's action.
          You don't need to specify <code className="text-sky-400">action</code> or{" "}
          <code className="text-sky-400">method</code> — Litz handles it for you.
        </p>
        <p className="text-neutral-400 mb-4">
          Because it uses React 19 form actions under the hood,{" "}
          <code className="text-sky-400">useFormStatus()</code> works in any descendant component.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, server } from "litzjs";
import { useFormStatus } from "react-dom";

export const route = defineRoute("/contact", {
  component: ContactPage,
  action: server(async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get("name");
    // save to database...
    return data({ success: true });
  }),
});

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Sending..." : "Send"}
    </button>
  );
}

function ContactPage() {
  return (
    <route.Form>
      <input name="name" placeholder="Your name" required />
      <SubmitButton />
    </route.Form>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Form validation with invalid()
        </h2>
        <p className="text-neutral-400 mb-4">
          Return{" "}
          <code className="text-sky-400">
            {'invalid({ fields: { name: "Name is required" }, formError: "..." })'}
          </code>{" "}
          from your action to signal validation failures. Read the result in your component with{" "}
          <code className="text-sky-400">route.useInvalid()</code>.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, invalid, server } from "litzjs";

export const route = defineRoute("/register", {
  component: RegisterPage,
  action: server(async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get("name");
    const email = formData.get("email");

    if (!name || !email) {
      return invalid({
        fields: {
          ...(!name ? { name: "Name is required" } : {}),
          ...(!email ? { email: "Email is required" } : {}),
        },
        formError: "Please fill in all required fields.",
      });
    }

    // save user...
    return data({ success: true });
  }),
});

function RegisterPage() {
  const invalid = route.useInvalid();

  return (
    <route.Form>
      {invalid?.formError && <p className="error">{invalid.formError}</p>}

      <label>
        Name
        <input name="name" />
        {invalid?.fields?.name && <span className="error">{invalid.fields.name}</span>}
      </label>

      <label>
        Email
        <input name="email" type="email" />
        {invalid?.fields?.email && <span className="error">{invalid.fields.email}</span>}
      </label>

      <button type="submit">Register</button>
    </route.Form>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Imperative submission with useSubmit()
        </h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">route.useSubmit(options?)</code> lets you submit without a
          form element. It accepts <code className="text-sky-400">FormData</code> or a plain object
          — Litz serializes plain objects to FormData automatically.
        </p>
        <p className="text-neutral-400 mb-4">
          SubmitOptions:{" "}
          <code className="text-sky-400">
            {"{ onBeforeSubmit?, onSuccess?, onError?, replace?, revalidate? }"}
          </code>
        </p>
        <CodeBlock
          language="tsx"
          code={`function QuickActions() {
  const submit = route.useSubmit({
    onSuccess: () => console.log("Saved!"),
  });

  return (
    <button onClick={() => void submit({ action: "archive", id: "42" })}>
      Archive
    </button>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Form props</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">RouteFormProps</code> extends the standard HTML form
          attributes (minus <code className="text-sky-400">action</code> and{" "}
          <code className="text-sky-400">method</code>) and adds:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">replace?: boolean</code> — replace the current history
            entry instead of pushing
          </li>
          <li>
            <code className="text-sky-400">revalidate?: boolean | string[]</code> — control which
            loaders revalidate after submission
          </li>
        </ul>
        <CodeBlock
          language="tsx"
          code={`<route.Form revalidate={["/dashboard", "/notifications"]}>
  <input name="status" value="done" type="hidden" />
  <button type="submit">Mark as done</button>
</route.Form>`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Pending state</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">route.usePending()</code> returns a boolean that is{" "}
          <code className="text-sky-400">true</code> while a submission is in flight.{" "}
          <code className="text-sky-400">useFormStatus()</code> from{" "}
          <code className="text-sky-400">react-dom</code> also works inside{" "}
          <code className="text-sky-400">route.Form</code> children.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? "Submitting..." : "Submit"}
    </button>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Resources have forms too</h2>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">resource.Form</code> and{" "}
          <code className="text-sky-400">resource.useSubmit()</code> work the same way as their
          route counterparts. They are scoped to the resource instance, so multiple instances on the
          same page each manage their own submission state independently.
        </p>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/loaders-and-actions"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Loaders &amp; Actions
        </Link>
        <Link href="/docs/resources" className="text-sky-500 hover:text-sky-400 transition-colors">
          Resources &rarr;
        </Link>
      </div>
    </>
  );
}
