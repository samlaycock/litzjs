import { defineRoute } from "volt";

import { resource as summaryCard } from "../resources/summary-card";

export const route = defineRoute("/features/resource-data", {
  component: ResourceDataPage,
});

function ResourceDataPage() {
  return (
    <>
      <title>Resource Data | Volt RSC Smoke</title>
      <main>
        <h1>Resource Data</h1>
        <summaryCard.Component params={{ id: "alpha" }} search={{ mode: "compact" }} />
      </main>
    </>
  );
}
