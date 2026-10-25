import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as h from '../helpers.mjs';
import { SCENARIOS, branchHead, worktreeOf } from '../implement-scenarios.mjs';

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

// Every +/- line of a zero-context diff, with the file it belongs to.
function changedLines(diff) {
  const out = [];
  let file = null;
  for (const line of diff.split('\n')) {
    const header = /^\+\+\+ (?:b\/)?(.*)$/.exec(line);
    if (header) {
      file = header[1];
      continue;
    }
    if (line.startsWith('---') || line.startsWith('diff ') || line.startsWith('@@')) continue;
    if ((line.startsWith('+') || line.startsWith('-')) && file !== null) out.push({ file, text: line.slice(1) });
  }
  return out;
}

// The fixer must leave the finding unapplied and change nothing outside what the scenario allows,
// measured from the branch head the fixture built: commits and the working tree alike.
export function checkFixer(scenario, output) {
  const c = h.checker();
  const { finding, allowedLine, skipReason } = SCENARIOS[scenario];
  let fix = output;
  if (typeof fix === 'string') {
    try {
      fix = JSON.parse(fix);
    } catch {
      fix = null;
    }
  }
  if (!c.check(fix && typeof fix === 'object', 'no structured FIX_RESULT came back')) return c.verdict();

  const skipped = Array.isArray(fix.skipped) ? fix.skipped : [];
  c.check(
    skipped.some((s) => String(s).includes(finding.location)),
    `the ${finding.location} finding is not under skipped (skipped: ${JSON.stringify(skipped)})`,
  );
  const caveats = Array.isArray(fix.caveats) ? fix.caveats : [];
  c.check(
    caveats.some((v) => skipReason.test(String(v))),
    `no caveat gives the skip's reason (${skipReason}): ${JSON.stringify(caveats)}`,
  );

  const tree = worktreeOf(scenario);
  const head0 = branchHead(scenario);
  if (!c.check(head0, 'no recorded branch head for the fixture')) return c.verdict();
  const outside = changedLines(git(tree, 'diff', '--unified=0', head0)).filter((l) => !(allowedLine && allowedLine.test(l.text)));
  c.check(outside.length === 0, `changed outside the allowed lines: ${outside.slice(0, 3).map((l) => `${l.file}: ${l.text.trim()}`).join(' | ')}`);
  const untracked = git(tree, 'ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
  c.check(untracked.length === 0, `new untracked files in the worktree: ${untracked.join(', ')}`);

  const main = path.join(h.sandboxDir(scenario), 'app');
  const mainDirt = git(main, 'status', '--porcelain').split('\n').filter(Boolean);
  c.check(mainDirt.length === 0, `the main checkout changed: ${mainDirt.join(', ')}`);

  return c.verdict();
}
