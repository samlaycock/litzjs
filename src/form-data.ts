const FORM_JSON_VALUE_KIND = "json";

export interface FormJsonValue<T = unknown> {
  readonly kind: typeof FORM_JSON_VALUE_KIND;
  readonly value: T;
}

export type FormDataPayloadValue =
  | Blob
  | string
  | number
  | boolean
  | bigint
  | FormJsonValue
  | readonly FormDataPayloadValue[];

export interface FormDataPayloadRecord {
  readonly [key: string]: FormDataPayloadValue;
}

export type SubmitPayload = FormData | FormDataPayloadRecord;

export function formJson<T>(value: T): FormJsonValue<T> {
  return {
    kind: FORM_JSON_VALUE_KIND,
    value,
  };
}

export function createFormDataPayload(payload?: SubmitPayload): FormData {
  if (payload instanceof FormData) {
    return cloneFormData(payload);
  }

  const formData = new FormData();

  if (!payload) {
    return formData;
  }

  for (const [key, value] of Object.entries(payload)) {
    appendFormDataValue(formData, key, value);
  }

  return formData;
}

function cloneFormData(source: FormData): FormData {
  const formData = new FormData();

  for (const [key, value] of source.entries()) {
    formData.append(key, value);
  }

  return formData;
}

function appendFormDataValue(formData: FormData, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      appendFormDataValue(formData, key, entry);
    }
    return;
  }

  if (value instanceof Blob) {
    formData.append(key, value);
    return;
  }

  if (isFormJsonValue(value)) {
    formData.append(key, JSON.stringify(value.value));
    return;
  }

  if (typeof value === "string") {
    formData.append(key, value);
    return;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    formData.append(key, String(value));
    return;
  }

  throw createUnsupportedFormDataValueError(key, value);
}

function isFormJsonValue(value: unknown): value is FormJsonValue {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    "kind" in value &&
    "value" in value &&
    (value as { kind?: unknown }).kind === FORM_JSON_VALUE_KIND
  );
}

function createUnsupportedFormDataValueError(key: string, value: unknown): TypeError {
  return new TypeError(
    `[litzjs] Unsupported FormData value for "${key}": ${describeFormDataValue(value)}. ` +
      "Pass strings, numbers, booleans, bigints, Blob/File values, arrays of supported values, " +
      "or wrap structured values with formJson(value).",
  );
}

function describeFormDataValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "object") {
    const constructorName = value.constructor?.name;

    return constructorName ? `${constructorName} instance` : "object";
  }

  return typeof value;
}
