import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVALS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The one central place that skips `.git/`: the reset script initialises repos inside
// sandboxes that the pristine fixtures do not have, so a naive recursive diff always fires.
// DEFECTS.md is fixture documentation and is excluded from the sandbox copy.
const SKIP = new Set(['.git', 'DEFECTS.md']);

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
  const dir = path.join(sandboxDir(scenario), rel);
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
