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

// The question ledger grill-topic keeps, as rows of { label, round, answer }; null when the run kept
// none inside the sandbox.
export function readLedger(scenario) {
  const file = listFiles(sandboxDir(scenario)).find((f) => /question-ledger\.md$/.test(f));
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

// A round that went out through AskUserQuestion is auto-answered under `first_option`, so the
// final message can hold no numbered question even though the grilling ran.
export function askedThroughTool(context) {
  return (context?.providerResponse?.metadata?.toolCalls || []).some((call) => call.name === 'AskUserQuestion');
}

// The run's last AskUserQuestion call errored: whatever it said after, the question never reached
// the user.
export function questionToolFailed(context) {
  const asks = (context?.providerResponse?.metadata?.toolCalls || []).filter((call) => call.name === 'AskUserQuestion');
  const last = asks.at(-1);
  return Boolean(last && (last.is_error === true || /permission request failed|AbortError/i.test(JSON.stringify(last.output ?? ''))));
}
