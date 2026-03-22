import { defineRoute, redirect, server } from "volt";

export const route = defineRoute("/features/redirect-loader", {
  component: RedirectLoaderPage,
  loader: server(async () =>
    redirect("/features/redirect-target?from=loader&mode=replace", { replace: true }),
  ),
});

function RedirectLoaderPage() {
  return (
    <>
      <title>Redirect Loader | Volt RSC Smoke</title>
      <main>Redirecting from loader...</main>
    </>
  );
}
