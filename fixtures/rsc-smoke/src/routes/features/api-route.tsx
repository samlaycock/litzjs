import * as React from "react";
import { defineRoute } from "volt";

import { api as healthApi } from "../api/health";

export const route = defineRoute("/features/api-route", {
  component: ApiDemoPage,
});

function ApiDemoPage() {
  const request = React.useMemo(() => loadHealth(), []);

  return (
    <>
      <title>API Route | Volt RSC Smoke</title>
      <main>
        <h1>API Route Demo</h1>
        <React.Suspense fallback={<p>Loading...</p>}>
          <ApiHealthResult request={request} />
        </React.Suspense>
      </main>
    </>
  );
}

function ApiHealthResult(props: { request: Promise<{ ok: boolean; runtime: string }> }) {
  const data = React.use(props.request);

  return (
    <p>
      {data.ok ? "ok" : "not ok"} via {data.runtime}
    </p>
  );
}

async function loadHealth(): Promise<{ ok: boolean; runtime: string }> {
  const response = await healthApi.fetch();
  return response.json() as Promise<{ ok: boolean; runtime: string }>;
}
