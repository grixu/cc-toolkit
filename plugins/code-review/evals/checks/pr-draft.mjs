// start-cr reviewer mode on someone else's PR, from Step 1 through the draft and its closing
// question: the review request body the run drafts, and when (if ever) it reaches the gh stand-in.
// Each named export is one promptfoo javascript assert, `file://checks/pr-draft.mjs:<name>`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerOf } from './menu-and-commits.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason });
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
const LABEL = /^\s*(?:\*\*)?(issue|suggestion|nitpick)(?:\s*\([^)]*\))?(?:\*\*)?\s*:/i;

const topCalls = (context) => (context.providerResponse?.metadata?.toolCalls || []).filter((c) => !c.parentToolUseId);
const parse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const state = (context) => {
  const { checkout, pr, gh, context: ctx } = context.vars;
  const repo = path.resolve(ROOT, checkout);
  const scope = JSON.parse(fs.readFileSync(path.resolve(ROOT, ctx, 'scope.json'), 'utf8'));
  const head = git(repo, 'ls-remote', 'origin', `refs/pull/${pr}/head`).split(/\s+/)[0];
  const sandbox = path.resolve(ROOT, path.dirname(gh), '..');
  const posted = path.join(sandbox, `gh-posted-${pr}.json`);
  const calls = topCalls(context);
  const ask = calls.findIndex((c) => c.name === 'AskUserQuestion');
  const drafts = calls.map((c, i) => ({ i, file: c.input?.file_path, json: draftJson(c) })).filter((d) => d.json);
  const draft = drafts.filter(({ i }) => ask < 0 || i < ask).at(-1) ?? drafts.at(-1);
  // What was posted is what GitHub would get; otherwise the draft file as it stands on disk.
  const onDisk = draft?.file && fs.existsSync(draft.file) ? parse(fs.readFileSync(draft.file, 'utf8')) : null;
  const body = fs.existsSync(posted) ? parse(fs.readFileSync(posted, 'utf8')) : onDisk ?? draft?.json ?? null;
  return { repo, scope, head, posted, calls, ask, draft, body, worktree: scope.checkout };
};

// A draft is written with the Write tool or a shell heredoc; either carries the JSON body.
function draftJson(c) {
  const raw = c.name === 'Write' ? c.input?.content : c.name === 'Bash' ? c.input?.command : null;
  if (!raw || !/"commit_id"/.test(raw)) return null;
  const json = c.name === 'Write' ? parse(raw) : parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  return json?.commit_id !== undefined ? json : null;
}

// Head-side line ranges of each hunk, as `git diff` prints them with its default context.
const hunks = (st, file) =>
  [...git(st.repo, 'diff', `${st.scope.base}..${st.head}`, '--', file).matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)].map((m) => {
    const start = Number(m[1]);
    return [start, start + (m[2] === undefined ? 1 : Number(m[2])) - 1];
  });

export function draftPayload(output, context) {
  const st = state(context);
  if (!st.body) return result(false, 'no review request body was drafted');
  const bad = [];
  if (st.body.commit_id !== st.head) bad.push(`commit_id ${st.body.commit_id} is not the PR head ${st.head}`);
  if (st.body.event !== 'COMMENT') bad.push(`event is ${st.body.event}`);
  if (!Array.isArray(st.body.comments) || !st.body.comments.length) bad.push('no inline comments');
  for (const c of st.body.comments || []) {
    if (c.side !== 'RIGHT') bad.push(`${c.path}:${c.line} has side ${c.side}`);
    if (c.start_line !== undefined && c.start_side !== 'RIGHT') bad.push(`${c.path}:${c.start_line}-${c.line} has start_side ${c.start_side}`);
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, `COMMENT on ${st.head} with ${st.body.comments.length} inline comment(s)`);
}

export function draftBeforeQuestion(output, context) {
  const st = state(context);
  if (st.ask < 0) return result(false, 'no closing AskUserQuestion');
  if (!st.draft) return result(false, 'no review request body was written to a file');
  return st.draft.i < st.ask ? result(true, `draft at ${st.draft.file ?? 'a heredoc'} before the question`) : result(false, 'the draft was written after the closing question');
}

export function commentsInHunks(output, context) {
  const st = state(context);
  if (!st.body?.comments) return result(false, 'no inline comments to place');
  const bad = [];
  for (const c of st.body.comments) {
    const ranges = hunks(st, c.path);
    const lo = c.start_line ?? c.line;
    if (!ranges.some(([a, b]) => lo >= a && c.line <= b)) bad.push(`${c.path}:${lo === c.line ? c.line : `${lo}-${c.line}`} (hunks ${ranges.map(([a, b]) => `${a}-${b}`).join(', ') || 'none'})`);
  }
  return bad.length ? result(false, `inline comments outside every head-side hunk: ${bad.join('; ')}`) : result(true, `${st.body.comments.length} inline comment(s), each inside a hunk`);
}

export function outsideHunkInBody(output, context) {
  const st = state(context);
  if (!st.body) return result(false, 'no review request body was drafted');
  const { file, quote } = context.vars.outside;
  const q = new RegExp(quote, 'i');
  const inline = (st.body.comments || []).filter((c) => c.path === file && q.test(c.body ?? ''));
  if (inline.length) return result(false, `the outside-hunk finding went inline at ${file}:${inline.map((c) => c.line).join(', ')}`);
  const text = st.body.body ?? '';
  return text.includes(file) && q.test(text) ? result(true, `the review body carries the ${file} finding`) : result(false, `the review body does not carry the ${file} finding /${quote}/ under its path`);
}

export function commentLabels(output, context) {
  const st = state(context);
  if (!st.body?.comments) return result(false, 'no inline comments');
  const bad = st.body.comments.filter((c) => !LABEL.test(c.body ?? '')).map((c) => `${c.path}:${c.line}`);
  const { file, mentions } = context.vars.high;
  const high = st.body.comments.filter((c) => c.path === file && new RegExp(mentions, 'i').test(c.body ?? ''));
  if (!high.length) bad.push(`no inline comment for the high finding in ${file}`);
  else if (!high.some((c) => /^\s*(?:\*\*)?issue\b/i.test(c.body))) bad.push(`the high finding opens with "${high[0].body.slice(0, 20)}", not issue:`);
  return bad.length ? result(false, `labels: ${bad.join('; ')}`) : result(true, 'every comment opens with a Conventional Comments label, the high one with issue:');
}

const postCalls = (st, pr) => st.calls.map((c, i) => ({ c, i })).filter(({ c }) => c.name === 'Bash' && new RegExp(`pulls/${pr}/reviews`).test(c.input?.command ?? '') && /POST/.test(c.input?.command ?? ''));

export function postOnlyAfterAnswer(output, context) {
  const st = state(context);
  const pr = String(context.vars.pr);
  const posts = postCalls(st, pr);
  const sent = fs.existsSync(st.posted);
  if (st.ask < 0) return sent || posts.length ? result(false, 'posted with no closing question') : result(false, 'no closing AskUserQuestion');
  const early = posts.filter(({ i }) => i < st.ask);
  if (early.length) return result(false, `POST issued before the closing question: ${early[0].c.input.command.slice(0, 120)}`);
  const question = st.calls[st.ask].input?.questions?.[0];
  const answer = question ? answerOf(st.calls[st.ask], question) : '';
  const wantsPost = /post/i.test(answer) && !/keep|don.t|do not/i.test(answer);
  if (wantsPost && !sent) return result(false, `"${answer}" was answered, yet nothing reached the gh stand-in`);
  if (!wantsPost && (sent || posts.length)) return result(false, `"${answer}" was answered, yet the review was posted`);
  return result(true, `"${answer}" answered; posted: ${sent}`);
}

export function nothingEdited(output, context) {
  const st = state(context);
  const bad = [];
  if (git(st.repo, 'rev-parse', '--abbrev-ref', 'HEAD') !== 'main') bad.push("the user's checkout left main");
  if (git(st.repo, 'status', '--porcelain')) bad.push("the user's checkout was edited");
  if (!fs.existsSync(st.worktree)) bad.push(`no worktree at ${st.worktree}`);
  else {
    if (git(st.worktree, 'rev-parse', 'HEAD') !== st.head) bad.push('the worktree moved off the PR head');
    if (git(st.worktree, 'status', '--porcelain')) bad.push('the worktree was edited');
  }
  const inRepo = (f) => [st.repo, st.worktree].some((d) => path.resolve(f ?? '').startsWith(d + path.sep));
  const mutating = st.calls.filter(
    (c) => (['Edit', 'Write'].includes(c.name) && inRepo(c.input?.file_path)) || (c.name === 'Bash' && /\bgit\b[^|;&]*\s(commit|push)\b/.test(c.input?.command ?? '')),
  );
  if (mutating.length) bad.push(`edited, committed or pushed: ${mutating.map((c) => c.input?.file_path ?? c.input?.command.slice(0, 80)).join(' | ')}`);
  return bad.length ? result(false, bad.join('; ')) : result(true, 'nothing edited, committed or pushed');
}

const SUGGESTION = /```suggestion[^\n]*\n([\s\S]*?)\n?```/;

// The one-line fix inside a hunk: its comment carries a suggestion block, and committing that block
// over the comment's lines gives the fixed line with everything else in the file unchanged.
export function suggestionBlock(output, context) {
  const st = state(context);
  if (!st.body?.comments) return result(false, 'no inline comments');
  const { file, line, fixed, defect } = context.vars.suggestion;
  const on = st.body.comments.filter((c) => c.path === file && (c.start_line ?? c.line) <= line && line <= c.line);
  const withBlock = on.find((c) => SUGGESTION.test(c.body ?? ''));
  if (!withBlock) return result(false, `no suggestion block on ${file}:${line} (${on.length} comment(s) there)`);
  const before = git(st.repo, 'show', `${st.head}:${file}`).split('\n');
  const lo = withBlock.start_line ?? withBlock.line;
  const block = withBlock.body.match(SUGGESTION)[1].split('\n');
  const after = [...before.slice(0, lo - 1), ...block, ...before.slice(withBlock.line)];
  const where = `${file}:${lo === withBlock.line ? lo : `${lo}-${withBlock.line}`}`;
  if (new RegExp(defect).test(after.join('\n'))) return result(false, `committing the suggestion on ${where} leaves /${defect}/ in the file`);
  if (!after.some((l) => l.includes(fixed))) return result(false, `committing the suggestion on ${where} does not give "${fixed}"`);
  // A block that spans more lines than its comment duplicates its neighbours; an added comment line is fine.
  const code = (ls) => ls.filter((l) => l.trim() && !/^\s*\/\//.test(l)).map((l) => l.trim());
  const expected = code(before.map((l, i) => (i === line - 1 ? fixed : l)));
  const got = code(after);
  const stray = got.length !== expected.length || got.some((l, i) => l !== expected[i] && !l.includes(fixed));
  return stray ? result(false, `committing the suggestion on ${where} changes more than the fixed line`) : result(true, `${where} carries a suggestion that commits the fix`);
}

// A fix that needs a line outside the commented range, so a suggestion committed alone would break the file.
export function noSuggestionMultiSite(output, context) {
  const st = state(context);
  if (!st.body?.comments) return result(false, 'no inline comments');
  const { file, mentions } = context.vars.multiSite;
  const hits = st.body.comments.filter((c) => c.path === file && new RegExp(mentions, 'i').test(c.body ?? ''));
  if (!hits.length) return result(false, `no inline comment in ${file} matching /${mentions}/`);
  const bad = hits.filter((c) => SUGGESTION.test(c.body));
  return bad.length ? result(false, `${file}:${bad.map((c) => c.line).join(', ')} carries a suggestion block for a fix that needs a line outside its range`) : result(true, `${file}: the multi-site fix stays in prose`);
}
