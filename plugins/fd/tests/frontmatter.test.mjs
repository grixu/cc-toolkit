import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setFrontmatterFields, serializeYamlValue, FrontmatterError } from '../scripts/lib/frontmatter.mjs';
import { parseTaskFrontmatter } from '../scripts/hasher.mjs';

const FX = path.join(import.meta.dirname, 'fixtures', 'frontmatter');
const read = (name) => fs.readFileSync(path.join(FX, name), 'utf8');

const HASH_A = 'sha256:' + 'a'.repeat(64);
const HASH_B = 'sha256:' + 'b'.repeat(64);

test('patches a scalar value and preserves its trailing comment', () => {
  const out = setFrontmatterFields(read('with-comments.md'), { status: 'ready' });
  assert.match(out, /^status: ready\s+# planned at generation; set to ready by the validation tail$/m);
});

test('patches builtAgainst object with quoted hashes', () => {
  const out = setFrontmatterFields(read('with-comments.md'), {
    builtAgainst: { specHash: HASH_A, inputHash: HASH_B },
  });
  assert.match(out, new RegExp(`^builtAgainst: \\{ specHash: "${HASH_A}", inputHash: "${HASH_B}" \\}$`, 'm'));
  const { frontmatter } = parseTaskFrontmatter(out);
  assert.deepEqual(frontmatter.builtAgainst, { specHash: HASH_A, inputHash: HASH_B });
});

test('touches only the requested keys — everything else stays byte-identical', () => {
  const src = read('with-comments.md');
  const out = setFrontmatterFields(src, { status: 'ready' });
  const changed = src.split('\n').filter((line, i) => out.split('\n')[i] !== line);
  assert.equal(changed.length, 1);
  assert.match(changed[0], /^status: planned/);
  assert.ok(out.includes('The `#` in this body line must survive untouched.'));
  assert.ok(out.includes('id: T-004   # append-only T counter'));
});

test('appends an absent key just above the closing ---', () => {
  const src = read('bom.md');
  const out = setFrontmatterFields(src, { builtAgainst: { specHash: HASH_A, inputHash: HASH_A } });
  const lines = out.split('\n');
  const close = lines.indexOf('---', 1);
  assert.match(lines[close - 1], /^builtAgainst: \{ specHash: /);
  const { frontmatter } = parseTaskFrontmatter(out);
  assert.equal(frontmatter.builtAgainst.specHash, HASH_A);
});

test('tolerates and preserves a BOM', () => {
  const out = setFrontmatterFields(read('bom.md'), { status: 'ready' });
  assert.ok(out.startsWith('﻿---'));
  assert.match(out, /^status: ready$/m);
});

test('throws when the frontmatter does not start on line 1', () => {
  assert.throws(() => setFrontmatterFields(read('not-line-1.md'), { status: 'ready' }), FrontmatterError);
});

test('throws on an unterminated frontmatter block', () => {
  assert.throws(() => setFrontmatterFields('---\nid: T-001\nno closing fence\n', { status: 'ready' }), FrontmatterError);
});

test('a # inside a quoted value is not a comment boundary', () => {
  const src = '---\ntitle: "uses # inside quotes" # real comment\n---\nBody.\n';
  const out = setFrontmatterFields(src, { title: 'plain' });
  assert.match(out, /^title: plain # real comment$/m);
});

test('serializeYamlValue quotes YAML-active strings and keeps simple ones bare', () => {
  assert.equal(serializeYamlValue('ready'), 'ready');
  assert.equal(serializeYamlValue(HASH_A), `"${HASH_A}"`);
  assert.equal(serializeYamlValue(['AC-5', 'FR-2']), '[AC-5, FR-2]');
  assert.equal(serializeYamlValue([]), '[]');
});
