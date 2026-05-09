import { defineRoute } from "litzjs";
import * as React from "react";

import { api as echoApi } from "../api/echo";
import { api as healthApi } from "../api/health";

export const route = defineRoute("/features/api-route", {
  component: ApiDemoPage,
});

function ApiDemoPage() {
  const request = React.useMemo(() => loadHealth(), []);
  const echoRequest = React.useMemo(
    () =>
      loadEcho().catch((error: unknown) => ({
        body: { source: error instanceof Error ? error.message : "unknown-error" },
        id: "ERROR",
        method: "ERROR",
        requestId: "ERROR",
        tab: "ERROR",
      })),
    [],
  );

  return (
    <>
      <title>API Route | Litz RSC Smoke</title>
      <main>
        <h1>API Route Demo</h1>
        <React.Suspense fallback={<p>Loading...</p>}>
          <ApiHealthResult request={request} />
        </React.Suspense>
        <React.Suspense fallback={<p>Loading echo...</p>}>
          <ApiEchoResult request={echoRequest} />
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

function ApiEchoResult(props: {
  request: Promise<{
    body: { source: string };
    id: string;
    method: string;
    requestId: string;
    tab: string;
  }>;
}) {
  const data = React.use(props.request);

  return (
    <p>
      {data.method} {data.id} {data.tab} {data.body.source} {data.requestId}
    </p>
  );
}

async function loadHealth(): Promise<{ ok: boolean; runtime: string }> {
  const response = await healthApi.fetch();
  return response.json() as Promise<{ ok: boolean; runtime: string }>;
}

async function loadEcho(): Promise<{
  body: { source: string };
  id: string;
  method: string;
  requestId: string;
  tab: string;
}> {
  const response = await echoApi.fetch({
    body: JSON.stringify({ source: "client-fetch" }),
    headers: {
      "content-type": "application/json",
      "x-fixture-request-id": "api-route-demo",
    },
    method: "POST",
    params: { id: "abc" },
    search: { tab: "details" },
  });

  return response.json() as Promise<{
    body: { source: string };
    id: string;
    method: string;
    requestId: string;
    tab: string;
  }>;
}
