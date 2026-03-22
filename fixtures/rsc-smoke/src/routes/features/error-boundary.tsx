import { defineRoute, error, server } from "volt";

export const route = defineRoute("/features/error-boundary", {
  component: BrokenBoundaryPage,
  loader: server(async () => error(503, "Broken route with explicit boundary")),
  errorComponent: BrokenBoundaryFallback,
});

function BrokenBoundaryPage() {
  return <main>This should not render.</main>;
}

function BrokenBoundaryFallback(props: {
  error: {
    kind: "error" | "fault";
    status: number;
    message: string;
  };
}) {
  return (
    <>
      <title>Boundary Error | Volt RSC Smoke</title>
      <main>
        <h1>Boundary Error Route</h1>
        <p>
          {props.error.kind} {props.error.status}: {props.error.message}
        </p>
      </main>
    </>
  );
}
