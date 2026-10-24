// Deterministic asserts over the shape a review's final message has to take: the quality-review
// skeleton, the scanner bullet shape and the comment-review verdict list. Each named export is a
// promptfoo javascript assert, `file://checks/report.mjs:<name>`, configured by its `config:`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEVERITY_MD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'references', 'severity.md');

export const TABLE = (() => {
  const rows = {};
  for (const m of fs.readFileSync(SEVERITY_MD, 'utf8').matchAll(/^\|\s*`([a-z]+)`\s*\|\s*([\w-]+)\s*\|/gm)) {
    (rows[m[1]] ??= new Set()).add(m[2]);
  }
  return rows;
})();

const FINDING = /^-\s+`([a-z]+)`\s*·\s*([\w-]+)\s*·\s*([A-Za-z]+)\s*·\s*(.*)$/;
const SIDE = /^\s*(?:#+\s*|\*\*)?(HANDOFF|CANDIDATES)\b/;
const NOT_FLAGGED = /^\s*(?:\*\*)?(?:Considered but )?not flagged\b/i;
const BOY_SCOUT = /^\s*(?:\*\*)?Boy-scout\b/i;
const TALLY = /^\s*(?:\*\*)?Tally\b/i;

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason });
const re = (p) => (p instanceof RegExp ? p : new RegExp(p, 'i'));
const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const squash = (s) => s.replace(/\s+/g, ' ');

// Tags every line with the report section it sits in. HANDOFF and CANDIDATES are side channels the
// finding contract does not govern; a fence opened right before one belongs to it.
export function sections(output) {
  const lines = output.split('\n');
  const out = [];
  let state = 'main';
  let file = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines.slice(i + 1).find((l) => l.trim());
    if (/^```/.test(line.trim()) && next && SIDE.test(next)) state = 'side';
    else if (SIDE.test(line)) state = 'side';
    else if (NOT_FLAGGED.test(line)) state = 'notFlagged';
    else if (BOY_SCOUT.test(line)) state = 'boyScout';
    else if (TALLY.test(line)) state = 'tally';
    else if (/^#{2,3}\s/.test(line)) {
      state = 'main';
      const h = line.match(/^###\s+(.*)$/);
      if (h) file = h[1].replace(/[`*]/g, '').trim();
    }
    out.push({ line, state, file });
  }
  return out;
}

const textOf = (output, state) =>
  sections(output)
    .filter((l) => l.state === state)
    .map((l) => l.line)
    .join('\n');

export function findings(output) {
  return sections(output)
    .filter((l) => l.state === 'main')
    .map((l) => {
      const m = l.line.match(FINDING);
      if (!m) return null;
      const arrow = l.line.indexOf('→');
      return { family: m[1], rule: m[2], severity: m[3], text: l.line, fix: arrow < 0 ? '' : l.line.slice(arrow + 1), file: l.file };
    })
    .filter(Boolean);
}

export function lineNumbers(text) {
  const out = new Set();
  for (const m of text.matchAll(/\bL(\d+)(?:\s*[-–]\s*L?(\d+))?/g)) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = a; n <= b && n - a < 200; n++) out.add(n);
  }
  return out;
}

// `siteOnly` matches mentions before the fix arrow: a fix may name what a look-alike is made of
// ("read it from a secret-manager data source") without flagging that look-alike.
const selects = (f, c) => {
  const text = c.siteOnly && f.text.includes('→') ? f.text.slice(0, f.text.indexOf('→')) : f.text;
  return (
    (!c.family || f.family === c.family) &&
    (!c.rule || list(c.rule).includes(f.rule)) &&
    (!c.atSeverity || list(c.atSeverity).includes(f.severity)) &&
    (!c.under || (f.file ?? '').endsWith(c.under)) &&
    (!c.mentions || list(c.mentions).some((p) => re(p).test(text))) &&
    list(c.all).every((p) => re(p).test(text))
  );
};

const describe = (c) =>
  [c.family && `\`${c.family}\``, c.rule && list(c.rule).join('|'), c.atSeverity && list(c.atSeverity).join('|'), c.mentions && `mentioning ${list(c.mentions).join(' | ')}`, c.under && `under ${c.under}`]
    .filter(Boolean)
    .join(' · ');

// A finding matching the selector exists, and at least one such finding also has every property asked.
export function finding(output, { config: c = {} } = {}) {
  const hits = findings(output).filter((f) => selects(f, c));
  if (!hits.length) return result(false, `no finding ${describe(c)}`);
  const ok = hits.filter(
    (f) =>
      (!c.severity || list(c.severity).includes(f.severity)) &&
      (!c.fix || re(c.fix).test(f.fix)) &&
      list(c.lines).every((n) => lineNumbers(f.text).has(n)),
  );
  if (ok.length) return result(true, `found: ${ok[0].text.slice(0, 160)}`);
  const want = [c.severity && `severity ${list(c.severity).join('|')}`, c.fix && `fix /${c.fix}/`, c.lines && `lines ${list(c.lines).join(', ')}`].filter(Boolean).join(', ');
  return result(false, `finding ${describe(c)} lacks ${want}: ${hits.map((f) => f.text.slice(0, 120)).join(' || ')}`);
}

export function noFinding(output, { config: c = {} } = {}) {
  const hits = findings(output).filter((f) => selects(f, c));
  return hits.length ? result(false, `raised ${describe(c)}: ${hits.map((f) => f.text.slice(0, 140)).join(' || ')}`) : result(true, `no finding ${describe(c)}`);
}

// Every finding uses the fixed vocabulary: an allowed severity, and when asked a family from the
// allowed set and a rule row severity.md lists for that family (standards slugs are the project's
// own). A severity slot outside the table anywhere in the output fails too.
export function findingsVocabulary(output, { config: c = {} } = {}) {
  const severities = c.severities ?? ['high', 'medium', 'nit'];
  const bad = [];
  for (const f of findings(output)) {
    if (c.families && !c.families.includes(f.family)) bad.push(`family ${f.family}`);
    if (!severities.includes(f.severity)) bad.push(`severity ${f.severity} on ${f.family} · ${f.rule}`);
    if (c.rules && f.family !== 'standards' && !TABLE[f.family]?.has(f.rule)) bad.push(`rule ${f.family} · ${f.rule} is not in severity.md`);
  }
  for (const m of output.matchAll(/·\s*(low|critical|minor|major|info|blocker)\s*·/gi)) bad.push(`invented severity "${m[1]}"`);
  return bad.length ? result(false, bad.join('; ')) : result(true, 'every finding uses the fixed family, rule and severity vocabulary');
}

// Every finding-like bullet the contract governs (of one family, when asked) has the exact shape.
export function findingShape(output, { config: c = {} } = {}) {
  const shape = re(c.pattern);
  const lead = c.family ? new RegExp(`^-\\s+\`${c.family}\``) : /^-\s+`/;
  const bad = sections(output)
    .filter((l) => l.state === 'main' && lead.test(l.line))
    .filter((l) => !shape.test(l.line))
    .map((l) => l.line.slice(0, 140));
  return bad.length ? result(false, `bullets off the finding shape: ${bad.join(' || ')}`) : result(true, 'every finding bullet has the contract shape');
}

export function noCodeBlocks(output, { config: c = {} } = {}) {
  const text = c.scope === 'findings' ? textOf(output, 'main') : output;
  const bad = [];
  if (/^\s*```/m.test(text)) bad.push('a fenced code block');
  if (/^\s*[-*]?\s*(\*\*)?(Before|After)(\*\*)?\s*:/im.test(text)) bad.push('a before/after listing');
  return bad.length ? result(false, `the report carries ${bad.join(' and ')}`) : result(true, 'no fenced code and no before/after listing');
}

export function notFlaggedNames(output, { config: c = {} } = {}) {
  const text = textOf(output, 'notFlagged');
  if (!text.trim()) return result(false, 'no Not flagged line');
  const patterns = list(c.patterns);
  const missing = patterns.filter((p) => !re(p).test(text));
  // `min` is for look-alikes the run may not have considered at all: naming some of them is enough.
  const need = c.min ?? patterns.length;
  return patterns.length - missing.length < need
    ? result(false, `Not flagged names ${patterns.length - missing.length} of ${need} required; missing: ${missing.join(', ')}`)
    : result(true, `Not flagged names ${patterns.length - missing.length} of ${patterns.length} look-alikes`);
}

export function skeletonPreamble(output) {
  const lines = output.split('\n');
  const conv = lines.findIndex((l) => /^\*\*Conventions:\*\*/.test(l));
  const head = lines.findIndex((l) => /^\*\*Headline:\*\*/.test(l));
  const firstFile = lines.findIndex((l) => /^###\s/.test(l));
  if (conv < 0) return result(false, 'no **Conventions:** line');
  if (head < 0) return result(false, 'no **Headline:** line');
  if (head < conv) return result(false, 'the Headline comes before the Conventions line');
  if (firstFile >= 0 && head > firstFile) return result(false, 'the Headline comes after the first file header');
  return result(true, 'Conventions then Headline open the report');
}

export function fileHeaders(output) {
  const bad = output
    .split('\n')
    .filter((l) => /^###\s/.test(l))
    .filter((l) => !/^###\s+`?[\w.@/-]+\.[\w]+`?\s*$/.test(l));
  return bad.length ? result(false, `### headers that are not file paths: ${bad.join(' || ')}`) : result(true, 'every ### header is a file path');
}

export function findingBullets(output) {
  const bad = sections(output)
    .filter((l) => l.state === 'main' && l.file)
    .map((l) => l.line)
    .filter((l) => /^\s*\d+[.)]\s/.test(l) || /^\s*-\s+\*\*/.test(l) || /^\s*-{3,}\s*$/.test(l));
  return bad.length ? result(false, `numbered, bolded or ruled finding entries: ${bad.map((l) => l.slice(0, 100)).join(' || ')}`) : result(true, 'each finding is a plain bullet');
}

export function collapsedRepeats(output, { config: c = {} } = {}) {
  const perFile = {};
  for (const f of findings(output).filter((f) => f.rule === c.rule)) perFile[f.file] = (perFile[f.file] ?? 0) + 1;
  const bad = Object.entries(perFile).filter(([, n]) => n > 1);
  return bad.length ? result(false, `${c.rule} raised as ${bad.map(([f, n]) => `${n} bullets in ${f}`).join(', ')}`) : result(true, `${c.rule} sites are collapsed into one bullet per file`);
}

const tallyCounts = (output) => {
  const m = output.match(/\*\*Tally:?\*\*:?\s*(\d+) findings? · (\d+) high · (\d+) medium · (\d+) nit/);
  return m ? { high: Number(m[2]), medium: Number(m[3]) } : null;
};

export function headlineHonest(output) {
  const headline = output.match(/^\*\*Headline:\*\*(.*)$/m)?.[1];
  if (headline === undefined) return result(false, 'no **Headline:** line');
  const t = tallyCounts(output);
  const serious = findings(output).some((f) => f.severity === 'high' || f.severity === 'medium') || (t && t.high + t.medium > 0);
  if (!serious) return result(true, 'no high or medium finding, any headline goes');
  const clean = headline.match(/\bclean(ly)?\b|well[- ]structured|cosmetic|nits?[- ]only|only (cosmetic )?nits/i);
  return clean ? result(false, `the headline calls a change with a high/medium finding "${clean[0]}": ${headline.trim()}`) : result(true, 'the headline does not call the change clean');
}

export function cleanVerdict(output) {
  const serious = findings(output).filter((f) => f.severity === 'high' || f.severity === 'medium');
  if (serious.length) return result(false, `high/medium findings: ${serious.map((f) => f.text.slice(0, 120)).join(' || ')}`);
  const t = tallyCounts(output);
  if (t && t.high + t.medium > 0) return result(false, `the tally counts ${t.high} high and ${t.medium} medium`);
  return result(true, 'no high or medium finding');
}

const skippedText = (output) => {
  const i = output.search(/Skipped\b/);
  return i < 0 ? '' : output.slice(i);
};

export function skippedNames(output, { config: c = {} } = {}) {
  const text = skippedText(output);
  const missing = list(c.patterns).filter((p) => !re(p).test(text));
  return missing.length ? result(false, `not listed as skipped: ${missing.join(', ')}`) : result(true, 'listed as skipped');
}

export function notSkipped(output, { config: c = {} } = {}) {
  const text = skippedText(output);
  const hit = list(c.patterns).filter((p) => re(p).test(text));
  return hit.length ? result(false, `listed as skipped: ${hit.join(', ')}`) : result(true, 'none listed as skipped');
}

export function fileReviewed(output, { config: c = {} } = {}) {
  const missing = list(c.files).filter(
    (name) => !output.split('\n').some((l) => /^###\s/.test(l) && l.replace(/[`*]/g, '').trim().endsWith(name)) && !findings(output).some((f) => f.text.includes(name)),
  );
  return missing.length ? result(false, `no file header or finding for: ${missing.join(', ')}`) : result(true, 'every file is judged');
}

// ---- comment-review: one block per top-level bullet, its indented continuation lines included.

const VERDICT = /\*\*(KEEP|REMOVE|REWRITE|MOVE|ADD)\*\*/;
const VERDICT_BARE = /\b(KEEP|REMOVE|REWRITE|MOVE|ADD)\b/;
const COMMENT_MARK = /^(\/\/|#|\/\*|\*|--|<!--)/;

export function commentBlocks(output) {
  const blocks = [];
  let file = null;
  let cur = null;
  for (const line of output.split('\n')) {
    const h = line.match(/^###\s+(.*)$/);
    if (h) {
      file = h[1].replace(/[`*]/g, '').trim();
      cur = null;
      continue;
    }
    if (/^-\s/.test(line)) {
      cur = { file, lines: [line] };
      blocks.push(cur);
    } else if (cur && (/^\s+\S/.test(line) || !line.trim())) cur.lines.push(line);
    else cur = null;
  }
  return blocks.map((b) => {
    const text = b.lines.join('\n').trimEnd();
    const vm = text.match(VERDICT) ?? text.match(VERDICT_BARE);
    const after = vm ? text.slice(vm.index + vm[0].length) : '';
    const paren = after.match(/^\s*\(([^)]*)\)/)?.[1] ?? b.lines[0].match(/\((R\d+[^)]*)\)/)?.[1] ?? '';
    const arrow = text.indexOf('→');
    const fixParts = [arrow < 0 ? '' : text.slice(arrow + 1), ...[...text.matchAll(/\bFix\b[^:\n]*:(.*)$/gm)].map((m) => m[1])];
    const fix = fixParts.join('\n');
    return {
      file: b.file,
      text,
      quote: squash(b.lines[0].match(/`([^`]+)`/)?.[1] ?? ''),
      verdict: vm?.[1] ?? null,
      rules: [...paren.matchAll(/\bR(\d+)\b/g)].map((m) => `R${m[1]}`),
      fix,
      replacements: [...fix.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((s) => COMMENT_MARK.test(s.trim())),
    };
  });
}

const quoted = (output, c, quote) => commentBlocks(output).filter((b) => b.quote.includes(squash(quote)) && (!c.file || (b.file ?? '').endsWith(c.file)));

export function commentVerdict(output, { config: c = {} } = {}) {
  const fails = [];
  for (const q of list(c.quote)) {
    const blocks = quoted(output, c, q);
    if (!blocks.length) {
      fails.push(`no verdict quotes "${q}"`);
      continue;
    }
    const ok = blocks.some((b) => list(c.verdict).includes(b.verdict) && (!c.rule || b.rules.includes(c.rule)));
    if (!ok) fails.push(`"${q}" got ${blocks.map((b) => `${b.verdict} (${b.rules.join(', ') || 'no rule'})`).join(' / ')}, wanted ${list(c.verdict).join('|')}${c.rule ? ` (${c.rule})` : ''}`);
  }
  return fails.length ? result(false, fails.join('; ')) : result(true, `verdict ${list(c.verdict).join('|')}${c.rule ? ` (${c.rule})` : ''} for every quoted comment`);
}

export function commentKept(output, { config: c = {} } = {}) {
  const forbid = c.forbid ?? ['REMOVE', 'REWRITE', 'MOVE'];
  const bad = quoted(output, c, c.quote).filter((b) => forbid.includes(b.verdict));
  return bad.length ? result(false, `"${c.quote}" got ${bad.map((b) => `${b.verdict} (${b.rules.join(', ')})`).join(' / ')}`) : result(true, `"${c.quote}" is not given ${forbid.join('/')}`);
}

export function commentNotFlagged(output, { config: c = {} } = {}) {
  const bad = commentBlocks(output).filter((b) => b.verdict && b.verdict !== 'KEEP' && list(c.mentions).some((p) => re(p).test(b.text)));
  return bad.length ? result(false, `flagged: ${bad.map((b) => b.text.split('\n')[0].slice(0, 120)).join(' || ')}`) : result(true, 'not flagged');
}

const tokenRe = (t) => new RegExp(`(?<![\\w§.])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`);

// No replacement comment text a fix proposes carries one of the tokens. Quoting the original comment
// is fine; only backticked comment text inside the fix counts.
export function replacementsOmit(output, { config: c = {} } = {}) {
  const blocks = c.quote ? quoted(output, c, c.quote) : commentBlocks(output);
  const bad = [];
  for (const b of blocks)
    for (const r of b.replacements)
      for (const t of list(c.tokens)) if (tokenRe(t).test(r)) bad.push(`"${r}" keeps ${t}`);
  return bad.length ? result(false, bad.join('; ')) : result(true, `no replacement keeps ${list(c.tokens).join(', ')}`);
}

export function commentFix(output, { config: c = {} } = {}) {
  const blocks = quoted(output, c, c.quote);
  if (!blocks.length) return result(false, `no verdict quotes "${c.quote}"`);
  const field = c.in === 'replacement' ? (b) => b.replacements.join('\n') : (b) => b.fix;
  const ok = blocks.some((b) => re(c.pattern).test(field(b)));
  return ok ? result(true, `the fix for "${c.quote}" matches /${c.pattern}/`) : result(false, `the fix for "${c.quote}" does not match /${c.pattern}/: ${blocks.map((b) => squash(field(b)).slice(0, 160)).join(' || ')}`);
}
