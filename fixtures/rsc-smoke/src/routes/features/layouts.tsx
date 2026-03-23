import { data, defineRoute, server, useMatches } from "litzjs";

import { layout as layoutDemoShell } from "../_layouts/layout-demo-shell";

export const route = defineRoute("/features/layouts", {
  component: LayoutsFeaturePage,
  layout: layoutDemoShell,
  loader: server(async () =>
    data({
      message: "Route content inside recursive layouts.",
    }),
  ),
});

function LayoutsFeaturePage() {
  const result = route.useLoaderData();
  const matches = useMatches();

  return (
    <>
      <title>Layouts | Litz RSC Smoke</title>
      <main>
        <h1>Feature: Layouts</h1>
        <p>{result?.message ?? "(loading)"}</p>
        <p>Matches: {matches.map((match) => match.path).join(" -> ")}</p>
      </main>
    </>
  );
}
