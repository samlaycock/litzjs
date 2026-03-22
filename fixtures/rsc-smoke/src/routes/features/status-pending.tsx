import { data, defineRoute, server } from "volt";

import { delay } from "../../data/state";

let saveCount = 0;

export const route = defineRoute("/features/status-pending", {
  component: StatusPage,
  loader: server(async () => {
    await delay(400);
    return data({
      loadedAt: new Date().toISOString(),
    });
  }),
  action: server(async () => {
    await delay(500);
    saveCount += 1;
    return data({
      saves: saveCount,
    });
  }),
  pendingComponent: StatusPending,
});

function StatusPage() {
  const loader = route.useLoaderResult();
  const action = route.useActionResult();
  const status = route.useStatus();
  const pending = route.usePending();
  const retry = route.useRetry();
  const reload = route.useReload();

  if (loader.kind !== "data") {
    return <main>Unexpected status loader result.</main>;
  }

  return (
    <main>
      <h1>Status Demo</h1>
      <p>Status: {status}</p>
      <p>Pending: {pending ? "yes" : "no"}</p>
      <p>Loaded at: {loader.data.loadedAt}</p>
      <p>Saves: {action?.kind === "data" ? String(action.data.saves) : "0"}</p>

      <div>
        <button type="button" onClick={() => retry()}>
          Retry
        </button>
        <button type="button" onClick={() => reload()}>
          Reload
        </button>
      </div>

      <route.Form>
        <button type="submit">Submit slow action</button>
      </route.Form>
    </main>
  );
}

function StatusPending() {
  return <main>Loading status route...</main>;
}
