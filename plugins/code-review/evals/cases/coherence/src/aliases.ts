import { createHmac } from 'node:crypto';

function pepper(): string {
  const value = process.env.ALIAS_PEPPER;
  if (!value) throw new Error('missing required environment variable ALIAS_PEPPER');
  return value;
}

export function aliasDigest(alias: string): string {
  return createHmac('sha256', pepper()).update(alias.trim().toLowerCase()).digest('hex');
}
