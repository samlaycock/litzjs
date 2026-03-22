import * as React from "react";
import { data, defineRoute, invalid, server } from "volt";

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

    return data({
      project: appendQuickProject(name),
    });
  }),
});

function QuickCreatePage() {
  const [name, setName] = React.useState("");
  const [lastSuccess, setLastSuccess] = React.useState<string | null>(null);
  const [optimisticName, setOptimisticName] = React.useState<string | null>(null);
  const action = route.useActionResult();
  const pending = route.usePending();
  const submit = route.useSubmit({
    onSuccess(result) {
      if (result?.kind === "data") {
        setLastSuccess(result.data.project.name);
      }
    },
  });

  return (
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
      {lastSuccess ? <p>Created project: {lastSuccess}</p> : null}
    </main>
  );
}
