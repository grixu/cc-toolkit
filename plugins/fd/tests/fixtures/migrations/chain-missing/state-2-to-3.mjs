export const artifact = 'state';
export const from = 2;
export const to = 3;

export function migrate(value) {
  return { ...value, schema: 3, addedInV3: true };
}
