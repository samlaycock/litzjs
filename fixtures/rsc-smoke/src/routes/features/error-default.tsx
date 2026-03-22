import { defineRoute, error, server } from "volt";

export const route = defineRoute("/features/error-default", {
  component: BrokenDefaultPage,
  loader: server(async () => error(500, "Broken route with default fallback")),
});

function BrokenDefaultPage() {
  return (
    <>
      <title>Default Error | Volt RSC Smoke</title>
      <main>This should not render.</main>
    </>
  );
}
