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

  // The report's one table, in a single header row — the column word may be abbreviated (`Repo`).
  const hasReportTable = (text) => {
    const header = (text.match(/^\|.*\|.*$/gm) || []).find((line) => /elements/i.test(line));
    return (
      header !== undefined &&
      /\bslug\b/i.test(header) &&
      /\brepo/i.test(header) &&
      /\bbranch\b/i.test(header) &&
      /\bphase\b/i.test(header) &&
      /depends[-\s]?on/i.test(header)
    );
  };

  // Closing report: the slug/repository/branch/phase/depends-on/elements table + coverage statement
  c.check(hasReportTable(output), 'the conversation lacks the slug/repository/branch/phase/depends-on/elements table');
  c.check(/coverage|every element|all element|every work item/i.test(output), 'closing report lacks a coverage statement');

  const diff = h.diffSandbox('split-baseline', 'rollout-spec');
  c.check(diff.modified.length === 0, `fixture files modified (spec is read-only here): ${diff.modified.join(', ')}`);
  c.check(diff.removed.length === 0, `fixture files removed: ${diff.removed.join(', ')}`);
  // The split report belongs beside the spec, named for it; everything else a split adds is a task file.
  const SPLIT_REPORT = 'spec/rollout-spec.split.md';
  const stray = diff.added.filter((f) => !f.startsWith('spec/tasks/') && f !== SPLIT_REPORT);
  c.check(stray.length === 0, `files created outside spec/tasks/: ${stray.join(', ')}`);
  c.check(diff.added.includes(SPLIT_REPORT), `the split report ${SPLIT_REPORT} was not written beside the spec`);
  const report = h.readSandboxFile('split-baseline', SPLIT_REPORT);
  c.check(report !== null && hasReportTable(report), `${SPLIT_REPORT} lacks the slug/repository/branch/phase/depends-on/elements table`);

  return c.verdict();
};
