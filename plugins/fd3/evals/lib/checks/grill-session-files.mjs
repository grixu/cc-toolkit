import path from 'node:path';
import * as h from '../helpers.mjs';

const SCENARIO = 'grill-session-files';
const LEDGER = /(^|\/)notes\/question-ledger\.md$/;
const PRIOR = /(^|\/)research\/prior-conversation\.md$/;

const unquote = (s) => s.replace(/^(["'])(.*)\1$/, '$2');

// Shell-level targets only: `>`/`>>` redirections and `tee`, with `VAR=` and `cd` tracked within the
// one command. Heredoc bodies are skipped, since a markdown blockquote line starts with `>`.
export function bashWriteTargets(command, cwd) {
  const vars = {};
  let dir = cwd;
  const out = [];
  const expand = (s) =>
    unquote(s).replace(/\$\{?([A-Za-z_]\w*)\}?/g, (m, v) => (v === 'PWD' ? dir : vars[v] ?? m));
  const resolve = (p) => (/^[$~]/.test(p) ? p : path.resolve(dir, p));
  let heredoc = null;
  for (const line of String(command || '').split('\n')) {
    if (heredoc) {
      if (line.trim() === heredoc) heredoc = null;
      continue;
    }
    const start = /<<-?\s*(["']?)(\w+)\1/.exec(line);
    for (const segment of line.split(/;|&&|\|\|?/)) {
      const cd = /^\s*cd\s+(\S+)/.exec(segment);
      if (cd) dir = resolve(expand(cd[1]));
      for (const m of segment.matchAll(/(?:^|\s)(?:export\s+)?([A-Za-z_]\w*)=("[^"]*"|'[^']*'|[^\s"']+)/g)) vars[m[1]] = expand(m[2]);
      // A `>` inside a quoted argument (`echo "$h -> $code"`) redirects nothing.
      const bare = segment.replace(/(>{1,2}\s*|\btee\s+(?:-a\s+)?)?("[^"]*"|'[^']*')/g, (m, op) => (op ? m : '""'));
      for (const m of bare.matchAll(/(?:^|[^\d&>])>{1,2}\s*("[^"]*"|'[^']*'|[^\s<>&|)]+)/g)) {
        const target = expand(m[1]);
        if (!target.startsWith('/dev/')) out.push(resolve(target));
      }
      for (const m of bare.matchAll(/\btee\s+(?:-a\s+)?("[^"]*"|'[^']*'|[^\s<>&|)]+)/g)) out.push(resolve(expand(m[1])));
    }
    if (start) heredoc = start[2];
  }
  return out;
}

export function writtenPaths(toolCalls, cwd) {
  const out = [];
  for (const t of toolCalls || []) {
    if (t.is_error) continue;
    if ((t.name === 'Write' || t.name === 'Edit') && t.input?.file_path) out.push(path.resolve(cwd, t.input.file_path));
    if (t.name === 'Bash' && typeof t.input?.command === 'string') out.push(...bashWriteTargets(t.input.command, cwd));
  }
  return [...new Set(out)];
}

// No spec exists yet, so the grilling has nowhere in the repository to keep its files: the ledger
// and the prior-conversation record live in the session scratchpad, and the repository stays as the
// fixture left it. The prior-conversation record is owed only when something preceded the command,
// and this scenario's prompt is the bare command, so only its placement is graded.
export function sessionFileFailures(toolCalls, sandbox) {
  const out = [];
  const written = writtenPaths(toolCalls, sandbox);
  const inRepo = (p) => p === sandbox || p.startsWith(`${sandbox}${path.sep}`);
  for (const [re, name, required] of [
    [LEDGER, 'notes/question-ledger.md', true],
    [PRIOR, 'research/prior-conversation.md', false],
  ]) {
    const hits = written.filter((p) => re.test(p));
    if (hits.length === 0) {
      if (required) out.push(`no ${name} was written`);
    }
    else if (!hits.some((p) => !inRepo(p))) out.push(`${name} was written only inside the repository: ${hits.join(', ')}`);
  }
  const stray = written.filter(inRepo).map((p) => path.relative(sandbox, p));
  if (stray.length) out.push(`session files written inside the repository: ${stray.join(', ')}`);
  return out;
}

export default (output, context) => {
  const c = h.checker();

  const numbered = /^\s{0,3}(?:#{1,4}\s+)?(?:\*\*)?Q?\d+[.)]\s/m.test(output);
  c.check(numbered || h.askedThroughTool(context), 'no round of questions — the grilling half never ran');

  const sandbox = h.sandboxDir(SCENARIO);
  for (const failure of sessionFileFailures(context?.providerResponse?.metadata?.toolCalls, sandbox)) c.check(false, failure);

  const diff = h.diffSandbox(SCENARIO, 'retry-topic');
  c.check(diff.added.length === 0, `files added to the repository: ${diff.added.join(', ')}`);
  c.check(diff.modified.length === 0, `fixture files modified: ${diff.modified.join(', ')}`);

  return c.verdict();
};
