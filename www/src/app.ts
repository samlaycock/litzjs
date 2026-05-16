import { defineApp } from "litzjs";

import { route as apiReferenceRoute } from "./routes/docs/api-reference";
import { route as apiRoutesRoute } from "./routes/docs/api-routes";
import { route as authenticationRoute } from "./routes/docs/authentication";
import { route as bunRoute } from "./routes/docs/bun";
import { route as cloudflareWorkersRoute } from "./routes/docs/cloudflare-workers";
import { route as configurationRoute } from "./routes/docs/configuration";
import { route as denoDeployRoute } from "./routes/docs/deno-deploy";
import { route as errorHandlingRoute } from "./routes/docs/error-handling";
import { route as firstAppRoute } from "./routes/docs/first-app";
import { route as formsRoute } from "./routes/docs/forms";
import { route as installationRoute } from "./routes/docs/installation";
import { route as introductionRoute } from "./routes/docs/introduction";
import { route as layoutsRoute } from "./routes/docs/layouts";
import { route as loadersAndActionsRoute } from "./routes/docs/loaders-and-actions";
import { route as middlewareRoute } from "./routes/docs/middleware";
import { route as navigationRoute } from "./routes/docs/navigation";
import { route as nodeRoute } from "./routes/docs/node";
import { route as quickStartRoute } from "./routes/docs/quick-start";
import { route as resourcesRoute } from "./routes/docs/resources";
import { route as routingRoute } from "./routes/docs/routing";
import { route as serverConfigurationRoute } from "./routes/docs/server-configuration";
import { route as testingRoute } from "./routes/docs/testing";
import { route as troubleshootingRoute } from "./routes/docs/troubleshooting";
import { route as typescriptRoute } from "./routes/docs/typescript";
import { route as viewResponsesRoute } from "./routes/docs/view-responses";
import { route as homeRoute } from "./routes/index";

export const app = defineApp({
  routes: [
    homeRoute,
    apiReferenceRoute,
    apiRoutesRoute,
    authenticationRoute,
    bunRoute,
    cloudflareWorkersRoute,
    configurationRoute,
    denoDeployRoute,
    errorHandlingRoute,
    firstAppRoute,
    formsRoute,
    installationRoute,
    introductionRoute,
    layoutsRoute,
    loadersAndActionsRoute,
    middlewareRoute,
    navigationRoute,
    nodeRoute,
    quickStartRoute,
    resourcesRoute,
    routingRoute,
    serverConfigurationRoute,
    testingRoute,
    troubleshootingRoute,
    typescriptRoute,
    viewResponsesRoute,
  ],
});
