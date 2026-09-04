import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = process.env.APP_STATE_PATH || path.join(DIR, 'state.json');

const [collection, ...filters] = process.argv.slice(2);

if (!collection) {
  console.error(
    'usage: node db-query.mjs <users|projects|memberships|auditEvents> [field=value ...]\n' +
      '       node db-query.mjs --collections\n' +
      'Read-only: this tool never writes to the store.',
  );
  process.exit(2);
}

const store = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

if (collection === '--collections') {
  console.log(JSON.stringify(Object.keys(store), null, 2));
  process.exit(0);
}

const rows = store[collection];
if (!Array.isArray(rows)) {
  console.error(`unknown collection "${collection}"; available: ${Object.keys(store).join(', ')}`);
  process.exit(2);
}

const predicates = filters.map((f) => {
  const i = f.indexOf('=');
  if (i === -1) {
    console.error(`bad filter "${f}"; expected field=value`);
    process.exit(2);
  }
  return [f.slice(0, i), f.slice(i + 1)];
});

const matched = rows.filter((row) => predicates.every(([k, v]) => String(row[k]) === v));
console.log(JSON.stringify(matched, null, 2));
