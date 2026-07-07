import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  normalize,
  hashElement,
  contentHash,
  canonicalJson,
  rollup,
  inputHash,
  extractElements,
  parseTaskFrontmatter,
  runHasher,
  HasherError,
  SEED_KINDS,
} from '../scripts/hasher.mjs';

const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname);
const FX = path.join(HERE, 'fixtures', 'hasher');
const sha = (s) => 'sha256:' + createHash('sha256').update(s, 'utf8').digest('hex');
const SHA_RE = /^sha256:[0-9a-f]{64}$/;

test('normalize: CRLF and CR both become LF', () => {
  assert.equal(normalize('a\r\nb'), 'a\nb');
  assert.equal(normalize('a\rb'), 'a\nb');
  assert.equal(normalize('a\r\nb\rc'), 'a\nb\nc');
});

test('normalize: strips trailing whitespace per line', () => {
  assert.equal(normalize('a  \nb\t\nc   '), 'a\nb\nc');
});

test('normalize: collapses runs of blank lines to one', () => {
  assert.equal(normalize('a\n\n\n\nb'), 'a\n\nb');
});

test('normalize: trims leading and trailing blank lines', () => {
  assert.equal(normalize('\n\n  \na\n\n\n'), 'a');
});

test('normalize: empty input stays empty', () => {
  assert.equal(normalize(''), '');
  assert.equal(normalize('\n\n'), '');
});

test('hashElement: renders as sha256:<lowercase hex>', () => {
  assert.match(hashElement('# DB-1 — x\nbody'), SHA_RE);
});

test('hashElement: NFC folds composed and decomposed accents', () => {
  const composed = 'caf' + String.fromCodePoint(0x00e9); // e-acute as one code point
  const decomposed = 'cafe' + String.fromCodePoint(0x0301); // e + combining acute
  assert.notEqual(composed, decomposed);
  assert.equal(hashElement(composed), hashElement(decomposed));
});

test('hashElement: line-ending and trailing-whitespace differences do not change the hash', () => {
  assert.equal(hashElement('a\r\nb  '), hashElement('a\nb'));
});

test('hashElement: a title change changes the hash', () => {
  const a = '#### DB-3 — Users table\nbody';
  const b = '#### DB-3 — Accounts table\nbody';
  assert.notEqual(hashElement(a), hashElement(b));
});

test('contentHash: shares the normalization pipeline and is CRLF-invariant', () => {
  assert.equal(contentHash('a\r\nb'), hashElement('a\nb'));
  assert.equal(contentHash('x\r\ny'), contentHash('x\ny'));
});

test('canonicalJson: sorts keys at every level, compact, arrays ordered', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJson({ z: { y: 1, x: 2 } }), '{"z":{"x":2,"y":1}}');
  assert.equal(canonicalJson([3, 1, 2]), '[3,1,2]');
  assert.equal(canonicalJson({ k: 'a"b' }), '{"k":"a\\"b"}');
  assert.equal(canonicalJson(null), 'null');
  assert.ok(!/\s/.test(canonicalJson({ a: 1, b: [1, 2], c: { d: 3 } })));
});

test('rollup: empty map is null, order-independent, matches canonical sha', () => {
  assert.equal(rollup({}), null);
  assert.equal(rollup({ a: '1', b: '2' }), rollup({ b: '2', a: '1' }));
  assert.equal(rollup({ a: '1', b: '2' }), sha('{"a":"1","b":"2"}'));
});

test('inputHash: canonical shape is consumes/covers/produces with sorted inner keys', () => {
  const resolver = (cat, key) => `${cat}:${key}`;
  const contract = {
    produces: ['DB-3', 'AC-1'],
    consumes: ['T-2::API-2@v1', 'A-1::B-1@v1'],
    covers: ['FR-2', 'AC-5'],
  };
  const expected = sha(
    '{"consumes":{"A-1::B-1@v1":"consumes:A-1::B-1@v1","T-2::API-2@v1":"consumes:T-2::API-2@v1"},'
    + '"covers":{"AC-5":"covers:AC-5","FR-2":"covers:FR-2"},'
    + '"produces":{"AC-1":"produces:AC-1","DB-3":"produces:DB-3"}}',
  );
  assert.equal(inputHash(contract, resolver), expected);
});

test('inputHash: keyed maps make array order irrelevant', () => {
  const r = (cat, key) => `${cat}:${key}`;
  assert.equal(
    inputHash({ produces: ['a', 'b'], consumes: [], covers: [] }, r),
    inputHash({ produces: ['b', 'a'], consumes: [], covers: [] }, r),
  );
});

test('inputHash: an unresolved key serializes as null', () => {
  assert.equal(
    inputHash({ produces: ['X'], consumes: [], covers: [] }, () => null),
    sha('{"consumes":{},"covers":{},"produces":{"X":null}}'),
  );
});

test('extractElements: anchor grammar and block boundaries', () => {
  const spec = [
    '# Title',
    'intro',
    '#### DB-3 — Users',
    'db body',
    '##### DB-3-sub not an anchor',
    'more db',
    '#### API-2 — Endpoint',
    'api body',
    '## Section',
    '#### db-1 — lowercase kind',
    '#### DB-03 — leading zero',
    '#### TOOLONGKINDABCDEF-1 — over sixteen chars',
    '#### XYZ-9 — unknown kind',
    '#### DB-4 - hyphen not em dash',
    '#### AC-5 — Last to EOF',
    'last body',
  ].join('\n');
  const { elements, unknownKinds } = extractElements(spec, ['DB', 'API', 'AC']);

  assert.deepEqual(elements.map((e) => e.id), ['DB-3', 'API-2', 'AC-5']);
  assert.deepEqual(unknownKinds, ['XYZ']);

  const db3 = elements[0];
  assert.equal(db3.kind, 'DB');
  assert.equal(db3.level, 4);
  assert.equal(db3.title, 'Users');
  // deeper heading and its body stay inside the block; the same-level anchor ends it.
  assert.ok(db3.content.includes('##### DB-3-sub not an anchor'));
  assert.ok(db3.content.includes('more db'));
  assert.ok(!db3.content.includes('api body'));

  // a higher-level heading ends the block.
  assert.ok(!elements[1].content.includes('Section'));

  // the last block runs to EOF.
  assert.ok(elements[2].content.endsWith('last body'));
});

test('extractElements: em dash is required (hyphen does not match)', () => {
  const { elements, unknownKinds, malformedAnchors } = extractElements('#### DB-1 - hyphen\nbody', ['DB']);
  assert.deepEqual(elements, []);
  assert.deepEqual(unknownKinds, []);
  assert.deepEqual(malformedAnchors, [{ line: 1, text: '#### DB-1 - hyphen' }]);
});

test('extractElements: anchor near-misses are reported as malformedAnchors, not dropped silently', () => {
  const spec = [
    '#### TOOLONGKINDABCDEFX-1 — seventeen-char kind',
    '#### DB-03 — leading zero',
    '#### DB-4 - hyphen not em dash',
    '##### DB-3-sub not an anchor',
    '## Plain heading — with a dash',
    '#### DB-5 — valid anchor',
  ].join('\n');
  const { elements, unknownKinds, malformedAnchors } = extractElements(spec, ['DB']);
  assert.deepEqual(elements.map((e) => e.id), ['DB-5']);
  assert.deepEqual(unknownKinds, []);
  assert.deepEqual(malformedAnchors.map((m) => m.line), [1, 2, 3]);
});

test('extractElements: unknown KIND is reported once, never extracted', () => {
  const spec = '#### XYZ-1 — a\n#### XYZ-2 — b';
  const { elements, unknownKinds } = extractElements(spec, ['DB']);
  assert.deepEqual(elements, []);
  assert.deepEqual(unknownKinds, ['XYZ']);
});

test('parseTaskFrontmatter: scalars, inline arrays, one nested inline object', () => {
  const { frontmatter, body } = parseTaskFrontmatter([
    '---',
    'id: T-004',
    'title: Users table',
    'produces: [DB-3]',
    'consumes: [T-002::API-2@v1]',
    'covers: [AC-5, FR-2, NFR-1]',
    'codeDeps: []',
    'builtAgainst: { specHash: "sha256:abc", inputHash: "sha256:def" }',
    'status: implemented',
    'unknownKey: whatever',
    '---',
    '',
    '# Body',
    'content',
  ].join('\n'));

  assert.equal(frontmatter.id, 'T-004');
  assert.equal(frontmatter.title, 'Users table');
  assert.deepEqual(frontmatter.produces, ['DB-3']);
  assert.deepEqual(frontmatter.consumes, ['T-002::API-2@v1']);
  assert.deepEqual(frontmatter.covers, ['AC-5', 'FR-2', 'NFR-1']);
  assert.deepEqual(frontmatter.codeDeps, []);
  assert.deepEqual(frontmatter.builtAgainst, { specHash: 'sha256:abc', inputHash: 'sha256:def' });
  assert.equal(frontmatter.status, 'implemented');
  assert.equal(frontmatter.unknownKey, 'whatever');
  assert.ok(body.includes('# Body'));
});

test('parseTaskFrontmatter: no fence returns empty frontmatter and full body', () => {
  const { frontmatter, body } = parseTaskFrontmatter('no fm here');
  assert.deepEqual(frontmatter, {});
  assert.equal(body, 'no fm here');
});

test('runHasher: basic feature — elements, unknownKinds, rollups, intra resolution', () => {
  const res = runHasher(path.join(FX, 'basic'));

  assert.deepEqual(Object.keys(res.elements).sort(), ['AC-5', 'API-2', 'DB-3', 'FR-2']);
  assert.deepEqual(res.unknownKinds, ['ZZZ']);
  for (const h of Object.values(res.elements)) assert.match(h, SHA_RE);

  assert.equal(res.specHash, rollup(res.elements));

  assert.deepEqual(Object.keys(res.tasks).sort(), ['T-002', 'T-004']);
  for (const t of Object.values(res.tasks)) {
    assert.match(t.inputHash, SHA_RE);
    assert.match(t.contentHash, SHA_RE);
  }

  const tmap = Object.fromEntries(Object.entries(res.tasks).map(([id, t]) => [id, t.inputHash]));
  assert.equal(res.tasksHash, rollup(tmap));

  // T-004 consumes T-002::API-2@v1 → the fresh API-2 element hash from this spec.
  const expected = inputHash(
    { produces: ['DB-3'], consumes: ['T-002::API-2@v1'], covers: ['AC-5', 'FR-2'] },
    (cat, key) => (cat === 'consumes' ? res.elements['API-2'] : res.elements[key]),
  );
  assert.equal(res.tasks['T-004'].inputHash, expected);
});

test('runHasher: cross-feature ref resolves to the live upstream manifest hash', () => {
  const root = path.join(FX, 'crossroot');
  const consumer = path.join(root, 'consumer');
  const res = runHasher(consumer, { featuresRoot: root });
  const producerHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000009';

  const expected = inputHash(
    { produces: ['MODULE-1'], consumes: ['producer#API-9@v1'], covers: ['AC-1'] },
    (cat, key) => (cat === 'consumes' ? producerHash : res.elements[key]),
  );
  assert.equal(res.tasks['T-001'].inputHash, expected);

  // default featuresRoot (parent dir of the feature) resolves identically.
  const resDefault = runHasher(consumer);
  assert.equal(resDefault.tasks['T-001'].inputHash, expected);
});

test('runHasher: unresolvable-in-workspace ref falls back to the upstream pin hash', () => {
  const res = runHasher(path.join(FX, 'pinned'));
  const pinHash = 'sha256:00000000000000000000000000000000000000000000000000000000000000a3';
  const expected = inputHash(
    { produces: ['MODULE-1'], consumes: ['ghost#API-3@v1'], covers: [] },
    (cat, key) => (cat === 'consumes' ? pinHash : res.elements[key]),
  );
  assert.equal(res.tasks['T-001'].inputHash, expected);
});

test('runHasher: a cross-feature ref with no live manifest and no pin errors', () => {
  assert.throws(() => runHasher(path.join(FX, 'unresolvable')), HasherError);
});

test('runHasher: missing spec.md errors', () => {
  assert.throws(() => runHasher(path.join(FX, 'does-not-exist')), HasherError);
});

test('runHasher: no anchors → empty elements and null specHash; no tasks → null tasksHash', () => {
  const res = runHasher(path.join(FX, 'no-elements'));
  assert.deepEqual(res.elements, {});
  assert.equal(res.specHash, null);
  assert.deepEqual(res.tasks, {});
  assert.equal(res.tasksHash, null);
});

test('runHasher: missing manifest falls back to the seed KIND dictionary', () => {
  const res = runHasher(path.join(FX, 'seed-dict'));
  assert.ok('DB-1' in res.elements);
  assert.ok(SEED_KINDS.includes('T'));
  assert.ok(SEED_KINDS.includes('DESIGN'));
});
