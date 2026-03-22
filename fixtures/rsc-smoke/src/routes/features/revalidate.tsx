import { data, defineRoute, server } from "volt";

import { incrementRevalidateCount, revalidateCount } from "../../data/state";

export const route = defineRoute("/features/revalidate", {
  component: RevalidatePage,
  loader: server(async () => {
    return data({
      count: revalidateCount,
    });
  }),
  action: server(async () => {
    incrementRevalidateCount();
    return data(
      {
        ok: true,
      },
      {
        revalidate: ["/features/revalidate"],
      },
    );
  }),
});

function RevalidatePage() {
  const loader = route.useLoaderResult();
  const status = route.useStatus();

  return (
    <main>
      <h1>Revalidation Demo</h1>
      <p>Status: {status}</p>
      <p>Count: {String(loader.data.count)}</p>
      <route.Form>
        <button type="submit">Increment and revalidate</button>
      </route.Form>
    </main>
  );
}
