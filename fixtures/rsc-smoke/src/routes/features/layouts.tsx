import { data, defineRoute, server, useMatches } from "volt";

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
  const result = route.useLoaderResult();
  const matches = useMatches();

  if (result.kind !== "data") {
    return null;
  }

  return (
    <>
      <title>Layouts | Volt RSC Smoke</title>
      <main>
        <h1>Feature: Layouts</h1>
        <p>{result.data.message}</p>
        <p>Matches: {matches.map((match) => match.path).join(" -> ")}</p>
      </main>
    </>
  );
}
