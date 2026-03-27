import { defineRoute, fault, server } from "litzjs";

export const route = defineRoute("/features/error-default", {
  component: BrokenDefaultPage,
  loader: server(async () => fault(500, "Broken route with default fallback")),
});

function BrokenDefaultPage() {
  return (
    <>
      <title>Default Error | Litz RSC Smoke</title>
      <main>This should not render.</main>
    </>
  );
}
