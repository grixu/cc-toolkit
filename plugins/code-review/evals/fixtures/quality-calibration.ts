export type Config = {
  endpoint: string;
  retries: number;
};

export type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number };

export function parseConfig(raw: string): Config {
  return JSON.parse(raw) as Config;
}

export function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius * shape.radius;
    case 'square':
      return shape.side * shape.side;
    default:
      throw new Error(`unhandled shape: ${JSON.stringify(shape)}`);
  }
}

export function median(sorted: number[]): number {
  if (sorted.length === 0) {
    throw new Error('median of an empty list');
  }

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function describeStock(available: number, reserved: number): string {
  if (available > reserved) {
    return `${available - reserved} ready to ship, ${reserved} on hold`;
  }

  return `nothing ready to ship, ${available} of ${reserved} reserved covered`;
}

export function hasResults(items: readonly unknown[]): boolean {
  return items.length > 0;
}
