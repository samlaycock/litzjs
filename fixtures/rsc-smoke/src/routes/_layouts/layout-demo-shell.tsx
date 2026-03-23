import { data, defineLayout, server } from "litz";

import { layout as featuresShell } from "./features-shell";

export const layout = defineLayout("/layouts/features/layouts", {
  component: LayoutDemoShell,
  layout: featuresShell,
  loader: server(async () =>
    data({
      title: "Nested Layout Demo",
    }),
  ),
});

function LayoutDemoShell({ children }: { children: React.ReactNode }) {
  const data = layout.useLoaderData();

  return (
    <section>
      <p>Layout: {data?.title ?? "(loading)"}</p>
      {children}
    </section>
  );
}
