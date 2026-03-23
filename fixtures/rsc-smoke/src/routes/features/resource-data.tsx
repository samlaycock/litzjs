import { defineRoute } from "volt";

import { resource as summaryCard } from "../resources/summary-card";

export const route = defineRoute("/features/resource-data", {
  component: ResourceDataPage,
});

function ResourceDataPage() {
  const result = summaryCard.useLoader({
    params: { id: "alpha" },
    search: { mode: "compact" },
  });

  if (result.kind !== "data") {
    return (
      <>
        <title>Resource Data | Volt RSC Smoke</title>
        <main>Loading resource data...</main>
      </>
    );
  }

  return (
    <>
      <title>Resource Data | Volt RSC Smoke</title>
      <main>
        <h1>Resource Data</h1>
        <p>Id: {result.data.id}</p>
        <p>Title: {result.data.title}</p>
        <p>Mode: {result.data.mode}</p>
      </main>
    </>
  );
}
