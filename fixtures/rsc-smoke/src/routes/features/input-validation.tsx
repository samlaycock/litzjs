import { data, defineRoute, server } from "litzjs";

import { resource as validatedCard } from "../resources/validated-card";

export const route = defineRoute("/features/input-validation", {
  component: InputValidationPage,
  input: {
    headers: (headers) => {
      return {
        requestId: headers.get("x-fixture-request-id") ?? "missing",
      };
    },
    search: (search) => {
      return {
        tab: search.get("tab") ?? "default",
      };
    },
  },
  loader: server(async ({ input }) => {
    return data({
      requestId: input.headers.requestId,
      tab: input.search.tab,
    });
  }),
});

function InputValidationPage() {
  const data = route.useLoaderData();

  return (
    <>
      <title>Input Validation | Litz RSC Smoke</title>
      <main>
        <h1>Input Validation</h1>
        <p>Route tab: {data?.tab ?? "(loading)"}</p>
        <p>Request id: {data?.requestId ?? "(loading)"}</p>
        <validatedCard.Component params={{ id: "card" }} search={{ mode: "full" }} />
      </main>
    </>
  );
}
