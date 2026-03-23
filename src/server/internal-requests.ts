import {
  INTERNAL_REQUEST_HEADER,
  type InternalRequestBody,
  type InternalRequestMetadata,
} from "../internal-transport";

export type {
  InternalPayloadEntry,
  SerializedInternalPayload,
  InternalPayload,
  InternalRequestMetadata,
  InternalRequestBody,
} from "../internal-transport";
export { createInternalActionRequestInit, LITZ_RESULT_ACCEPT } from "../internal-transport";

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
