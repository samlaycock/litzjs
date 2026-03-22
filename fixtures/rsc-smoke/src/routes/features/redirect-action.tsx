import { defineRoute, redirect, server } from "volt";

export const route = defineRoute("/features/redirect-action", {
  component: RedirectActionPage,
  action: server(async ({ request }) => {
    const formData = await request.formData();
    const modeValue = formData.get("mode");
    const replace = (typeof modeValue === "string" ? modeValue : "push") === "replace";

    return redirect(`/features/redirect-target?from=action&mode=${replace ? "replace" : "push"}`, {
      replace,
    });
  }),
});

function RedirectActionPage() {
  return (
    <main>
      <h1>Redirect Action</h1>
      <route.Form>
        <button type="submit" name="mode" value="push">
          Redirect with push
        </button>
        <button type="submit" name="mode" value="replace">
          Redirect with replace
        </button>
      </route.Form>
    </main>
  );
}
