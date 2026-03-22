import * as React from "react";
import { data, defineRoute, invalid, server } from "volt";

import { appendQuickProject } from "../../data/state";

export const route = defineRoute("/features/submit-imperative", {
  component: QuickCreatePage,
  action: server(async ({ request }) => {
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
  const action = route.useActionResult();
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
      <div>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
        />
        <button
          type="button"
          onClick={async () => {
            await submit({ name });
            setName("");
          }}
        >
          Create
        </button>
      </div>

      {action?.kind === "invalid" ? <p>{action.fields?.name}</p> : null}
      {lastSuccess ? <p>Created project: {lastSuccess}</p> : null}
    </main>
  );
}
