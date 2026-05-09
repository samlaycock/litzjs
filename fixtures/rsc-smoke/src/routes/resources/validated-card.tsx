import { data, defineResource, server } from "litzjs";

export const resource = defineResource("/resource/validated-card/:id", {
  component: ValidatedCard,
  input: {
    params: (params) => {
      return {
        id: params.id.toUpperCase(),
      };
    },
    search: (search) => {
      return {
        mode: search.get("mode") ?? "summary",
      };
    },
  },
  loader: server<unknown, { id: string; mode: string }, "/resource/validated-card/:id">(
    async ({ input }) => {
      return data({
        id: input.params.id,
        mode: input.search.mode,
      });
    },
  ),
});

function ValidatedCard() {
  const loaderData = resource.useLoaderData();

  return (
    <aside>
      <h2>Validated Resource</h2>
      <p>
        {loaderData?.id ?? "(loading)"} in {loaderData?.mode ?? "(loading)"} mode
      </p>
    </aside>
  );
}
