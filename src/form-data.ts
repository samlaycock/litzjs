export function createFormDataPayload(payload?: FormData | Record<string, unknown>): FormData {
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

  if (value == null) {
    formData.append(key, "");
    return;
  }

  if (typeof value === "object") {
    formData.append(key, JSON.stringify(value));
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

  if (typeof value === "symbol") {
    formData.append(key, value.description ?? value.toString());
    return;
  }

  if (typeof value === "function") {
    formData.append(key, value.name || "[function]");
    return;
  }

  formData.append(key, JSON.stringify(value) ?? "");
}
