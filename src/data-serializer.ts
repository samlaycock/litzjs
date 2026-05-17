export type DataSerializer = {
  stringify(value: unknown): string;
  parse(text: string): unknown;
};

export const jsonDataSerializer: DataSerializer = {
  stringify(value) {
    return JSON.stringify(value);
  },
  parse(text) {
    return JSON.parse(text) as unknown;
  },
};
