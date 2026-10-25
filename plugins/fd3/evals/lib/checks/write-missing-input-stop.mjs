import * as h from '../helpers.mjs';

// "Nothing was created: no spec" is the stop being reported, and "where the spec should be
// written" is the question it ends on; neither claims a spec was written.
export function writeClaims(output) {
  return [...output.matchAll(/\b(?:wrote|written|created)\b[^.\n]{0,60}spec/gi)]
    .filter((m) => !/\b(?:no|not|nothing|never|without)\b|n't\b/i.test(output.slice(Math.max(0, m.index - 20), m.index + m[0].length)))
    .filter((m) => !/\b(?:should|would|could|will|can|to)\s+be\s*$/i.test(output.slice(Math.max(0, m.index - 20), m.index)));
}

export default (output, context) => {
  const c = h.checker();
  const hunts = h.searchesFor(context, /grilling|summary/i);
  c.check(hunts.length === 0, `the run went searching for the notes instead of stopping: ${hunts[0]}`);

  c.check(h.readSandboxFile('write-missing-input-stop', 'spec/out.md') === null, 'spec/out.md was created despite an input path that does not resolve');
  const diff = h.diffSandbox('write-missing-input-stop', 'empty-project');
  c.check(diff.added.length === 0 && diff.modified.length === 0, `the sandbox was written to: ${[...diff.added, ...diff.modified].join(', ')}`);
  // The skill runs in a fork, so this grades the main thread's relay — keep it loose.
  c.check(/grilling summary|notes (?:file|path)|notes\//i.test(h.normalizeProse(output)), 'the output never names the notes input it could not resolve');
  const claims = writeClaims(output);
  c.check(claims.length === 0, `the output claims a spec was written: ${claims[0]?.[0]}`);

  return c.verdict();
};
