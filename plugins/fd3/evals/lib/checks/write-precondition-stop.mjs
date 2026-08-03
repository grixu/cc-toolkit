import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  c.check(h.readSandboxFile('write-precondition-stop', 'spec/out.md') === null, 'spec/out.md was created despite no confirmed grilling');
  const diff = h.diffSandbox('write-precondition-stop', 'empty-project');
  c.check(diff.added.length === 0 && diff.modified.length === 0, `the sandbox was written to: ${[...diff.added, ...diff.modified].join(', ')}`);
  c.check(/grill/i.test(output), 'the output never mentions grilling — the precondition was not surfaced');

  return c.verdict();
};
