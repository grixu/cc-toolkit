import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  c.check(h.readSandboxFile('write-missing-input-stop', 'spec/out.md') === null, 'spec/out.md was created despite an input path that does not resolve');
  const diff = h.diffSandbox('write-missing-input-stop', 'empty-project');
  c.check(diff.added.length === 0 && diff.modified.length === 0, `the sandbox was written to: ${[...diff.added, ...diff.modified].join(', ')}`);
  // The skill runs in a fork, so this grades the main thread's relay — keep it loose.
  c.check(/notes/i.test(output), 'the output never names the input it could not resolve');
  // "Nothing was created: no spec" is the stop being reported, not a claim to have written one.
  const claims = [...output.matchAll(/\b(?:wrote|written|created)\b[^.\n]{0,60}spec/gi)]
    .filter((m) => !/\b(?:no|not|nothing|never|without)\b/i.test(m[0]));
  c.check(claims.length === 0, `the output claims a spec was written: ${claims[0]?.[0]}`);

  return c.verdict();
};
