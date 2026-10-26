import chunk from 'lodash/chunk';

export function inBatches<T>(items: T[], size: number): T[][] {
  return chunk(items, size);
}
