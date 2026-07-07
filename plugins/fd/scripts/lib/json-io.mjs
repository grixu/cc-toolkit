import fs from 'node:fs';

// Canonical artifact serialization: 2-space indent + trailing newline, so re-runs are
// byte-identical and `--check` style comparisons can diff strings directly.
export function serializeJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

export function atomicWrite(filePath, content) {
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

// Deterministic order for <KIND>-<n> ids: prefix lexicographic, number numeric,
// so T-2 sorts before T-10 and reruns serialize byte-identically.
export function compareIds(a, b) {
  const ma = /^([A-Za-z]+)-([0-9]+)$/.exec(a);
  const mb = /^([A-Za-z]+)-([0-9]+)$/.exec(b);
  if (ma && mb) {
    if (ma[1] !== mb[1]) return ma[1] < mb[1] ? -1 : 1;
    return Number(ma[2]) - Number(mb[2]);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedByIds(keys) {
  return [...keys].sort(compareIds);
}

// Missing or empty file reads as null (a legal pre-seed state); malformed JSON throws —
// silently regenerating over a corrupt artifact would destroy hand-recoverable state.
export function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.trim() === '') return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
  }
}
