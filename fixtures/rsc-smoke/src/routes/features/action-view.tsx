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
  const loaderView = route.useLoaderView();
  const actionView = route.useActionView();
  const invalidResult = route.useInvalid();
  const view = route.useView();

  return (
    <>
      <title>Action View | Volt RSC Smoke</title>
      <main>
        <h1>Action + View Route</h1>
        <p>This route demonstrates a server-backed form action with inline validation feedback.</p>

        <route.Form>
          <input name="name" placeholder="New project name" />
          {invalidResult ? <p role="alert">{invalidResult.fields?.name}</p> : null}
          <button type="submit">Create</button>
        </route.Form>

        <p>Initial loader view: {loaderView ? "ready" : "pending"}</p>
        <p>Most recent action view: {actionView ? "ready" : "none"}</p>
        <React.Suspense fallback={<p>Refreshing projects...</p>}>{view}</React.Suspense>
      </main>
    </>
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
