import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sandbox = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.sandbox');

const run = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};
const git = (name, ...args) => run(['-C', path.join(sandbox, name), ...args]);
const remote = (name, ...args) => run(['--git-dir', path.join(sandbox, `${name}-origin.git`), ...args]);
const file = (name, rel) => {
  const p = path.join(sandbox, name, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

function score(checks) {
  const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
  return {
    pass: failed.length === 0,
    score: (checks.length - failed.length) / checks.length,
    reason: failed.length ? `${checks.length - failed.length}/${checks.length}; failed: ${failed.join('; ')}` : `all ${checks.length} checks passed`,
  };
}

const field = (output, key) => (String(output ?? '').match(new RegExp(`^\\s*${key}:\\s*(.*)$`, 'mi')) ?? [])[1] ?? '';

function common(name, branch, output, { source, status, baseBranch = "develop" }) {
  const parents = (git(name, 'rev-list', '--parents', '-n', '1', 'HEAD') ?? '').split(' ').slice(1);
  const baseTip = remote(name, 'rev-parse', `refs/heads/${baseBranch}`);
  const pushedHead = fs.readFileSync(path.join(sandbox, `${name}-pushed-head`), 'utf8').trim();
  const base = field(output, 'base');
  return [
    [git(name, 'branch', '--show-current') === branch, `HEAD is not on ${branch}`],
    [parents.length === 2, `HEAD is not a merge commit (${parents.length} parents)`],
    [parents[0] === pushedHead, 'the merge\'s first parent is not the branch tip it started from (history rewritten?)'],
    [parents[1] === baseTip, `the merge's second parent is not the remote ${baseBranch} tip (stale base or wrong base)`],
    [!git(name, 'grep', '-n', '-E', '^(<<<<<<<|>>>>>>>)( |$)'), 'conflict markers remain in the tree'],
    [git(name, 'status', '--porcelain', '--untracked-files=no') === '', 'tracked files left uncommitted'],
    [remote(name, 'rev-parse', `refs/heads/${branch}`) === pushedHead, 'the branch was pushed although the push was declined'],
    [/merge-in-head result/i.test(String(output ?? '')), 'no result block'],
    [new RegExp(`\\b${baseBranch}\\b`).test(base) && source.test(base), `base line "${base}" does not name ${baseBranch} from ${source}`],
    [new RegExp(`^${status}\\b`, 'i').test(field(output, 'status')), `status "${field(output, 'status')}" is not ${status}`],
  ];
}

function conflictChecks(name) {
  const greeting = file(name, 'src/greeting.js') ?? '';
  return [
    [/Hi,/.test(greeting), 'the branch\'s "Hi" greeting was lost'],
    [/name\.trim\(\)/.test(greeting), 'develop\'s name.trim() was lost'],
    [!/Hello,/.test(greeting), 'both greetings were kept (invented behaviour)'],
    [file(name, 'src/format.js') !== null, 'develop\'s src/format.js did not arrive'],
  ];
}

export function pr(output) {
  return score([...common('mih-pr', 'feat/hi-greeting', output, { source: /pr #?30/i, status: 'resolved' }), ...conflictChecks('mih-pr')]);
}

export function reflog(output) {
  return score([...common('mih-reflog', 'feat/casual-greeting', output, { source: /reflog|nearest/i, status: 'resolved' }), ...conflictChecks('mih-reflog')]);
}

export function clean(output) {
  return score([
    ...common('mih-clean', 'feat/farewell', output, { source: /gh-merge-base/i, status: 'merged' }),
    [file('mih-clean', 'src/farewell.js') !== null, 'the branch\'s src/farewell.js is gone'],
    [/name\.trim\(\)/.test(file('mih-clean', 'src/greeting.js') ?? ''), 'develop\'s greeting change did not arrive'],
  ]);
}

export function siblings(output) {
  return score([
    ...common('mih-siblings', 'feat/farewell', output, { source: /nearest|default/i, status: 'merged', baseBranch: 'main' }),
    [!/sibling/i.test(field(output, 'base')), 'a sibling feature branch was taken as the base'],
    [file('mih-siblings', 'src/farewell.js') !== null, "the branch's src/farewell.js is gone"],
    [/name\.trim\(\)/.test(file('mih-siblings', 'src/greeting.js') ?? ''), "main's greeting change did not arrive"],
  ]);
}
