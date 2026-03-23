import { defineRoute } from "litzjs";
import * as React from "react";

import { resource as feedPanel } from "../resources/feed-panel";

export const route = defineRoute("/features/resource-actions", {
  component: ResourceActionsPage,
});

function ResourceActionsPage() {
  return (
    <>
      <title>Resource Actions | Litz RSC Smoke</title>
      <main>
        <h1>Resource Action Route</h1>
        <React.Suspense fallback={<p>Loading resource action panel...</p>}>
          <feedPanel.Component params={{ id: "team" }} />
        </React.Suspense>
      </main>
    </>
  );
}
