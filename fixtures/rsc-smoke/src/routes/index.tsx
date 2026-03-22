import { defineRoute } from "volt";
import { Link } from "volt/client";

export const route = defineRoute("/", {
  component: HomePage,
});

function HomePage() {
  const links = [
    ["/", "Home"],
    ["/features/loader-data", "Feature: Loader Data"],
    ["/features/loader-view", "Feature: Loader View"],
    ["/features/action-view", "Feature: Action View"],
    ["/features/redirect-loader", "Feature: Redirect Loader"],
    ["/features/redirect-action", "Feature: Redirect Action"],
    ["/features/error-boundary", "Feature: Error Boundary"],
    ["/features/error-default", "Feature: Default Error"],
    ["/features/submit-imperative", "Feature: Imperative Submit"],
    ["/features/status-pending", "Feature: Status + Pending"],
    ["/features/use-view", "Feature: useView"],
    ["/features/search-params?term=volt&tab=active", "Feature: Search Params"],
    ["/features/revalidate", "Feature: Revalidate"],
    ["/features/layouts", "Feature: Layouts"],
    ["/features/middleware", "Feature: Middleware"],
    ["/features/api-route", "Feature: API Route"],
    ["/features/resource-data", "Feature: Resource Data"],
    ["/features/resource-actions", "Feature: Resource Actions"],
  ] as const;

  return (
    <>
      <title>Home | Volt RSC Smoke</title>
      <main>
        <h1>Volt RSC Smoke</h1>
        <p>This home route is fully client-rendered.</p>

        <nav>
          <ul>
            {links.map(([href, label]) => (
              <li key={href}>
                <Link href={href}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <p>
          Negative case note: resource path params are required. Removing the `params` prop from the
          packaged resource below should fail in dev.
        </p>
      </main>
    </>
  );
}
