import { data, defineLayout, server } from "volt";

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
  const result = layout.useLoaderResult();

  if (result.kind !== "data") {
    return null;
  }

  return (
    <section>
      <p>Layout: {result.data.title}</p>
      {children}
    </section>
  );
}
