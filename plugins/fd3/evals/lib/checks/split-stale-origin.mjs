import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as h from '../helpers.mjs';

const SCENARIO = 'split-stale-origin';
const FIXTURE = 'stale-origin-rollout-spec';
const SPEC = 'spec/rollout-spec.md';

// The reset writes each repo's SHA over its placeholder, so the only legitimate difference between
// the sandbox spec and the fixture is that one line.
const normalise = (text) => text.replace(/^Checked at: .*$/m, 'Checked at: <shas>');

export default (output) => {
  const c = h.checker();

  c.check(h.readTasks(SCENARIO).length === 0, 'task files were written although origin changed a file the spec cites');

  const diff = h.diffSandbox(SCENARIO, FIXTURE);
  c.check(diff.added.length === 0, `files created on a stale spec: ${diff.added.join(', ')}`);
  c.check(diff.removed.length === 0, `fixture files removed: ${diff.removed.join(', ')}`);
  const drifted = diff.modified.filter((f) => f !== SPEC);
  c.check(drifted.length === 0, `fixture files modified: ${drifted.join(', ')}`);

  const spec = h.readSandboxFile(SCENARIO, SPEC);
  c.check(
    spec !== null && normalise(spec) === normalise(h.readFixtureFile(FIXTURE, SPEC)),
    'the spec was edited — correcting it to follow origin is build-spec\'s work, not the split\'s',
  );

  // Rebasing the branch onto origin is the improvisation the stop exists to prevent.
  const recorded = /repo-a @ ([0-9a-f]{7,})/.exec(spec || '');
  if (c.check(recorded !== null, 'the Checked at line lost its repo-a SHA')) {
    const head = execFileSync('git', ['-C', path.join(h.sandboxDir(SCENARIO), 'repo-a'), 'rev-parse', '--short', 'main'], { encoding: 'utf8' }).trim();
    c.check(head.startsWith(recorded[1]) || recorded[1].startsWith(head), `repo-a main moved from the validated ${recorded[1]} to ${head}`);
  }

  c.check(/entries\.ts/.test(output), 'the stop does not name the file origin changed (entries.ts)');
  c.check(/\/?fd3:build-spec/.test(output), 'the stop does not name the /fd3:build-spec route');

  return c.verdict();
};
