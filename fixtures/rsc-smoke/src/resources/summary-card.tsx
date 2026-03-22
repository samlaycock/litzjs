import { data, defineResource, server, type DataResult } from "volt";

type SummaryCardData = {
  id: string;
  title: string;
  mode: string;
};

export const resource = defineResource("/resource/summary/:id", {
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
