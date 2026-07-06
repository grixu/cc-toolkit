export const artifact = 'sc-map';
export const from = 1;
export const to = 2;

export function migrate(value) {
  return { ...value, schema: 2, addedInV2: true };
}
