import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  c.check(h.readSandboxFile('write-missing-input-stop', 'spec/out.md') === null, 'spec/out.md was created despite an input path that does not resolve');
  const diff = h.diffSandbox('write-missing-input-stop', 'empty-project');
  c.check(diff.added.length === 0 && diff.modified.length === 0, `the sandbox was written to: ${[...diff.added, ...diff.modified].join(', ')}`);
  // The skill runs in a fork, so this grades the main thread's relay — keep it loose.
  c.check(/notes/i.test(output), 'the output never names the input it could not resolve');
  c.check(!/\b(wrote|written|created)\b[^.\n]{0,60}spec/i.test(output), 'the output claims a spec was written');

  return c.verdict();
};
