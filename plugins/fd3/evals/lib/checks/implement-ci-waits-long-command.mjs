import { execFileSync } from 'node:child_process';
import * as h from '../helpers.mjs';
import { branchHead, worktreeOf } from '../implement-scenarios.mjs';

const SCENARIO = 'implement-ci-waits-long-command';
const SLEEP_MS = 200_000;
const UNFINISHED = /still running|not (yet )?finished|unfinished|no exit line|incomplete|in the background|backgrounded|timed out/i;

const strings = (value) =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

export default (output, context) => {
  const c = h.checker();
  let ci = output;
  if (typeof ci === 'string') {
    try {
      ci = JSON.parse(ci);
    } catch {
      ci = null;
    }
  }
  if (!c.check(ci && typeof ci === 'object', 'no structured CI_RESULT came back')) return c.verdict();

  c.check(ci.passed === true, `passed is ${JSON.stringify(ci.passed)}, not true`);
  c.check(Array.isArray(ci.failures) && ci.failures.length === 0, `failures is not empty: ${JSON.stringify(ci.failures)}`);
  c.check(!ci.incomplete || ci.incomplete.length === 0, `incomplete lists ${JSON.stringify(ci.incomplete)}`);
  // A skipped build would let passed=true stand without the command ever finishing.
  c.check(!ci.skipped || ci.skipped.length === 0, `skipped lists ${JSON.stringify(ci.skipped)}`);

  const tree = worktreeOf(SCENARIO);
  let head = null;
  try {
    head = execFileSync('git', ['-C', tree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (err) {
    c.check(false, `git rev-parse HEAD failed in ${tree}: ${err.message}`);
  }
  if (head) {
    c.check(String(ci.head ?? '').trim() === head, `head ${JSON.stringify(ci.head)} is not the worktree's HEAD ${head}`);
    c.check(head === branchHead(SCENARIO), `the worktree moved off the fixture's branch head ${branchHead(SCENARIO)}`);
  }

  const dirty = typeof ci.dirty === 'string' ? ci.dirty : null;
  c.check(dirty !== null, `dirty is ${JSON.stringify(ci.dirty)}, not a string`);
  if (dirty) {
    const prose = dirty.split('\n').filter((l) => l.trim() && !/^[ MTADRCU?!]{2} /.test(l));
    c.check(prose.length === 0, `dirty is not porcelain output: ${JSON.stringify(prose[0])}`);
  }

  const said = strings(ci).filter((s) => UNFINISHED.test(s));
  c.check(said.length === 0, `the verdict says a command did not finish: ${JSON.stringify(said[0])}`);

  const durationMs = context?.providerResponse?.metadata?.durationMs;
  c.check(typeof durationMs === 'number', 'no session duration in the response metadata');
  if (typeof durationMs === 'number') {
    c.check(durationMs >= SLEEP_MS, `returned after ${Math.round(durationMs / 1000)} s — before the 200 s build could have printed its exit line`);
  }

  return c.verdict();
};
