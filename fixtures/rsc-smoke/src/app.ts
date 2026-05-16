import { defineApp } from "litzjs";

import { api as echoApi } from "./routes/api/echo";
import { api as healthApi } from "./routes/api/health";
import { route as actionViewRoute } from "./routes/features/action-view";
import { route as apiRouteFeature } from "./routes/features/api-route";
import { route as errorBoundaryRoute } from "./routes/features/error-boundary";
import { route as errorDefaultRoute } from "./routes/features/error-default";
import { route as inputValidationRoute } from "./routes/features/input-validation";
import { route as layoutsRoute } from "./routes/features/layouts";
import { route as loaderDataRoute } from "./routes/features/loader-data";
import { route as loaderViewRoute } from "./routes/features/loader-view";
import { route as middlewareRoute } from "./routes/features/middleware";
import { route as navigationVariantsRoute } from "./routes/features/navigation-variants";
import { route as offlineRoute } from "./routes/features/offline";
import { route as redirectActionRoute } from "./routes/features/redirect-action";
import { route as redirectLoaderRoute } from "./routes/features/redirect-loader";
import { route as redirectTargetRoute } from "./routes/features/redirect-target";
import { route as resourceActionsRoute } from "./routes/features/resource-actions";
import { route as resourceDataRoute } from "./routes/features/resource-data";
import { route as revalidateRoute } from "./routes/features/revalidate";
import { route as searchParamsRoute } from "./routes/features/search-params";
import { route as statusPendingRoute } from "./routes/features/status-pending";
import { route as submitImperativeRoute } from "./routes/features/submit-imperative";
import { route as useViewRoute } from "./routes/features/use-view";
import { route as homeRoute } from "./routes/index";
import { resource as accountMenuResource } from "./routes/resources/account-menu";
import { resource as feedPanelResource } from "./routes/resources/feed-panel";
import { resource as summaryCardResource } from "./routes/resources/summary-card";
import { resource as validatedCardResource } from "./routes/resources/validated-card";

export const app = defineApp({
  routes: [
    homeRoute,
    actionViewRoute,
    apiRouteFeature,
    errorBoundaryRoute,
    errorDefaultRoute,
    inputValidationRoute,
    layoutsRoute,
    loaderDataRoute,
    loaderViewRoute,
    middlewareRoute,
    navigationVariantsRoute,
    offlineRoute,
    redirectActionRoute,
    redirectLoaderRoute,
    redirectTargetRoute,
    resourceActionsRoute,
    resourceDataRoute,
    revalidateRoute,
    searchParamsRoute,
    statusPendingRoute,
    submitImperativeRoute,
    useViewRoute,
  ],
  resources: [accountMenuResource, feedPanelResource, summaryCardResource, validatedCardResource],
  apiRoutes: [echoApi, healthApi],
});
