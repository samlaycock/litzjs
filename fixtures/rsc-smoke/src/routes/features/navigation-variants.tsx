import { defineRoute } from "litzjs";
import { Link, useNavigate } from "litzjs/client";

export const route = defineRoute("/features/navigation-variants", {
  component: NavigationVariantsPage,
});

function NavigationVariantsPage() {
  const navigate = useNavigate();

  return (
    <>
      <title>Navigation Variants | Litz RSC Smoke</title>
      <main>
        <h1>Navigation Variants</h1>
        <nav>
          <Link href="/features/loader-data" prefetch="none">
            No prefetch link
          </Link>
          <Link href="/features/loader-view" prefetch="render">
            Render prefetch link
          </Link>
          <Link href="/features/search-params?term=prefetch&tab=data" prefetchData replace>
            Prefetch data replace link
          </Link>
        </nav>
        <button type="button" onClick={() => navigate("/features/revalidate", { replace: true })}>
          Navigate with replace
        </button>
      </main>
    </>
  );
}
