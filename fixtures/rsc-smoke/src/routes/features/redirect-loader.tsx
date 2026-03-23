import { defineRoute, redirect, server } from "litz";

export const route = defineRoute("/features/redirect-loader", {
  component: RedirectLoaderPage,
  loader: server(async () =>
    redirect("/features/redirect-target?from=loader&mode=replace", { replace: true }),
  ),
});

function RedirectLoaderPage() {
  return (
    <>
      <title>Redirect Loader | Litz RSC Smoke</title>
      <main>Redirecting from loader...</main>
    </>
  );
}
