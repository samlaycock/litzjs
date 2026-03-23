import { defineRoute, redirect, server } from "litzjs";

export const route = defineRoute("/features/redirect-action", {
  component: RedirectActionPage,
  action: server(async ({ request }) => {
    const formData = await request.formData();
    const modeValue = formData.get("mode");
    const fromValue = formData.get("from");
    const replace = (typeof modeValue === "string" ? modeValue : "push") === "replace";
    const from = typeof fromValue === "string" ? fromValue : "action";

    return redirect(
      `/features/redirect-target?from=${encodeURIComponent(from)}&mode=${replace ? "replace" : "push"}`,
      {
        replace,
      },
    );
  }),
});

function RedirectActionPage() {
  return (
    <>
      <title>Redirect Action | Litz RSC Smoke</title>
      <main>
        <h1>Redirect Action</h1>
        <p>This route demonstrates hidden form fields plus a route action redirect.</p>
        <route.Form>
          <input type="hidden" name="from" value="action-form" />

          <fieldset>
            <legend>History mode</legend>
            <label>
              <input type="radio" name="mode" value="push" defaultChecked /> Push
            </label>
            <label>
              <input type="radio" name="mode" value="replace" /> Replace
            </label>
          </fieldset>

          <button type="submit">Submit redirect action</button>
        </route.Form>
      </main>
    </>
  );
}
