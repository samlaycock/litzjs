import { data, defineRoute, server } from "litz";

export const route = defineRoute("/features/loader-data", {
  component: MePage,
  loader: server(async () => {
    return data({
      user: {
        id: "user_123",
        name: "Litz Tester",
        email: "tester@example.com",
      },
    });
  }),
});

function MePage() {
  const user = route.useLoaderData();
  const status = route.useStatus();

  return (
    <>
      <title>Loader Data | Litz RSC Smoke</title>
      <main>
        <h1>Data Loader Route</h1>
        <p>Name: {user?.user.name ?? "(loading)"}</p>
        <p>Email: {user?.user.email ?? "(loading)"}</p>
        <p>Status: {status}</p>
      </main>
    </>
  );
}
