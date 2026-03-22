import { data, defineApiRoute, defineResource, defineRoute, server } from "volt";

const clientOnlyRoute = defineRoute("/typechecks/client-only", {
  component: ClientOnlyRoute,
});

function ClientOnlyRoute() {
  return null;
}

// @ts-expect-error client-only routes should not expose loader hooks
void clientOnlyRoute.useLoaderResult;
// @ts-expect-error client-only routes should not expose action hooks
void clientOnlyRoute.useSubmit;
// @ts-expect-error client-only routes should not expose Form
void clientOnlyRoute.Form;

const loaderRoute = defineRoute("/typechecks/projects/:id", {
  component: LoaderRoute,
  loader: server(async () => data({ ok: true })),
});

function LoaderRoute() {
  return null;
}

const loaderParams = loaderRoute.useParams();
const loaderParamId: string = loaderParams.id;
void loaderParamId;
// @ts-expect-error unknown params should not exist
void loaderParams.slug;

const actionRoute = defineRoute("/typechecks/action-only", {
  component: ActionRoute,
  action: server(async () => data({ ok: true })),
});

function ActionRoute() {
  return null;
}

const submit = actionRoute.useSubmit();
void submit;
// @ts-expect-error action-only routes should not expose loader hooks
void actionRoute.useLoaderResult;

const loaderResource = defineResource("/typechecks/resource/:id", {
  loader: server<unknown, any, "/typechecks/resource/:id">(async ({ params }) =>
    data({ id: params.id }),
  ),
});

loaderResource.useLoader({ params: { id: "alpha" } });
// @ts-expect-error param-based resources should require params
loaderResource.useLoader();
// @ts-expect-error resources without a component should not expose Component
void loaderResource.Component;

const actionResource = defineResource("/typechecks/action-resource", {
  action: server(async () => data({ ok: true })),
});

const actionResourceState = actionResource.useAction();
void actionResourceState;
// @ts-expect-error action-only resources should not expose loader hooks
void actionResource.useLoader;

const componentResource = defineResource("/typechecks/component/:id", {
  component(props) {
    return props.params.id;
  },
});

void componentResource.Component;

const typedApi = defineApiRoute("/api/typechecks/:id", {
  PATCH() {
    return new Response(null, { status: 204 });
  },
});

void typedApi.fetch({ method: "PATCH", params: { id: "123" } });
// @ts-expect-error path params should be required for api.fetch
void typedApi.fetch();
// @ts-expect-error unsupported method should be rejected
void typedApi.fetch({ method: "GET", params: { id: "123" } });

const allApi = defineApiRoute("/api/typechecks/all", {
  ALL() {
    return new Response(null, { status: 204 });
  },
});

void allApi.fetch({ method: "DELETE" });
