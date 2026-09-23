import * as h from '../helpers.mjs';
import * as s from './split-shared.mjs';

// CI-1 edits `.github/workflows/`, which repo-a's CODEOWNERS gives to release-team. It is a
// delivery task like any other, on a branch of its own, so one external approval cannot hold
// the rest of the phase-1 landing unit.
export default (output) => {
  const c = h.checker();
  const tasks = h.readTasks('split-protected-path');
  const CODES = [...s.ELEMENT_CODES, 'CI-1'];

  c.check(tasks.length === 7, `expected 7 task files (the six elements plus CI-1), found ${tasks.length}`);
  s.checkTaskStructure(c, tasks);
  s.checkCoverage(c, tasks, CODES);
  s.checkBoundaries(c, tasks, { precedesDb: 'CI-1' });
  s.checkIndexCardRule(c, tasks);

  const ci = tasks.find((t) => s.elementsOf(t).includes('CI-1'));
  if (c.check(ci !== undefined, 'no task carries CI-1')) {
    c.check(s.elementsOf(ci).length === 1, `${ci.file}: CI-1 shares its task with another element`);
    c.check(ci.fm.repository !== 'none', `${ci.file}: CI-1 is a delivery task, not an operational one`);
    c.check(/1/.test(String(ci.fm.phase)), `${ci.file}: CI-1 is not in phase 1 (${ci.fm.phase})`);

    const sharing = tasks.filter((t) => t !== ci && t.fm && t.fm.branch && t.fm.branch === ci.fm.branch);
    c.check(sharing.length === 0, `${ci.file}: the protected-path task shares its branch with ${sharing.map((t) => t.file).join(', ')}`);
  }

  const SPLIT_REPORT = 'spec/protected-path-spec.split.md';
  const diff = h.diffSandbox('split-protected-path', 'protected-path-rollout-spec');
  c.check(diff.added.includes(SPLIT_REPORT), `the split report ${SPLIT_REPORT} was not written beside the spec`);
  c.check(diff.modified.length === 0, `fixture files modified (spec is read-only here): ${diff.modified.join(', ')}`);

  return c.verdict();
};
