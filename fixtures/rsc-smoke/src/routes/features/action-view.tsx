import * as React from "react";
import { defineRoute, invalid, server, view } from "volt";

import { appendProject, projects } from "../../data/state";

export const route = defineRoute("/features/action-view", {
  component: ProjectsPage,

  loader: server(async () => {
    return view(<ProjectsList projects={projects} />);
  }),

  action: server(async ({ request }) => {
    const formData = await request.formData();
    const nameValue = formData.get("name");
    const name = typeof nameValue === "string" ? nameValue.trim() : "";

    if (!name) {
      return invalid({
        fields: {
          name: "Project name is required",
        },
      });
    }

    return view(<ProjectsList projects={appendProject(name)} />);
  }),
});

function ProjectsPage() {
  const loader = route.useLoaderResult();
  const action = route.useActionResult();

  return (
    <main>
      <h1>Action + View Route</h1>

      <route.Form>
        <input name="name" placeholder="New project name" />
        {action?.kind === "invalid" ? <p role="alert">{action.fields?.name}</p> : null}
        <button type="submit">Create</button>
      </route.Form>

      <React.Suspense fallback={<p>Refreshing projects...</p>}>{loader.render()}</React.Suspense>
    </main>
  );
}

function ProjectsList(props: { projects: Array<{ id: string; name: string }> }) {
  return (
    <ul>
      {props.projects.map((project) => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  );
}
