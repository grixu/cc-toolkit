export const FAMILIES = new Set([
  'readability', 'tests', 'naming', 'module', 'objects', 'patterns', 'simplicity',
  'correctness', 'security', 'performance', 'spec', 'coherence', 'assumptions', 'standards',
  'comments',
]);

export function strayHandoffFamilies(text) {
  const block = text.split(/^#+\s*HANDOFF\b.*$/m)[1];
  if (!block) return [];
  const body = block.split(/^#+\s/m)[0];
  return [...body.matchAll(/^\s*-\s*`([^`]+)`/gm)].map((m) => m[1]).filter((f) => !FAMILIES.has(f));
}

export default (output) => {
  const stray = strayHandoffFamilies(output);
  return {
    pass: stray.length === 0,
    score: stray.length === 0 ? 1 : 0,
    reason: stray.length ? `HANDOFF names families outside severity.md: ${stray.join(', ')}` : 'every HANDOFF family is a fixed label',
  };
};
