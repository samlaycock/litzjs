export type SearchParamValue = string | string[];
export type SearchParamRecord = Record<string, SearchParamValue>;
export type SearchParamsInput = URLSearchParams | SearchParamRecord;

export function createSearchParams(search?: SearchParamsInput): URLSearchParams {
  if (!search) {
    return new URLSearchParams();
  }

  if (search instanceof URLSearchParams) {
    return new URLSearchParams(search);
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        searchParams.append(key, entry);
      }

      continue;
    }

    searchParams.append(key, value);
  }

  return searchParams;
}

export function createSearchParamRecord(search: URLSearchParams): SearchParamRecord {
  const record: SearchParamRecord = {};

  for (const [key, value] of search.entries()) {
    const currentValue = record[key];

    if (currentValue === undefined) {
      record[key] = value;
      continue;
    }

    if (Array.isArray(currentValue)) {
      record[key] = [...currentValue, value];
      continue;
    }

    record[key] = [currentValue, value];
  }

  return record;
}
