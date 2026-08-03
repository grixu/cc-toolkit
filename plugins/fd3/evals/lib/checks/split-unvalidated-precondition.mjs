import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  const diff = h.diffSandbox('split-unvalidated-precondition', 'unvalidated-rollout-spec');
  c.check(diff.added.length === 0, `task files (or other files) were written despite the unmet precondition: ${diff.added.join(', ')}`);
  c.check(diff.modified.length === 0, `fixture files modified: ${diff.modified.join(', ')}`);
  c.check(/validat/i.test(output), 'the output never mentions validation — the missing precondition was not surfaced');

  return c.verdict();
};
