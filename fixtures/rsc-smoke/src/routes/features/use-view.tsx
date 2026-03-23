import { defineRoute, server, view } from "litzjs";
import * as React from "react";

export const route = defineRoute("/features/use-view", {
  component: UseViewPage,
  loader: server(async () => view(<UseViewPanel />)),
});

function UseViewPage() {
  const node = route.useView();

  return (
    <>
      <title>useView | Litz RSC Smoke</title>
      <main>
        <h1>useView Example</h1>
        <React.Suspense fallback={<p>Streaming useView fragment...</p>}>{node}</React.Suspense>
      </main>
    </>
  );
}

function UseViewPanel() {
  return <section>This fragment came from route.useView().</section>;
}
