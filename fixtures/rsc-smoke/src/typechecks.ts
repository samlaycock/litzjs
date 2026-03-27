import { data, defineApiRoute, defineResource, defineRoute, fault, server } from "litzjs";

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
const loaderError = loaderRoute.useLoaderError();
void loaderError;
// @ts-expect-error unknown params should not exist
void loaderParams.slug;
// @ts-expect-error loader routes should not expose retry hooks
void loaderRoute.useRetry;

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
// @ts-expect-error action-only routes should not expose loader error hooks
void actionRoute.useLoaderError;

const loaderResource = defineResource("/typechecks/resource/:id", {
  component() {
    return null;
  },
  loader: server<unknown, any, "/typechecks/resource/:id">(async ({ params }) =>
    data({ id: params.id }),
  ),
});

const loaderResourceParams = loaderResource.Component;
void loaderResourceParams;
const resourceParams = loaderResource.useParams();
const resourceParamId: string = resourceParams.id;
void resourceParamId;
const resourceLoaderError = loaderResource.useLoaderError();
void resourceLoaderError;
// @ts-expect-error loader resources should not expose retry hooks
void loaderResource.useRetry;

const actionResource = defineResource("/typechecks/action-resource", {
  component() {
    return null;
  },
  action: server(async () => data({ ok: true })),
});

const actionSubmit = actionResource.useSubmit();
void actionSubmit;
// @ts-expect-error action-only resources should not expose loader result hooks
void actionResource.useLoaderResult;
// @ts-expect-error action-only resources should not expose loader error hooks
void actionResource.useLoaderError;

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

const faultRoute = defineRoute("/typechecks/fault", {
  component() {
    return null;
  },
  loader: server(async () => fault(503, "Unavailable")),
});

void faultRoute.useLoaderResult();
