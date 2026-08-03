import * as h from '../helpers.mjs';
import * as s from './split-shared.mjs';

export default (output) => {
  const c = h.checker();
  const tasks = h.readTasks('split-baseline');

  c.check(tasks.length === 6, `expected exactly 6 task files in spec/tasks/, found ${tasks.length}`);
  s.checkTaskStructure(c, tasks);
  s.checkCoverage(c, tasks);
  s.checkBoundaries(c, tasks);
  s.checkIndexCardRule(c, tasks);

  // Closing report: the slug/repository/branch/phase/depends-on/elements table + coverage statement
  c.check(/\|[^\n]*repository[^\n]*\|/i.test(output) && /\|[^\n]*elements[^\n]*\|/i.test(output) && /\|[^\n]*depends[-\s]?on[^\n]*\|/i.test(output), 'closing report lacks the slug/repository/branch/phase/depends-on/elements table');
  c.check(/coverage|every element|all element|every work item/i.test(output), 'closing report lacks a coverage statement');

  const diff = h.diffSandbox('split-baseline', 'rollout-spec');
  c.check(diff.modified.length === 0, `fixture files modified (spec is read-only here): ${diff.modified.join(', ')}`);
  c.check(diff.removed.length === 0, `fixture files removed: ${diff.removed.join(', ')}`);
  c.check(diff.added.every((f) => f.startsWith('spec/tasks/')), `files created outside spec/tasks/: ${diff.added.filter((f) => !f.startsWith('spec/tasks/')).join(', ')}`);

  return c.verdict();
};
