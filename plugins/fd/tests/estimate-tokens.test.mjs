import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { countChars, estimateTokens, runEstimate } from '../scripts/estimate-tokens.mjs';

const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname);
const SAMPLE = path.join(HERE, 'fixtures', 'hasher', 'estimate-sample.txt');

test('countChars: counts ASCII by code point', () => {
  assert.equal(countChars('abcd'), 4);
  assert.equal(countChars(''), 0);
});

test('countChars: a surrogate-pair emoji is a single code point', () => {
  const emoji = String.fromCodePoint(0x1f600);
  assert.equal(emoji.length, 2); // two UTF-16 units
  assert.equal(countChars(emoji), 1);
  assert.equal(countChars('a' + emoji + 'b'), 3);
});

test('countChars: a combining sequence counts as separate code points', () => {
  const decomposed = 'e' + String.fromCodePoint(0x0301);
  assert.equal(countChars(decomposed), 2);
});

test('estimateTokens: exact ceil division', () => {
  assert.deepEqual(estimateTokens('abcd', 4), { chars: 4, tokens: 1 });
  assert.deepEqual(estimateTokens('abcde', 4), { chars: 5, tokens: 2 });
  assert.deepEqual(estimateTokens('abcdefgh', 4), { chars: 8, tokens: 2 });
});

test('estimateTokens: default chars-per-token is 4', () => {
  assert.deepEqual(estimateTokens('abcd'), { chars: 4, tokens: 1 });
});

test('estimateTokens: fractional chars-per-token', () => {
  assert.deepEqual(estimateTokens('abcdefg', 3.5), { chars: 7, tokens: 2 });
  assert.deepEqual(estimateTokens('abcdefgh', 3.5), { chars: 8, tokens: 3 });
});

test('estimateTokens: zero-length input yields zero tokens', () => {
  assert.deepEqual(estimateTokens(''), { chars: 0, tokens: 0 });
});

test('estimateTokens: rejects non-positive or non-numeric chars-per-token', () => {
  assert.throws(() => estimateTokens('a', 0));
  assert.throws(() => estimateTokens('a', -1));
  assert.throws(() => estimateTokens('a', 'abc'));
});

test('runEstimate: reads a file and counts code points', () => {
  const text = fs.readFileSync(SAMPLE, 'utf8');
  const chars = [...text].length;
  assert.deepEqual(runEstimate(SAMPLE, 4), { chars, tokens: Math.ceil(chars / 4) });
  assert.deepEqual(runEstimate(SAMPLE, 3.5), { chars, tokens: Math.ceil(chars / 3.5) });
});

test('runEstimate: missing file errors', () => {
  assert.throws(() => runEstimate(path.join(HERE, 'nope-does-not-exist.txt')));
});
