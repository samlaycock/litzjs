import * as React from "react";

import type { ActionHookResult, LoaderHookResult, ResourceRequest } from "../index";

import { matchPathname } from "../path-matching";
import { createInternalActionRequestInit, VOLT_RESULT_ACCEPT } from "../server/internal-requests";
import {
  isRedirectSignal,
  isRouteLikeError,
  parseActionResponse,
  parseLoaderResponse,
} from "./transport";

export async function fetchRouteLoader(
  path: string,
  request: ResourceRequest,
  target?: string,
): Promise<LoaderHookResult> {
  const response = await fetch("/_volt/route", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: VOLT_RESULT_ACCEPT,
    },
    body: JSON.stringify({
      path,
      target,
      operation: "loader",
      request: normalizeRequest(request),
    }),
  });

  return parseLoaderResponse(response);
}

export async function fetchRouteAction(
  path: string,
  request: ResourceRequest,
  payload: FormData | Record<string, unknown>,
): Promise<ActionHookResult> {
  const actionRequest = createInternalActionRequestInit(
    {
      path,
      operation: "action",
      request: normalizeRequest(request),
    },
    payload,
  );

  const response = await fetch("/_volt/action", {
    method: "POST",
    headers: actionRequest.headers,
    body: actionRequest.body,
  });

  return parseActionResponse(response);
}

function normalizeRequest(request: ResourceRequest): {
  params: Record<string, string>;
  search: Record<string, string>;
} {
  return {
    params: request.params ?? {},
    search:
      request.search instanceof URLSearchParams
        ? Object.fromEntries(request.search.entries())
        : (request.search ?? {}),
  };
}

export {
  RouteRuntimeProvider,
  createPendingRuntimeState,
  createRouteFormComponent,
  useRequiredRouteActions,
  useRequiredRouteData,
  useRequiredRouteLocation,
  useRequiredRouteRuntime,
  useRequiredRouteStatus,
} from "./route-runtime";
export type { RouteRuntimeState } from "./route-runtime";
export {
  ResourceRuntimeProvider,
  createResourceComponent,
  createResourceFormComponent,
  useRequiredResourceActions,
  useRequiredResourceData,
  useRequiredResourceLocation,
  useRequiredResourceStatus,
} from "./resources";
export type { ResourceRuntimeState } from "./resources";
export { isRedirectSignal, isRouteLikeError, matchPathname };
