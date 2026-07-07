// Surgical writer for the task-file frontmatter (the flat-YAML subset that
// hasher.mjs#parseTaskFrontmatter reads). It patches value spans in place instead of
// parse+reserialize: task files are generated-only and contentHash-protected, so the
// writer must not perturb field order, inline `# comments`, or the body.

export class FrontmatterError extends Error {}

const BOM = '﻿';
const KEY_RE = /^([A-Za-z0-9_-]+):([ \t]*)/;

// Value span ends where a top-level unquoted ` #` comment begins (hashes inside quotes
// or inline collections stay part of the value).
function valueSpanEnd(rest) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ']' || ch === '}') {
      depth--;
    } else if (ch === '#' && depth === 0 && (i === 0 || rest[i - 1] === ' ' || rest[i - 1] === '\t')) {
      let start = i;
      while (start > 0 && (rest[start - 1] === ' ' || rest[start - 1] === '\t')) start--;
      return start;
    }
  }
  let end = rest.length;
  while (end > 0 && (rest[end - 1] === ' ' || rest[end - 1] === '\t')) end--;
  return end;
}

function serializeScalar(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const s = String(value);
  // Bare only when unambiguous for the flat-YAML reader; anything with YAML-active
  // characters (colons in hashes, commas, quotes, braces) gets double-quoted.
  if (/^[A-Za-z0-9_.\/@-]+$/.test(s)) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function serializeYamlValue(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(serializeYamlValue).join(', ') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const pairs = Object.keys(value).map((k) => `${k}: ${serializeYamlValue(value[k])}`);
    return '{ ' + pairs.join(', ') + ' }';
  }
  return serializeScalar(value);
}

// Patches the given top-level frontmatter keys, preserving everything else byte-for-byte
// (field order, trailing comments, body, line endings). A key absent from the block is
// appended just above the closing `---`. Throws instead of guessing on a malformed file.
export function setFrontmatterFields(fileText, updates) {
  const hasBom = fileText.startsWith(BOM);
  const text = hasBom ? fileText.slice(BOM.length) : fileText;
  const lines = text.split('\n');

  if ((lines[0] ?? '').replace(/\r$/, '') !== '---') {
    throw new FrontmatterError('frontmatter must start with --- on line 1');
  }
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].replace(/\r$/, '') === '---') {
      close = i;
      break;
    }
  }
  if (close < 0) throw new FrontmatterError('unterminated frontmatter block');

  const pending = new Map(Object.entries(updates));
  for (let i = 1; i < close; i++) {
    const eol = lines[i].endsWith('\r') ? '\r' : '';
    const line = eol ? lines[i].slice(0, -1) : lines[i];
    if (/^\s/.test(line)) continue;
    const m = KEY_RE.exec(line);
    if (!m || !pending.has(m[1])) continue;
    const rest = line.slice(m[0].length);
    const end = valueSpanEnd(rest);
    const pad = m[2] === '' ? ' ' : m[2];
    lines[i] = `${m[1]}:${pad}${serializeYamlValue(pending.get(m[1]))}${rest.slice(end)}${eol}`;
    pending.delete(m[1]);
  }

  if (pending.size > 0) {
    const eol = lines[close].endsWith('\r') ? '\r' : '';
    const added = [...pending.entries()].map(([k, v]) => `${k}: ${serializeYamlValue(v)}${eol}`);
    lines.splice(close, 0, ...added);
  }

  return (hasBom ? BOM : '') + lines.join('\n');
}
