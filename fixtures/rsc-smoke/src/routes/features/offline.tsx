import { data, defineRoute, server } from "litzjs";

export const route = defineRoute("/features/offline", {
  component: OfflinePage,
  loader: server(async () => {
    return data({ status: "online" });
  }),
  offline: {
    fallbackComponent: OfflineFallback,
    preserveStaleOnFailure: true,
  },
});

function OfflinePage() {
  const data = route.useLoaderData();
  const status = route.useStatus();

  return (
    <>
      <title>Offline Options | Litz RSC Smoke</title>
      <main>
        <h1>Offline Options</h1>
        <p>Loader status: {data?.status ?? "(loading)"}</p>
        <p>Route status: {status}</p>
      </main>
    </>
  );
}

function OfflineFallback() {
  return (
    <main>
      <h1>Offline Fallback</h1>
    </main>
  );
}
