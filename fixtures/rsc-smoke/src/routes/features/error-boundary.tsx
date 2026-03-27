import { defineRoute, fault, server, type RouteFaultLike } from "litzjs";

export const route = defineRoute("/features/error-boundary", {
  component: BrokenBoundaryPage,
  loader: server(async () => fault(503, "Broken route with explicit boundary")),
  errorBoundary: BrokenBoundaryFallback,
});

function BrokenBoundaryPage() {
  return <main>This should not render.</main>;
}

function BrokenBoundaryFallback(props: { error: RouteFaultLike }) {
  return (
    <>
      <title>Boundary Error | Litz RSC Smoke</title>
      <main>
        <h1>Boundary Error Route</h1>
        <p>
          {props.error.kind} {props.error.status}: {props.error.message}
        </p>
      </main>
    </>
  );
}
