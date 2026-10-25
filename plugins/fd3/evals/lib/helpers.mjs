import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVALS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The one central place that skips `.git/`: the reset script initialises repos inside
// sandboxes that the pristine fixtures do not have, so a naive recursive diff always fires.
// DEFECTS.md is fixture documentation and SETUP.sh fixture tooling; neither reaches the sandbox.
const SKIP = new Set(['.git', 'DEFECTS.md', 'SETUP.sh']);

export function sandboxDir(scenario) {
  return path.join(EVALS_DIR, '.sandbox', scenario);
}

export function fixtureDir(name) {
  return path.join(EVALS_DIR, 'fixtures', name);
}

export function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out.sort();
}

// Compare a sandbox against its pristine fixture: which files appeared, changed, vanished.
export function diffSandbox(scenario, fixture) {
  const sb = sandboxDir(scenario);
  const fx = fixtureDir(fixture);
  const sbFiles = listFiles(sb);
  const fxFiles = listFiles(fx);
  const fxSet = new Set(fxFiles);
  const sbSet = new Set(sbFiles);
  const added = sbFiles.filter((f) => !fxSet.has(f));
  const removed = fxFiles.filter((f) => !sbSet.has(f));
  const modified = fxFiles.filter(
    (f) =>
      sbSet.has(f) &&
      !fs.readFileSync(path.join(sb, f)).equals(fs.readFileSync(path.join(fx, f)))
  );
  return { added, removed, modified };
}

export function readSandboxFile(scenario, rel) {
  const p = path.join(sandboxDir(scenario), rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

export function readFixtureFile(fixture, rel) {
  const p = path.join(fixtureDir(fixture), rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// Minimal YAML-subset frontmatter parser: `key: value`, `key: [a, b]`, `key:` (empty),
// and indented `- item` lists. Enough for the task-file contract; not a YAML library.
export function parseFrontmatter(content) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!m) return null;
  const fm = {};
  let lastKey = null;
  for (const rawLine of m[1].split(/\r?\n/)) {
    const listItem = /^\s+-\s*(.*)$/.exec(rawLine);
    if (listItem && lastKey) {
      if (!Array.isArray(fm[lastKey])) fm[lastKey] = [];
      fm[lastKey].push(stripQuotes(listItem[1]));
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(rawLine);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    lastKey = key;
    const val = rawVal.trim();
    if (val === '') fm[key] = '';
    else if (val.startsWith('[')) {
      const inner = val.replace(/^\[|\]$/g, '').trim();
      fm[key] = inner === '' ? [] : inner.split(',').map((s) => stripQuotes(s.trim()));
    } else fm[key] = stripQuotes(val);
  }
  return fm;
}

function stripQuotes(s) {
  return s.replace(/^['"]|['"]$/g, '');
}

function taskBody(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
}

export function readTasks(scenario, rel = 'spec/tasks') {
  return readTasksDir(path.join(sandboxDir(scenario), rel));
}

export function readTasksDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      // Task files are named <NNNN>-<slug>.md; the ordinal lives only in the filename,
      // so the slug (what depends-on edges reference) is the name minus the prefix.
      const slug = f.replace(/\.md$/, '').replace(/^\d{4}-/, '');
      return { file: f, slug, fm: parseFrontmatter(content), body: taskBody(content), content };
    });
}

// A literal phrase regex fails on a hard line wrap, a hyphenated compound (`phase-2`) or emphasis
// inside the phrase; match prose only after this.
export function normalizeProse(text) {
  return String(text || '')
    .replace(/[*_`]/g, '')
    .replace(/(\w)[-‐-—](?=\w)/g, '$1 ')
    .replace(/\s+/g, ' ');
}

const NEGATOR = /\b(?:no|not|nothing|never|without|none)\b|n't\b/i;

// Negated when one of the three words before the match, inside its clause, negates it: "nothing to
// confirm before writing" is the rule being followed, "confirm before writing" the rule broken.
export function negatedAt(text, index) {
  const clause = text.slice(0, index).split(/[.;:!?\n]/).pop();
  return NEGATOR.test(clause.trim().split(/\s+/).slice(-3).join(' '));
}

export function affirmedMatches(text, re) {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return [...String(text || '').matchAll(global)].filter((m) => !negatedAt(text, m.index));
}

export function headings(markdown) {
  return (markdown.match(/^#{1,6}\s.*$/gm) || []).map((h) => h.trim());
}

// Collects failures; verdict() folds them into promptfoo's GradingResult shape.
export function checker() {
  const failures = [];
  return {
    check(cond, label) {
      if (!cond) failures.push(label);
      return !!cond;
    },
    verdict() {
      return failures.length === 0
        ? { pass: true, score: 1, reason: 'all checks passed' }
        : { pass: false, score: 0, reason: failures.join('; ') };
    },
  };
}

const CHECKS_TABLE_ROWS = 12;

export function checksTableComplete(output) {
  for (let i = 1; i <= CHECKS_TABLE_ROWS; i += 1) {
    if (!new RegExp('^\\|\\s*' + i + '\\s*\\|', 'm').test(output)) return false;
  }
  return true;
}

// Check 9 is the one check whose evidence lives outside the spec, so it has its own two passing
// spellings: it ran and holds, or an earlier fail closed. `pass (unchanged)` reports the document
// rather than the lookup, and a bare `pass` is not a form validation-report.md sanctions at all.
const CHECK_NINE_PASSED = /^\|\s*9\s*\|[^\n|]*\|\s*pass\s*\((verified|was fail)\b/im;

export function checksTableAllPass(output) {
  for (let i = 1; i <= CHECKS_TABLE_ROWS; i += 1) {
    if (!new RegExp('^\\|\\s*' + i + '\\s*\\|[^\\n|]*\\|\\s*pass\\b', 'im').test(output)) return false;
  }
  return CHECK_NINE_PASSED.test(output);
}

export function section(output, heading) {
  const re = new RegExp('^##\\s+' + heading + '\\s*$', 'im');
  const m = re.exec(output);
  if (!m) return null;
  const rest = output.slice(m.index + m[0].length);
  const next = /^##\s+/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

const ANSWER_AS = /(?:answer as|odpowiedz(?:cie)? jako|odpowied[zź] jako)\**\s*:\s*\**\s*(.*)$/i;
const LABEL = /^(?:[A-Z]\d*|\d+(?:\.\d+)*)$/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The last round in a message, read the way the user answers it: the labels its closing
// `Answer as:` line names, and for each numeric label the line that asks it. A question line
// carries its label after markup (`**3.1 —`, `## 2.`, `- **3.1`) or with a `.`/`)` after it, so a
// wrapped prose line that happens to start with a number is not one.
export function lastRound(output) {
  const lines = String(output || '').split('\n');
  let at = -1;
  lines.forEach((l, i) => {
    if (ANSWER_AS.test(l)) at = i;
  });
  if (at === -1) return null;
  const named = ANSWER_AS.exec(lines[at])[1]
    .replace(/\([^)]*\)/g, '')
    .replace(/[*`]/g, '')
    .split(/,|\band\b/)
    .map((x) => x.trim().replace(/\.$/, ''));
  const labels = named.filter((x) => LABEL.test(x));
  const lettered = named.filter((x) => /^\d+(?:\.\d+)*[a-z]$/.test(x));
  const questionLine = new Map();
  for (const label of labels.filter((x) => /^\d/.test(x))) {
    const marked = new RegExp(`^(?:\\s|&nbsp;|[-*+]\\s)*(?:#{1,4}\\s+|\\*\\*|Q)+${escapeRe(label)}(?![\\d]|\\.\\d)`);
    const punctuated = new RegExp(`^(?:\\s|&nbsp;|[-*+]\\s)*Q?${escapeRe(label)}[.)](?!\\d)`);
    for (let i = at - 1; i >= 0; i -= 1) {
      if (marked.test(lines[i]) || punctuated.test(lines[i])) {
        questionLine.set(label, i);
        break;
      }
    }
  }
  return { lines, at, labels, lettered, questionLine, tail: lines.slice(at + 1).join('\n').trim() };
}

const topLevel = (label) => parseInt(label, 10);

// The shape grill-topic gives a round: every label it closes with is a question it asks, each
// leaf question offers lettered options `a)`, `b)`, the numbers run without a hole the round's
// opening does not name, and the round is the last thing the message says.
export function roundShapeFailures(output) {
  const round = lastRound(output);
  if (!round) return ['the message closes no round with an "Answer as:" line'];
  const out = [];
  const numeric = round.labels.filter((x) => /^\d/.test(x));
  if (numeric.length < 2) out.push(`the closing "Answer as:" line names ${numeric.length} numbered question(s)`);
  const unasked = numeric.filter((x) => !round.questionLine.has(x));
  if (unasked.length) out.push(`"Answer as:" names ${unasked.join(', ')} but no numbered question in the round carries it`);
  if (round.lettered.length) out.push(`sub-questions ${round.lettered.join(', ')} carry letters, which belong to options: an answer like "3 a" has two readings`);
  if (round.tail.length > 300 || /\?/.test(round.tail)) out.push('the message goes on past the round\'s "Answer as:" line');

  const asked = numeric.filter((x) => round.questionLine.has(x)).sort((a, b) => round.questionLine.get(a) - round.questionLine.get(b));
  const starts = asked.map((x) => round.questionLine.get(x));
  for (const [i, label] of asked.entries()) {
    if (numeric.some((x) => x !== label && x.startsWith(`${label}.`))) continue;
    const block = round.lines.slice(starts[i] + 1, i + 1 < starts.length ? starts[i + 1] : round.at);
    const named = block.filter((l) => /^\s*[-*+]\s+(?:\*\*)?[a-z]\)/.test(l) || /^\s*[-*+]\s+\*\*/.test(l));
    const lettered = named.filter((l) => /^\s*[-*+]\s+(?:\*\*)?[a-z]\)/.test(l));
    if (lettered.length < 2) out.push(`question ${label} offers ${lettered.length} lettered option(s)`);
    if (named.length > lettered.length) out.push(`question ${label} has a named option without its letter`);
  }

  const opening = starts.length ? round.lines.slice(0, starts[0]).filter((l) => /open from earlier|blocked|carried/i.test(l)).join('\n') : '';
  const named = (n) =>
    new RegExp(`\\b${n}\\b`).test(opening) ||
    [...opening.matchAll(/(\d+)\s*[–-]\s*(\d+)/g)].some(([, a, b]) => Number(a) <= n && n <= Number(b));
  const ints = [...new Set(numeric.map(topLevel))].sort((a, b) => a - b);
  for (let n = ints[0]; ints.length && n < ints.at(-1); n += 1) {
    if (!ints.includes(n) && !named(n)) out.push(`the round skips question ${n} without naming it as blocked or carried over`);
  }
  if (!/recommend/i.test(round.lines.slice(starts[0] ?? 0, round.at).join('\n'))) out.push('no marked recommendation among the options');
  return out;
}

const unquote = (s) => s.replace(/^(["'])(.*)\1$/, '$2');

// Shell-level writes only: `>`/`>>` redirections and `tee`, with `VAR=` and `cd` tracked within the
// one command. A write fed by a heredoc carries its body; a markdown blockquote line in a heredoc
// starts with `>`, so bodies are never scanned for redirections.
export function bashWrites(command, cwd) {
  const vars = {};
  let dir = cwd;
  const out = [];
  const expand = (s) =>
    unquote(s).replace(/\$\{?([A-Za-z_]\w*)\}?/g, (m, v) => (v === 'PWD' ? dir : vars[v] ?? m));
  // Under a `cd $TMPDIR/...` the directory stays unexpanded; joining keeps `>` and `>>` to one
  // file on one key instead of rooting the relative one at this process's cwd.
  const resolve = (p) => (/^[$~]/.test(p) ? p : /^[$~]/.test(dir) ? path.join(dir, p) : path.resolve(dir, p));
  let heredoc = null;
  for (const line of String(command || '').split('\n')) {
    if (heredoc) {
      if (line.trim() === heredoc.end) {
        for (const w of heredoc.writes) w.body = heredoc.lines.length ? `${heredoc.lines.join('\n')}\n` : '';
        heredoc = null;
      } else heredoc.lines.push(line);
      continue;
    }
    let fed = null;
    for (const segment of line.split(/;|&&|\|\|?/)) {
      const cd = /^\s*cd\s+(\S+)/.exec(segment);
      if (cd) dir = resolve(expand(cd[1]));
      for (const m of segment.matchAll(/(?:^|\s)(?:export\s+)?([A-Za-z_]\w*)=("[^"]*"|'[^']*'|[^\s"']+)/g)) vars[m[1]] = expand(m[2]);
      const start = /<<-?\s*(["']?)(\w+)\1/.exec(segment);
      const writes = [];
      // A `>` inside a quoted argument (`echo "$h -> $code"`) redirects nothing.
      const bare = segment.replace(/(>{1,2}\s*|\btee\s+(?:-a\s+)?)?("[^"]*"|'[^']*')/g, (m, op) => (op ? m : '""'));
      for (const m of bare.matchAll(/(?:^|[^\d&>])(>{1,2})\s*("[^"]*"|'[^']*'|[^\s<>&|)]+)/g)) {
        const target = expand(m[2]);
        if (!target.startsWith('/dev/')) writes.push({ path: resolve(target), append: m[1] === '>>', body: null });
      }
      for (const m of bare.matchAll(/\btee\s+(-a\s+)?("[^"]*"|'[^']*'|[^\s<>&|)]+)/g)) {
        writes.push({ path: resolve(expand(m[2])), append: Boolean(m[1]), body: null });
      }
      if (start) fed = { end: start[2], writes, lines: [] };
      out.push(...writes);
    }
    if (fed) heredoc = fed;
  }
  return out;
}

export function bashWriteTargets(command, cwd) {
  return bashWrites(command, cwd).map((w) => w.path);
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

const LEDGER_FILE = /(^|\/)question-ledger\.md$/;
const IN_PLACE = /\b(?:sed|perl)\b[^;&|]*\s-i|\b(?:python3?|node|awk|mv|cp|rm)\b/;

// The ledger's last-written path and its content as the run's own tool calls left it; content is
// null when a write the calls do not spell out (an Edit to an unseen file, `sed -i`) touched it.
export function locateLedger(toolCalls, cwd) {
  const content = new Map();
  let last = null;
  const put = (p, text) => {
    content.set(p, text);
    if (LEDGER_FILE.test(p)) last = p;
  };
  for (const t of toolCalls || []) {
    if (t.is_error) continue;
    const file = t.input?.file_path ? path.resolve(cwd, t.input.file_path) : null;
    if (t.name === 'Write' && file) put(file, typeof t.input.content === 'string' ? t.input.content : null);
    if (t.name === 'Edit' && file) {
      const prev = content.get(file);
      const { old_string: from, new_string: to, replace_all: all } = t.input;
      put(file, typeof prev === 'string' && typeof from === 'string' && prev.includes(from) ? (all ? prev.split(from).join(to) : prev.replace(from, () => to)) : null);
    }
    if (t.name === 'Bash' && typeof t.input?.command === 'string') {
      const writes = bashWrites(t.input.command, cwd);
      for (const w of writes) {
        const prev = content.has(w.path) ? content.get(w.path) : '';
        put(w.path, w.body === null || (w.append && prev === null) ? null : w.append ? prev + w.body : w.body);
      }
      if (/question-ledger/.test(t.input.command) && !writes.some((w) => LEDGER_FILE.test(w.path)) && IN_PLACE.test(t.input.command)) {
        for (const p of content.keys()) if (LEDGER_FILE.test(p)) content.set(p, null);
      }
    }
  }
  return last ? { path: last, content: content.get(last) } : null;
}

// The question ledger grill-topic keeps, as rows of { label, round, answer }; null when no readable
// ledger exists. The skill keeps it in the session scratchpad, so it is found through the run's own
// writes. Their content comes first: a fixed scratch path such as /tmp/claude-501/grill-backoff can
// be shared by concurrent scenarios, so the file on disk may be another run's.
export function readLedger(scenario, context) {
  const found = locateLedger(context?.providerResponse?.metadata?.toolCalls, sandboxDir(scenario));
  if (found) {
    const disk = found.content === null && path.isAbsolute(found.path) && fs.existsSync(found.path) ? fs.readFileSync(found.path, 'utf8') : null;
    const text = found.content ?? disk;
    if (text !== null) return parseLedger(text);
  }
  const file = listFiles(sandboxDir(scenario)).find((f) => LEDGER_FILE.test(f));
  return file ? parseLedger(readSandboxFile(scenario, file)) : null;
}

export function parseLedger(text) {
  const rows = String(text || '').split('\n').filter((l) => /^\|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  const header = rows.find((r) => r.some((c) => /^round$/i.test(c)));
  if (!header) return [];
  const roundCol = header.findIndex((c) => /^round$/i.test(c));
  const answerCol = header.findIndex((c) => /answer|status|option/i.test(c));
  return rows
    .filter((r) => r !== header && /^\d+$/.test(r[roundCol] || ''))
    .map((r) => ({ label: r[0].replace(/[*`]/g, ''), round: Number(r[roundCol]), answer: answerCol === -1 ? '' : r[answerCol] }));
}

// The final message must hold the run's latest round: the ledger's highest round asks nothing the
// message's round leaves out, and with no question tool in play the user answered nothing.
export function latestRoundFailures(output, ledger, context) {
  if (!ledger || ledger.length === 0) return [];
  const round = lastRound(output);
  const out = [];
  const latest = Math.max(...ledger.map((r) => r.round));
  const live = ledger.filter((r) => r.round === latest && /^\d/.test(r.label) && !/void|withdrawn/i.test(r.answer));
  const posted = new Set((round ? round.labels : []).filter((x) => /^\d/.test(x)).map(topLevel));
  const missing = [...new Set(live.map((r) => topLevel(r.label)).filter((n) => !posted.has(n)))];
  if (missing.length) out.push(`the ledger's round ${latest} asks ${missing.join(', ')}, which the final message's round does not: it is not the latest round the run posted`);
  if (!askedThroughTool(context)) {
    const answered = ledger.filter((r) => !/^[\s*_`—–-]*$/.test(r.answer) && !/^\**(open|pending|carried)/i.test(r.answer) && !/void|withdrawn/i.test(r.answer));
    if (answered.length) out.push(`the ledger records answers to ${answered.map((r) => r.label).join(', ')} that no user gave`);
  }
  return out;
}

// Without a ledger the latest-round and self-answered guards have nothing to read, so a run that
// asked questions and kept none fails rather than passing them by default.
export function ledgerFailures(output, ledger, context) {
  const asked = lastRound(output) !== null || askedThroughTool(context);
  if (asked && (!ledger || ledger.length === 0)) return ['the run asked questions but left no readable notes/question-ledger.md with numbered round rows'];
  return latestRoundFailures(output, ledger, context);
}

// A round that went out through AskUserQuestion is auto-answered under `first_option`, so the
// final message can hold no numbered question even though the grilling ran.
export function askedThroughTool(context) {
  return (context?.providerResponse?.metadata?.toolCalls || []).some((call) => call.name === 'AskUserQuestion');
}

// Tool calls that look for a file by name rather than open the path given: a recursive glob, a
// content search, a find by name, or a path above the working dir. Listing the given directory is
// not a search.
export function searchesFor(context, name) {
  return (context?.providerResponse?.metadata?.toolCalls || [])
    .map((call) => ({ call, input: JSON.stringify(call.input ?? {}) }))
    .filter(({ call, input }) => {
      if (!name.test(input)) return false;
      if (call.name === 'Glob') return /\*\*|\.\.\/|"\//.test(input);
      if (call.name === 'Grep') return true;
      if (call.name === 'Bash') return /\b(?:find|fd|locate|rg|grep|mdfind)\b|\.\.\//.test(input);
      return false;
    })
    .map(({ call, input }) => `${call.name} ${input}`);
}

// The run's last AskUserQuestion call errored: whatever it said after, the question never reached
// the user.
export function questionToolFailed(context) {
  const asks = (context?.providerResponse?.metadata?.toolCalls || []).filter((call) => call.name === 'AskUserQuestion');
  const last = asks.at(-1);
  return Boolean(last && (last.is_error === true || /permission request failed|AbortError/i.test(JSON.stringify(last.output ?? ''))));
}
