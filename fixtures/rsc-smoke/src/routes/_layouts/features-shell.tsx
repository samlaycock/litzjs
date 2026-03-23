import { data, defineLayout, server } from "litzjs";

export const layout = defineLayout("/layouts/features", {
  component: FeaturesShell,
  loader: server(async () =>
    data({
      section: "Feature Examples",
    }),
  ),
});

function FeaturesShell({ children }: { children: React.ReactNode }) {
  const data = layout.useLoaderData();

  return (
    <section>
      <p>Section: {data?.section ?? "(loading)"}</p>
      {children}
    </section>
  );
}
