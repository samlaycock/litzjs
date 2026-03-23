import { data, defineLayout, server } from "volt";

export const layout = defineLayout("/layouts/features", {
  component: FeaturesShell,
  loader: server(async () =>
    data({
      section: "Feature Examples",
    }),
  ),
});

function FeaturesShell({ children }: { children: React.ReactNode }) {
  const result = layout.useLoaderResult();

  if (result.kind !== "data") {
    return null;
  }

  return (
    <section>
      <p>Section: {result.data.section}</p>
      {children}
    </section>
  );
}
