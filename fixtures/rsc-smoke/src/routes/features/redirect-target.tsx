import { defineRoute } from "litzjs";

export const route = defineRoute("/features/redirect-target", {
  component: LoginPage,
});

function LoginPage() {
  const [search] = route.useSearch();

  return (
    <>
      <title>Redirect Target | Litz RSC Smoke</title>
      <main>
        <h1>Login</h1>
        <p>Redirect source: {search.get("from") ?? "direct"}</p>
        <p>History mode: {search.get("mode") ?? "push"}</p>
      </main>
    </>
  );
}
