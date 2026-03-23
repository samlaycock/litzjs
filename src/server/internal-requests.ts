import { createFormDataPayload } from "../form-data";

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
    search?: Record<string, string>;
  };
};

export type InternalRequestBody = InternalRequestMetadata & {
  payload?: InternalPayload | SerializedInternalPayload | null;
};

export const INTERNAL_REQUEST_HEADER = "x-litz-request";
export const LITZ_RESULT_ACCEPT = "application/vnd.litz.result+json, text/x-component";

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

export async function parseInternalRequestBody(request: Request): Promise<InternalRequestBody> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as InternalRequestBody;
  }

  const metadataHeader = request.headers.get(INTERNAL_REQUEST_HEADER);

  if (!metadataHeader) {
    return {};
  }

  const metadata = JSON.parse(metadataHeader) as InternalRequestMetadata;

  if (request.method === "GET" || request.method === "HEAD") {
    return metadata;
  }

  const formData = await request.formData();

  return {
    ...metadata,
    payload: {
      type: "form-data",
      entries: Array.from(formData.entries()),
    },
  };
}
