import { data, defineRoute, server } from "volt";

export const route = defineRoute("/features/loader-data", {
  component: MePage,
  loader: server(async () => {
    return data({
      user: {
        id: "user_123",
        name: "Volt Tester",
        email: "tester@example.com",
      },
    });
  }),
});

function MePage() {
  const result = route.useLoaderResult();

  return (
    <main>
      <h1>Data Loader Route</h1>
      <p>Name: {result.data.user.name}</p>
      <p>Email: {result.data.user.email}</p>
      <p>Status: {result.status}</p>
    </main>
  );
}
