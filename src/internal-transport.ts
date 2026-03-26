import type { SearchParamRecord } from "./search-params";

import { createFormDataPayload } from "./form-data";

export type InternalPayloadEntry = [string, FormDataEntryValue];

export type SerializedInternalPayload = {
  type: "form-data" | "object";
  entries: Array<[string, string]>;
};

export type InternalPayload = {
  type: "form-data" | "object";
  entries: InternalPayloadEntry[];
};

export type InternalRequestMetadata = {
  path?: string;
  target?: string;
  operation?: "loader" | "action";
  request?: {
    params?: Record<string, string>;
    search?: SearchParamRecord;
  };
};

export type InternalRequestBody = InternalRequestMetadata & {
  payload?: InternalPayload | SerializedInternalPayload | null;
};

export const INTERNAL_REQUEST_HEADER = "x-litzjs-request";
export const LITZ_RESULT_ACCEPT = "application/vnd.litzjs.result+json, text/x-component";

export function createInternalActionRequestInit(
  metadata: InternalRequestMetadata,
  payload?: FormData | Record<string, unknown>,
): { headers: Headers; body: FormData } {
  return {
    headers: new Headers({
      accept: LITZ_RESULT_ACCEPT,
      [INTERNAL_REQUEST_HEADER]: JSON.stringify(metadata),
    }),
    body: createFormDataPayload(payload),
  };
}
