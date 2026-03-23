import { defineRoute, server, view } from "litz";
import * as React from "react";

import { ClientCounter } from "../../components/client-counter";
import { nextReportsLoadCount } from "../../data/state";

export const route = defineRoute("/features/loader-view", {
  component: ReportsPage,
  loader: server(async () => {
    return view(<ReportsPanel loads={nextReportsLoadCount()} />);
  }),
});

function ReportsPage() {
  const result = route.useLoaderResult();
  const view = route.useLoaderView();

  return (
    <>
      <title>Loader View | Litz RSC Smoke</title>
      <main>
        <h1>View Loader Route</h1>
        <p>Kind: {result?.kind ?? "(pending)"}</p>
        <React.Suspense fallback={<p>Streaming reports...</p>}>{view}</React.Suspense>
      </main>
    </>
  );
}

function ReportsPanel(props: { loads: number }) {
  return (
    <section>
      <p>This panel came from a route loader using view().</p>
      <p>Loader runs: {props.loads}</p>
      <ClientCounter label="Report clicks" />
    </section>
  );
}
