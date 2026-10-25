// start-cr Step 1 with no arguments over a branch that has committed and uncommitted changes:
// whether the Committed/Uncommitted/Both question is asked, and the scope the run settles on.
// vars.expect is `skip` (the uncommitted side holds only skipped kinds: no question, committed
// scope, those files named as skipped) or `ask` (a judged file on each side: the question is due).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const text = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));
const field = (output, name) => (output.match(new RegExp(`^\\W*${name}\\W*:[\\s*]*(.*)$`, 'im')) || [, ''])[1].trim();

// The scope question is the one whose options offer the uncommitted side.
const scopeQuestions = (calls) =>
  calls
    .filter((c) => c.name === 'AskUserQuestion')
    .flatMap((c) => (c.input?.questions || []).map((q) => ({ call: c, q })))
    .filter(({ q }) => (q.options || []).some((o) => /\buncommitted\b/i.test(o.label)));

const answered = (call, q) => {
  const esc = q.question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text(call.output).match(new RegExp(`"${esc}"="([^"]*)"`)) || [, q.options?.[0]?.label ?? ''])[1];
};
const scopeOf = (label) => (/both/i.test(label) ? 'both' : /uncommitted/i.test(label) ? 'uncommitted' : /committed/i.test(label) ? 'committed' : null);

export default (output, context) => {
  const checkout = path.resolve(ROOT, context.vars.checkout);
  const calls = (context.providerResponse?.metadata?.toolCalls || []).filter((c) => !c.parentToolUseId);
  const failures = [];
  const check = (ok, msg) => {
    if (!ok) failures.push(msg);
    return ok;
  };

  const asked = scopeQuestions(calls);
  const scope = field(output, 'scope').toLowerCase();
  const files = field(output, 'files');
  const skipped = field(output, 'skipped');
  const skippedKinds = ['CLAUDE.md', 'docs/notes.md', '.claude/settings.json'];

  if (context.vars.expect === 'skip') {
    check(asked.length === 0, `the scope question was asked: ${asked.map(({ q }) => q.options.map((o) => o.label).join(' | ')).join('; ')}`);
    check(scope === 'committed', `scope is '${scope}', expected committed`);
    check(files.includes('src/order-service.ts'), `the committed source file is not judged: ${files}`);
    for (const f of skippedKinds) {
      check(!files.split(/,\s*/).includes(f), `${f} is listed as judged`);
      check(skipped.includes(f), `${f} is not named as skipped: ${skipped}`);
    }
  } else {
    if (check(asked.length === 1, `expected one scope question, got ${asked.length}`)) {
      const { call, q } = asked[0];
      const labels = (q.options || []).map((o) => o.label);
      check(labels.some((l) => scopeOf(l) === 'committed') && labels.some((l) => scopeOf(l) === 'both'), `the question does not offer all three scopes: ${labels.join(' | ')}`);
      const want = scopeOf(answered(call, q));
      check(scope === want, `scope is '${scope}', but the answer was '${answered(call, q)}'`);
    }
    if (scope !== 'committed') check(files.includes('src/discount-limits.ts'), `the uncommitted source file is not judged: ${files}`);
  }

  check(!calls.some((c) => c.name === 'Agent'), 'Step 1 dispatched an agent');
  const status = execFileSync('git', ['-C', checkout, 'status', '--porcelain'], { encoding: 'utf8' }).trimEnd();
  const expected = [' M CLAUDE.md', '?? .claude/', '?? docs/', ...(context.vars.expect === 'skip' ? [] : ['?? src/discount-limits.ts'])].join('\n');
  check(status === expected, `the checkout's working tree changed: ${JSON.stringify(status)}`);
  const branch = execFileSync('git', ['-C', checkout, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
  check(branch === 'feat/order-discount', `the checkout left its branch for '${branch}'`);

  return { pass: failures.length === 0, score: failures.length === 0 ? 1 : 0, reason: failures.join('; ') || 'all checks passed' };
};
