import * as React from "react";
import { defineRoute, server, view } from "volt";

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

  return (
    <main>
      <h1>View Loader Route</h1>
      <p>Kind: {result.kind}</p>
      <React.Suspense fallback={<p>Streaming reports...</p>}>{result.render()}</React.Suspense>
    </main>
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
