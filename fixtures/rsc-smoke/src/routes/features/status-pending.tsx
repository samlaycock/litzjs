import { useFormStatus } from "react-dom";
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
  action: server(async ({ request }) => {
    await delay(500);
    const formData = await request.formData();
    const noteValue = formData.get("note");
    const note = typeof noteValue === "string" ? noteValue.trim() : "";
    saveCount += 1;
    return data({
      saves: saveCount,
      note: note || "(empty)",
    });
  }),
  pendingComponent: StatusPending,
});

function StatusPage() {
  const loader = route.useLoaderResult();
  const action = route.useActionResult();
  const status = route.useStatus();
  const pending = route.usePending();
  const submitting = status === "submitting";
  const retry = route.useRetry();
  const reload = route.useReload();

  if (loader.kind !== "data") {
    return (
      <>
        <title>Status Pending | Volt RSC Smoke</title>
        <main>Unexpected status loader result.</main>
      </>
    );
  }

  return (
    <>
      <title>Status Pending | Volt RSC Smoke</title>
      <main>
        <h1>Status Demo</h1>
        <p>Status: {status}</p>
        <p>Pending: {pending ? "yes" : "no"}</p>
        <p>Loaded at: {loader.data.loadedAt}</p>
        <p>Saves: {action?.kind === "data" ? String(action.data.saves) : "0"}</p>
        <p>Last note: {action?.kind === "data" ? action.data.note : "(none)"}</p>

        <div>
          <button type="button" onClick={() => retry()}>
            Retry
          </button>
          <button type="button" onClick={() => reload()}>
            Reload
          </button>
        </div>

        <route.Form>
          <StatusFormFields submitting={submitting} />
        </route.Form>
      </main>
    </>
  );
}

function StatusFormFields(props: { submitting: boolean }) {
  const { pending, data } = useFormStatus();
  const pendingNote = data?.get("note");

  return (
    <>
      <input name="note" placeholder="Describe this save" disabled={pending} />
      <button type="submit" disabled={props.submitting || pending}>
        {pending ? "Submitting..." : "Submit slow action"}
      </button>
      <p>useFormStatus pending: {pending ? "yes" : "no"}</p>
      <p>
        useFormStatus data:{" "}
        {typeof pendingNote === "string" && pendingNote ? pendingNote : "(idle)"}
      </p>
    </>
  );
}

function StatusPending() {
  return (
    <>
      <title>Status Pending | Volt RSC Smoke</title>
      <main>Loading status route...</main>
    </>
  );
}
