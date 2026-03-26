export function sortRecord<TValue>(record: Record<string, TValue>): Record<string, TValue> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}
