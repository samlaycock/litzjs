import { data, defineRoute, server } from "litzjs";
import { Link } from "litzjs/client";

export const route = defineRoute("/features/search-params", {
  component: SearchPage,
  loader: server(async ({ request }) => {
    const url = new URL(request.url);
    return data({
      term: url.searchParams.get("term") ?? "",
      tab: url.searchParams.get("tab") ?? "all",
    });
  }),
});

function SearchPage() {
  const loader = route.useLoaderData();
  const [search, setSearch] = route.useSearch();

  return (
    <>
      <title>Search Params | Litz RSC Smoke</title>
      <main>
        <h1>Search Params</h1>
        <p>Loader term: {loader?.term || "(empty)"}</p>
        <p>Loader tab: {loader?.tab ?? "all"}</p>
        <p>Hook term: {search.get("term") ?? "(empty)"}</p>
        <p>Hook tab: {search.get("tab") ?? "all"}</p>
        <p>
          <button type="button" onClick={() => setSearch({ term: "bun", tab: "recent" })}>
            Update search in-place
          </button>
        </p>
        <p>
          <button type="button" onClick={() => setSearch({ tab: null }, { replace: true })}>
            Clear tab with replace
          </button>
        </p>
        <p>
          Try: <Link href="/features/search-params?term=litz&tab=active">Active search</Link>
        </p>
      </main>
    </>
  );
}
