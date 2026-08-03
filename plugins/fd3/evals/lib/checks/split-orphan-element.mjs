import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  c.check(/API-3/.test(output), 'the orphan element API-3 is not named in the output');
  c.check(/validate-spec/i.test(output), 'the output does not recommend fd3:validate-spec');

  const diff = h.diffSandbox('split-orphan-element', 'orphan-rollout-spec');
  c.check(diff.added.length === 0, `task files were written despite the coverage defect: ${diff.added.join(', ')}`);
  c.check(diff.modified.length === 0, `the spec (read-only for this skill) or another fixture file was modified: ${diff.modified.join(', ')}`);

  return c.verdict();
};
