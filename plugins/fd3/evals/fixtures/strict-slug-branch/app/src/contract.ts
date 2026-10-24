// Path-segment pattern of the public API contract: any product group the API can route to.
export const PRODUCT_GROUP_PATTERN = /^[a-z0-9-]+$/;

export const productGroupPath = (group: string): string => `/v1/groups/${group}`;
