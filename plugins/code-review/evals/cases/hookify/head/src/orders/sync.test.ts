import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('order sync logging', () => {
  it('logs through the logger, never the console', () => {
    const source = readFileSync(new URL('./legacy.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('console.log(');
  });
});
