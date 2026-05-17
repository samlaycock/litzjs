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

const MALFORMED_INTERNAL_REQUEST_MESSAGE = "Malformed internal request.";

export class MalformedInternalRequestError extends Error {
  constructor() {
    super(MALFORMED_INTERNAL_REQUEST_MESSAGE);
    this.name = "MalformedInternalRequestError";
  }
}

export function isMalformedInternalRequestError(
  error: unknown,
): error is MalformedInternalRequestError {
  return error instanceof MalformedInternalRequestError;
}

export async function parseInternalRequestBody(request: Request): Promise<InternalRequestBody> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return (await request.json()) as InternalRequestBody;
    } catch {
      throw new MalformedInternalRequestError();
    }
  }

  const metadataHeader = request.headers.get(INTERNAL_REQUEST_HEADER);

  if (!metadataHeader) {
    return {};
  }

  let metadata: InternalRequestMetadata;

  try {
    metadata = JSON.parse(metadataHeader) as InternalRequestMetadata;
  } catch {
    throw new MalformedInternalRequestError();
  }

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
