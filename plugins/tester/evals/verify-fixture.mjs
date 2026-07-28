#!/usr/bin/env node
// Drive every probe in answer-key.json against the running target app and fail loudly when
// the fixture and the key disagree. reset-sandbox.sh runs this before the eval: a fixture that
// has drifted from its key still produces a green-looking run whose recall number means
// nothing, and that is a far more expensive failure than an early exit here.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const key = JSON.parse(fs.readFileSync(path.join(DIR, 'answer-key.json'), 'utf8'));

const API = process.env.APP_BASE_URL || 'http://localhost:4310';
const PDP_CONTAINER = process.env.PDP_CONTAINER || 'tester-eval-pdp';

const cookies = new Map();

async function login(persona) {
  const creds = key.personas[persona];
  const r = await fetch(`${API}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  });
  if (!r.ok) throw new Error(`login for ${persona} failed with ${r.status}`);
  const raw = r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie')];
  const tsid = raw.join(';').match(/tsid=([^;]+)/)?.[1];
  if (!tsid) throw new Error(`no tsid cookie returned for ${persona}`);
  cookies.set(persona, `tsid=${tsid}`);
}

async function call({ persona, method = 'GET', path: p, ui, badLogin, body }) {
  if (badLogin) {
    await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=member@example.test&password=definitely-wrong',
      redirect: 'manual',
    });
    const page = await fetch(`${API}/login?failed=1`);
    return { status: page.status, body: await page.text() };
  }
  const headers = {};
  if (persona) headers.cookie = cookies.get(persona);
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch(`${API}${p}`, {
    method,
    headers,
    redirect: 'manual',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.text(), ui };
}

const problems = [];
const record = (label, cond, detail) => {
  if (!cond) problems.push(`${label}: ${detail}`);
};

async function runDefect(d) {
  const got = await call(d.probe);
  const label = `${d.id} (${d.ac}, ${d.surface})`;
  if (d.actual !== undefined) {
    record(label, got.status === d.actual, `expected the planted status ${d.actual}, got ${got.status}`);
  }
  if (d.actualBodyContains) {
    record(label, got.body.includes(d.actualBodyContains), `body should still leak "${d.actualBodyContains}"`);
  }
  if (d.actualPresent) {
    record(label, got.body.includes(d.actualPresent), `page should still contain ${d.actualPresent}`);
  }
  if (d.specified !== undefined) {
    record(label, got.status !== d.specified, `fixture now matches the spec (${d.specified}) — the defect is gone`);
  }
}

async function runCorrect(c) {
  const got = await call(c.probe);
  const label = `${c.ac} (${c.note})`;
  if (c.expect !== undefined) {
    record(label, got.status === c.expect, `expected ${c.expect}, got ${got.status}`);
  }
  for (const s of c.expectBodyContains || []) {
    record(label, got.body.includes(s), `body should contain "${s}"`);
  }
  for (const s of c.expectBodyExcludes || []) {
    record(label, !got.body.includes(s), `body should NOT contain "${s}"`);
  }
  if (c.expectPresent) {
    record(label, got.body.includes(c.expectPresent), `page should contain ${c.expectPresent}`);
  }
}

const pdp = (action) => execFileSync('docker', [action, PDP_CONTAINER], { stdio: 'pipe' });
const isPaused = (p) => p.probe?.pdpPaused === true;

try {
  for (const persona of Object.keys(key.personas)) await login(persona);

  for (const d of key.defects.filter((x) => !isPaused(x))) await runDefect(d);
  for (const c of key.correct.filter((x) => !isPaused(x))) await runCorrect(c);

  const paused = [
    ...key.defects.filter(isPaused).map((d) => ['defect', d]),
    ...key.correct.filter(isPaused).map((c) => ['correct', c]),
  ];
  if (paused.length) {
    pdp('pause');
    try {
      for (const [kind, item] of paused) {
        if (kind === 'defect') await runDefect(item);
        else await runCorrect(item);
      }
    } finally {
      pdp('unpause');
    }
  }
} catch (e) {
  console.error(`fixture verification could not complete: ${e.message}`);
  process.exit(1);
}

if (problems.length) {
  console.error('Fixture no longer matches answer-key.json:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

const counts = `${key.defects.length} planted defects + ${key.correct.length} correct behaviours`;
console.log(`tester evals: fixture matches the answer key (${counts}).`);
