export type ProductGroups = string[];

const PRODUCT_GROUP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseProductGroups(raw: string | undefined): ProductGroups {
  const groups = (raw ?? '').split(',').map((g) => g.trim()).filter(Boolean);
  for (const group of groups) {
    if (!PRODUCT_GROUP_SLUG.test(group)) throw new Error(`PRODUCT_GROUPS: invalid slug "${group}"`);
  }
  return groups;
}
