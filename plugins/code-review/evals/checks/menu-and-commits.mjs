// start-cr Steps 4–7 from a context directory whose lens files are already written: the apply menu
// the run composes, the report it puts on disk first, and the commits the chosen mode leaves behind.
// Each named export is one promptfoo javascript assert, `file://checks/menu-and-commits.mjs:<name>`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason });
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
const lines = (s) => s.split('\n').filter(Boolean);
// promptfoo expands a top-level array var into one test per element, so one file arrives as a bare string.
const userFiles = (context) => [].concat(context.vars.userFiles ?? []);
const text = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));

const topCalls = (context) => (context.providerResponse?.metadata?.toolCalls || []).filter((c) => !c.parentToolUseId);
const menuIndex = (calls) => calls.findIndex((c) => c.name === 'AskUserQuestion');
const optionText = (o) => `${o.label} ${o.description ?? ''}`;

// promptfoo's `first_option` answers every question with its first option; the tool result names it.
export const answerOf = (call, question) => {
  const out = text(call.output);
  const esc = question.question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = out.match(new RegExp(`"${esc}"="([^"]*)"`));
  return m ? m[1] : question.options?.[0]?.label ?? '';
};

const menu = (context) => {
  const calls = topCalls(context);
  const i = menuIndex(calls);
  if (i < 0) return null;
  const call = calls[i];
  const questions = call.input?.questions || [];
  const commit = questions.slice(1).find((q) => (q.options || []).some((o) => /\bcommit/i.test(optionText(o))));
  return { calls, i, call, apply: questions[0], commit };
};

const setup = (context) => {
  const checkout = path.resolve(ROOT, context.vars.checkout);
  const ctx = path.resolve(ROOT, context.vars.context);
  const scope = JSON.parse(fs.readFileSync(path.join(ctx, 'scope.json'), 'utf8'));
  const before = fs.readFileSync(path.resolve(ROOT, context.vars.head), 'utf8').trim();
  return { checkout, scope, before };
};

const bucketOf = (option, buckets) =>
  buckets.find((b) => new RegExp(b.match, 'i').test(option.label)) ?? buckets.find((b) => new RegExp(b.match, 'i').test(optionText(option)));
const modeOf = (label) =>
  /fixup/i.test(label) ? 'fixup' : /famil/i.test(label) ? 'family' : /\bone commit|single commit/i.test(label) ? 'one' : /leave|uncommitted|don.t commit/i.test(label) ? 'leave' : null;

export function menuSlots(output, context) {
  const m = menu(context);
  if (!m?.apply) return result(false, 'no AskUserQuestion apply menu');
  const opts = m.apply.options || [];
  if (opts.length > 4) return result(false, `the apply question has ${opts.length} options`);
  if (!opts.some((o) => /report only/i.test(o.label))) return result(false, `no Report only option: ${opts.map((o) => o.label).join(' | ')}`);
  return result(true, `${opts.length} options: ${opts.map((o) => o.label).join(' | ')}`);
}

export function rulelessOption(output, context) {
  const m = menu(context);
  if (!m?.apply) return result(false, 'no AskUserQuestion apply menu');
  const opts = m.apply.options || [];
  const own = opts.filter((o) => new RegExp(context.vars.ruleless, 'i').test(optionText(o)));
  if (!own.length) return result(false, `no option names the rule-less defect /${context.vars.ruleless}/: ${opts.map((o) => o.label).join(' | ')}`);
  const folded = own.filter((o) => /safe|boy-?scout|report only|structural/i.test(o.label));
  if (folded.length === own.length) return result(false, `the rule-less defect rides inside a bucket: ${own.map((o) => o.label).join(' | ')}`);
  return result(true, `own option: ${own.find((o) => !folded.includes(o)).label}`);
}

export function boyScoutDropped(output, context) {
  const m = menu(context);
  if (!m?.apply) return result(false, 'no AskUserQuestion apply menu');
  const labels = (m.apply.options || []).map((o) => o.label);
  const bad = [];
  if (labels.some((l) => /boy-?scout/i.test(l))) bad.push('Boy-scout extras took a slot');
  if (!labels.some((l) => /safe/i.test(l))) bad.push('no Safe fixes option');
  if (!labels.some((l) => /structural|walk/i.test(l))) bad.push('no structural walk option');
  return bad.length ? result(false, `${bad.join('; ')}: ${labels.join(' | ')}`) : result(true, `boy-scout is the bucket left out: ${labels.join(' | ')}`);
}

export function commitModeQuestion(output, context) {
  const m = menu(context);
  if (!m?.apply) return result(false, 'no AskUserQuestion apply menu');
  if (!m.commit) return result(false, `the menu call carries no commit-mode question: ${(m.call.input?.questions || []).map((q) => q.question).join(' | ')}`);
  if (m.commit.multiSelect) return result(false, 'the commit-mode question is multiSelect');
  const labels = m.commit.options.map((o) => o.label);
  const modes = labels.map(modeOf);
  const missing = ['family', 'one', 'leave'].filter((x) => !modes.includes(x));
  if (missing.length) return result(false, `commit modes missing ${missing.join(', ')}: ${labels.join(' | ')}`);
  const { checkout, scope, before } = setup(context);
  const own = Number(git(checkout, 'rev-list', '--count', `${scope.base}..${before}`));
  if (modes.includes('fixup') && own === 0) return result(false, 'Fixup offered on a branch with no commits above the base');
  return result(true, `commit modes: ${labels.join(' | ')} (branch commits above base: ${own})`);
}

export function reportBeforeMenu(output, context) {
  const m = menu(context);
  if (!m) return result(false, 'no AskUserQuestion apply menu');
  const { checkout } = setup(context);
  const writes = m.calls.slice(0, m.i).filter((c) => c.name === 'Write' && /\*\*Tally:\*\*/.test(c.input?.content ?? ''));
  if (!writes.length) return result(false, 'no Write of the rendered report before the menu');
  const inside = writes.filter((c) => path.resolve(c.input.file_path).startsWith(checkout + path.sep));
  if (inside.length === writes.length) return result(false, `the report was written inside the checkout: ${inside[0].input.file_path}`);
  return result(true, `report on disk before the menu: ${writes.find((c) => !inside.includes(c)).input.file_path}`);
}

export function selectionOnDisk(output, context) {
  const m = menu(context);
  if (!m) return result(false, 'no AskUserQuestion apply menu');
  const { checkout } = setup(context);
  const report = m.calls.slice(0, m.i).filter((c) => c.name === 'Write' && /\*\*Tally:\*\*/.test(c.input?.content ?? '')).at(-1)?.input.file_path;
  if (!report) return result(false, 'no report file to record the selection in');
  const after = m.calls.slice(m.i + 1);
  const firstRepoEdit = after.findIndex((c) => ['Edit', 'Write'].includes(c.name) && path.resolve(c.input?.file_path ?? '').startsWith(checkout + path.sep));
  const upto = firstRepoEdit < 0 ? after : after.slice(0, firstRepoEdit);
  const recorded = upto.some((c) => ['Edit', 'Write'].includes(c.name) && path.resolve(c.input?.file_path ?? '') === path.resolve(report));
  return recorded ? result(true, `selection recorded in ${report} before the first edit`) : result(false, `the selection never reached ${report} before the apply phase began`);
}

const runState = (context) => {
  const { checkout, before } = setup(context);
  const commits = lines(git(checkout, 'rev-list', '--reverse', `${before}..HEAD`)).map((sha) => ({
    sha,
    subject: git(checkout, 'log', '-1', '--format=%s', sha),
    message: git(checkout, 'log', '-1', '--format=%B', sha),
    files: lines(git(checkout, 'show', '--name-only', '--format=', sha)),
  }));
  const status = lines(git(checkout, 'status', '--porcelain', '--untracked-files=all'));
  const changed = new Set([...lines(git(checkout, 'diff', '--name-only', before)), ...status.filter((l) => l.startsWith('??')).map((l) => l.slice(3))]);
  for (const f of userFiles(context)) changed.delete(f);
  return { checkout, before, commits, status, changed: [...changed] };
};

export function onlySelectedApplied(output, context) {
  const m = menu(context);
  if (!m?.apply) return result(false, 'no AskUserQuestion apply menu');
  const picked = answerOf(m.call, m.apply);
  const bucket = bucketOf(m.apply.options.find((o) => o.label === picked) ?? { label: picked }, context.vars.buckets);
  if (!bucket) return result(false, `the first option "${picked}" matches no seeded bucket`);
  const { changed } = runState(context);
  const extra = changed.filter((f) => !bucket.files.includes(f));
  if (extra.length) return result(false, `"${picked}" was picked, yet the run also changed ${extra.join(', ')}`);
  const untouched = bucket.files.filter((f) => !changed.includes(f));
  if (untouched.length) return result(false, `"${picked}" was picked, yet the run left ${untouched.join(', ')} unchanged`);
  return result(true, `"${picked}" changed ${changed.join(', ') || 'nothing'}`);
}

export function commitsMatchMode(output, context) {
  const m = menu(context);
  if (!m?.apply || !m.commit) return result(false, 'no apply menu with a commit-mode question');
  const picked = answerOf(m.call, m.apply);
  const mode = modeOf(answerOf(m.call, m.commit));
  const { checkout, before, commits, status, changed } = runState(context);
  const families = context.vars.families;
  const uncommitted = status.filter((l) => !userFiles(context).includes(l.slice(3)));
  const summary = `"${picked}", mode ${mode}, ${commits.length} commit(s)`;
  if (/report only/i.test(picked)) {
    return commits.length || uncommitted.length ? result(false, `${summary}, yet the tree moved: ${uncommitted.join(', ')}`) : result(true, `${summary}; nothing applied, nothing committed`);
  }
  // A fix bucket that applied nothing would otherwise satisfy every mode vacuously.
  if (!changed.length) return result(false, `${summary}; a fix bucket was picked, yet nothing was applied`);
  if (mode === 'leave') return commits.length ? result(false, `${summary} under Leave uncommitted`) : result(true, `${summary}; edits left in the tree`);
  if (uncommitted.length) return result(false, `${summary}; still uncommitted: ${uncommitted.join(', ')}`);
  if (mode === 'one') return commits.length === 1 ? result(true, summary) : result(false, `${summary} under One commit`);
  if (mode === 'fixup') {
    const branch = new Set(lines(git(checkout, 'log', '--format=%s', `${setup(context).scope.base}..${before}`)));
    const bad = commits.filter((c) => !c.subject.startsWith('fixup! ') || !branch.has(c.subject.slice(7)));
    return bad.length ? result(false, `${summary}; not a fixup of a branch commit: ${bad.map((c) => c.subject).join(' | ')}`) : result(true, summary);
  }
  if (mode === 'family') {
    const bad = [];
    for (const c of commits) {
      const fams = new Set(c.files.map((f) => families[f] ?? `unmapped ${f}`));
      if (fams.size !== 1) bad.push(`${c.subject} mixes ${[...fams].join(' + ')}`);
    }
    const committed = new Set(commits.flatMap((c) => c.files.map((f) => families[f])));
    for (const fam of new Set(changed.map((f) => families[f]))) if (!committed.has(fam)) bad.push(`no commit for ${fam}`);
    return bad.length ? result(false, `${summary}; ${bad.join('; ')}`) : result(true, `${summary}, one family each`);
  }
  return result(false, `${summary}; the commit-mode answer names no known mode`);
}

export function commitMessages(output, context) {
  const { commits } = runState(context);
  const bad = commits.filter((c) => /address\w*\s+(the\s+)?(code[- ]?)?review|review (findings|fixes|feedback|comments)/i.test(c.message));
  return bad.length ? result(false, `messages about the review, not the change: ${bad.map((c) => c.subject).join(' | ')}`) : result(true, `${commits.length} commit message(s) describe the change`);
}

export function userFilesUntouched(output, context) {
  const { checkout, before, commits, status } = runState(context);
  const bad = [];
  for (const f of userFiles(context)) {
    if (!status.includes(`?? ${f}`)) bad.push(`${f} is no longer untracked`);
    if (commits.some((c) => c.files.includes(f))) bad.push(`${f} was committed`);
  }
  if (git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD') !== context.vars.branch) bad.push('the checkout left its branch');
  try {
    git(checkout, 'merge-base', '--is-ancestor', before, 'HEAD');
  } catch {
    bad.push('the branch history before the review was rewritten');
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, "the user's own files stayed out of every commit");
}
