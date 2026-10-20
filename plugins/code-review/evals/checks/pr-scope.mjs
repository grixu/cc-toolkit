import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default (output, context) => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const checkout = path.resolve(root, context.vars.checkout);
  const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  const pr = String(context.vars.pr);
  const failures = [];
  const check = (ok, msg) => {
    if (!ok) failures.push(msg);
    return ok;
  };

  const head = git(checkout, 'rev-parse', 'refs/remotes/origin/main');
  const prHead = git(checkout, 'ls-remote', 'origin', `refs/pull/${pr}/head`).split(/\s+/)[0];

  const calls = path.resolve(root, path.dirname(context.vars.gh), '..', 'gh-calls.log');
  const log = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '';
  check(new RegExp(`pr view ${pr}\\b`).test(log), `the gh stand-in was never asked for PR ${pr}`);
  check(/^api user\b/m.test(log), 'the gh user was never asked for');

  check(git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD') === 'main', "the user's checkout left main");
  check(git(checkout, 'rev-parse', 'HEAD') === head, "the user's checkout moved off its commit");
  check(git(checkout, 'status', '--porcelain') === '', "the user's checkout was edited");

  const worktree = `${checkout}.worktrees/cr-pr-${pr}`;
  if (check(fs.existsSync(worktree), `no detached worktree at ${worktree}`)) {
    check(git(worktree, 'rev-parse', 'HEAD') === prHead, 'the worktree is not at the PR head');
    check(git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD') === 'HEAD', 'the worktree is on a branch, not detached');
  }

  check(new RegExp(`^PR: #?${pr}\\b`, 'm').test(output), `no PR line naming #${pr}`);
  check(/^base: .*origin\/main/m.test(output), 'the base passed to the script is not origin/main');
  const files = (output.match(/^files: (.*)$/m) || [, ''])[1];
  check(files.includes('src/order-sync.ts'), `the PR's own file is not in the list: ${files}`);
  check(!files.includes('src/pricing.ts'), `a base file leaked into the PR's list: ${files}`);

  const mode = (output.match(/^mode: *(\S+)/m) || [, ''])[1];
  check(mode === context.vars.mode, `mode is '${mode}', expected '${context.vars.mode}'`);

  const asked = (context.providerResponse?.metadata?.toolCalls || []).filter((c) => c.name === 'Agent');
  check(asked.length === 0, `Step 1 dispatched ${asked.length} agent(s)`);

  return { pass: failures.length === 0, score: failures.length === 0 ? 1 : 0, reason: failures.join('; ') || 'all checks passed' };
};
