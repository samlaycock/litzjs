import { data, defineResource, server, type DataResult } from "litzjs";

type SummaryCardData = {
  id: string;
  title: string;
  mode: string;
};

export const resource = defineResource("/resource/summary/:id", {
  component: function SummaryCardResource() {
    const data = resource.useData();

    if (!data) {
      return <p>Loading summary...</p>;
    }

    return (
      <article>
        <p>Id: {data.id}</p>
        <p>Title: {data.title}</p>
        <p>Mode: {data.mode}</p>
      </article>
    );
  },

  loader: server<unknown, DataResult<SummaryCardData>, "/resource/summary/:id">(
    async ({ params, request }) => {
      const url = new URL(request.url);
      const mode = url.searchParams.get("mode") ?? "full";

      return data({
        id: params.id,
        title: `Summary for ${params.id}`,
        mode,
      });
    },
  ),
});
