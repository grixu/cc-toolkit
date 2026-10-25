// start-cr Step 1 with no --pr on a branch that has an open PR. vars.expect is `offer` (the PR is
// someone else's: the run asks before it enters reviewer mode, offers that mode first, and on that
// answer resolves the PR's scope in the checkout it was invoked in, which already sits at the PR
// head) or `own` (the gh user authored it: no offer, and a plain branch review with no PR calls).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const field = (output, name) => (output.match(new RegExp(`^\\W*${name}\\W*:[\\s*]*(.*)$`, 'im')) || [, ''])[1].trim();

export default (output, context) => {
  const checkout = path.resolve(ROOT, context.vars.checkout);
  const pr = String(context.vars.pr);
  const own = context.vars.expect === 'own';
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
  const calls = (context.providerResponse?.metadata?.toolCalls || []).filter((c) => !c.parentToolUseId);
  const failures = [];
  const check = (ok, msg) => {
    if (!ok) failures.push(msg);
    return ok;
  };

  const log = path.resolve(ROOT, path.dirname(context.vars.gh), '..', 'gh-calls.log');
  // Other tests share the log, so only the calls made in this checkout count.
  const ghCalls = (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n') : []).filter((l) => l.endsWith(` # in ${checkout}`));
  check(ghCalls.some((l) => /^pr view(?!\s+\d)/.test(l)), 'gh was never asked for the branch\'s own PR (`gh pr view` with no number)');
  check(ghCalls.some((l) => /^api user\b/.test(l)), 'the gh user was never asked for');

  const prNamed = (o) => new RegExp(`#?${pr}\\b`).test(`${o.label} ${o.description ?? ''}`);
  const offers = calls
    .filter((c) => c.name === 'AskUserQuestion')
    .flatMap((c) => c.input?.questions || [])
    .filter((q) => (q.options || []).some((o) => /reviewer/i.test(`${o.label} ${o.description ?? ''}`) || (/review/i.test(o.label) && prNamed(o))));
  const files = field(output, 'files');
  for (const f of ['src/billing-window.ts', 'src/order-sync.ts']) check(files.includes(f), `${f} is not in the list: ${files}`);
  check(!files.includes('src/pricing.ts'), `a base file leaked into the list: ${files}`);

  if (own) {
    check(offers.length === 0, `reviewer mode was offered on the user's own PR: ${offers.map((q) => q.options.map((o) => o.label).join(' | ')).join('; ')}`);
    const prOnly = ghCalls.filter((l) => /^pr view\s+\d/.test(l) || /^api\s+\/?repos\//.test(l));
    check(prOnly.length === 0, `reviewer-mode gh calls ran: ${prOnly.join('; ')}`);
    const bash = calls.filter((c) => c.name === 'Bash').map((c) => String(c.input?.command ?? ''));
    check(!bash.some((b) => /pull\/\d+\/head/.test(b)), 'the PR head was fetched as for --pr');
    check(/^none\b/i.test(field(output, 'PR')), `the review is reported as a PR review: PR: ${field(output, 'PR')}`);
    check(field(output, 'mode') === 'own', `mode is '${field(output, 'mode')}', expected own`);
  } else if (check(offers.length === 1, `expected one question offering reviewer mode on PR #${pr}, got ${offers.length}`)) {
    const [first, ...rest] = offers[0].options;
    check(new RegExp(`#?${pr}\\b`).test(first.label) && /review/i.test(first.label), `the first option is not the reviewer mode: "${first.label}"`);
    check(/recommended/i.test(first.label), `the reviewer option is not marked as the default: "${first.label}"`);
    check(rest.some((o) => /local/i.test(o.label)), `no option to review the local changes instead: ${rest.map((o) => o.label).join(' | ')}`);
  }
  if (!own) {
    check(new RegExp(`^\\W*PR\\W*:[\\s*]*#?${pr}\\b`, 'im').test(output), `no PR line naming #${pr}`);
    check(field(output, 'mode') === 'reviewer', `mode is '${field(output, 'mode')}', expected reviewer`);
    check(field(output, 'base').includes('origin/main'), `the base passed to the script is not origin/main: ${field(output, 'base')}`);
  }
  const reviewed = field(output, 'checkout reviewed');
  check(reviewed && path.resolve(ROOT, reviewed) === checkout, `the review ran in '${reviewed}', not the checkout already at the PR head`);

  check(git('branch', '--show-current') === context.vars.branch, 'the checkout left its branch');
  check(git('status', '--porcelain') === '', 'the checkout was edited');
  check(!fs.existsSync(`${checkout}.worktrees`), 'a worktree was added although the checkout is at the PR head');
  check(!calls.some((c) => c.name === 'Agent'), 'Step 1 dispatched an agent');

  return { pass: failures.length === 0, score: failures.length === 0 ? 1 : 0, reason: failures.join('; ') || 'all checks passed' };
};
