import * as h from '../helpers.mjs';
import * as s from './split-shared.mjs';

// The spec's verdict line carries one deferred claim — a gap the spec itself declares with an
// owner and a placement. The split proceeds and tracks the gap as an operational task.
export default (output) => {
  const c = h.checker();
  const tasks = h.readTasks('split-declared-gap');

  c.check(tasks.length === 7, `expected 7 task files (6 delivery + the declared gap), found ${tasks.length}`);
  s.checkTaskStructure(c, tasks);
  s.checkCoverage(c, tasks);
  s.checkBoundaries(c, tasks);
  s.checkIndexCardRule(c, tasks);

  const operational = tasks.filter((t) => t.fm && t.fm.repository === 'none');
  if (c.check(operational.length === 1, `expected exactly 1 operational task, found ${operational.length}`)) {
    const gap = operational[0];
    c.check(s.elementsOf(gap).length === 0, `${gap.file}: the gap task carries an element code it does not build`);
    const note = h.section(gap.body, 'Note') || '';
    c.check(/platform team/i.test(note), `${gap.file}: the ## Note does not name the gap's owner (platform team)`);
    c.check(/phase 2|ceiling|rate[-\s]?limit/i.test(note), `${gap.file}: the ## Note does not say what the gap is or where it lands`);
  }

  // The run did not stop on the deferred claim: the files and the report exist.
  const SPLIT_REPORT = 'spec/gap-rollout-spec.split.md';
  const diff = h.diffSandbox('split-declared-gap', 'gap-rollout-spec');
  c.check(diff.added.includes(SPLIT_REPORT), `the split report ${SPLIT_REPORT} was not written beside the spec`);
  c.check(diff.modified.length === 0, `fixture files modified (spec is read-only here): ${diff.modified.join(', ')}`);
  const stray = diff.added.filter((f) => !f.startsWith('spec/tasks/') && f !== SPLIT_REPORT);
  c.check(stray.length === 0, `files created outside spec/tasks/: ${stray.join(', ')}`);

  const report = h.readSandboxFile('split-declared-gap', SPLIT_REPORT) || '';
  c.check(/1 deferred/.test(report) || /1 deferred/.test(output), 'neither the report nor the reply quotes the verdict line the split was taken against');

  return c.verdict();
};
