import { data, defineRoute, error, invalid, server } from "litzjs";
import * as React from "react";

import { appendQuickProject, delay } from "../../data/state";

export const route = defineRoute("/features/submit-imperative", {
  component: QuickCreatePage,
  action: server(async ({ request }) => {
    await delay(400);
    const formData = await request.formData();
    const nameValue = formData.get("name");
    const name = typeof nameValue === "string" ? nameValue.trim() : "";

    if (!name) {
      return invalid({
        fields: {
          name: "Required",
        },
      });
    }

    if (name.toLowerCase() === "error") {
      return error(422, "Project name 'error' is reserved");
    }

    return data({
      project: appendQuickProject(name),
    });
  }),
});

function QuickCreatePage() {
  const [name, setName] = React.useState("");
  const [optimisticName, setOptimisticName] = React.useState<string | null>(null);
  const action = route.useActionResult();
  const actionData = route.useActionData();
  const actionError = route.useActionError();
  const mergedData = route.useData();
  const mergedError = route.useError();
  const pending = route.usePending();
  const submit = route.useSubmit();

  return (
    <>
      <title>Imperative Submit | Litz RSC Smoke</title>
      <main>
        <h1>Imperative Submit</h1>
        <p>This route demonstrates a manual optimistic update before the action resolves.</p>
        <div>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Project name"
          />
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              const nextName = name.trim();

              if (nextName) {
                setOptimisticName(nextName);
              }

              try {
                await submit({ name });

                if (nextName) {
                  setName("");
                }
              } finally {
                setOptimisticName(null);
              }
            }}
          >
            {pending ? "Creating..." : "Create"}
          </button>
        </div>

        {optimisticName ? <p>Optimistic project: {optimisticName} (sending...)</p> : null}
        {action?.kind === "invalid" ? <p>{action.fields?.name}</p> : null}
        {actionError ? <p>Action error: {actionError.message}</p> : null}
        {mergedError ? <p>Merged error: {mergedError.message}</p> : null}
        {actionData ? <p>Action data project: {actionData.project.name}</p> : null}
        {mergedData ? <p>Merged data project: {mergedData.project.name}</p> : null}
        <p>Tip: submit the name "error" to trigger the explicit action error branch.</p>
      </main>
    </>
  );
}
