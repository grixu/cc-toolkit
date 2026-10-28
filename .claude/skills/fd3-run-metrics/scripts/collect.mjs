#!/usr/bin/env node
// Flatten every fd3 implement-run/repair-run workflow in the local Claude Code transcript stores
// into a snapshot directory: runs.jsonl, agents.jsonl, branches.jsonl, findings.jsonl, meta.json.
//
//   node collect.mjs [--since ISO] [--until ISO] [--out DIR]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { since: { type: 'string' }, until: { type: 'string' }, out: { type: 'string' } } });
const since = args.since ? new Date(args.since) : null;
const until = args.until ? new Date(args.until) : null;
if ((since && isNaN(since)) || (until && isNaN(until))) {
  console.error('usage: node collect.mjs [--since ISO] [--until ISO] [--out DIR]');
  process.exit(2);
}

const HOME = os.homedir();
const day = (d) => (d ? d.toISOString().slice(0, 10) : 'all');
const outDir = args.out || path.join(HOME, '.claude', 'fd3-run-metrics', `${day(since)}_${day(until)}`);
const WORKFLOWS = new Set(['implement-run', 'repair-run']);

// $/MTok: [input, cache write 5m, cache write 1h, cache read, output].
// Anthropic list prices, https://platform.claude.com/docs/en/about-claude/pricing, checked 2026-10-25.
const PRICE = {
  'opus-5-5': [4, 5, 8, 0.2, 20],
  'opus-5': [5, 6.25, 10, 0.5, 25],
  'sonnet-5-5': [2, 2.5, 4, 0.1, 10],
  'haiku-5-5': [0.1, 0.125, 0.2, 0.01, 0.5],
  'haiku-4-5': [1, 1.25, 2, 0.1, 5],
};
const family = (m = '') => {
  if (/opus-5-5/.test(m)) return 'opus-5-5';
  if (/opus-5/.test(m)) return 'opus-5';
  if (/sonnet-5-5/.test(m) || m === 'sonnet') return 'sonnet-5-5';
  if (/haiku-5-5/.test(m) || m === 'haiku') return 'haiku-5-5';
  if (/haiku-4-5/.test(m)) return 'haiku-4-5';
  return 'opus-5-5';
};

// Labels as implement-run.js names its agents; a retry or an unfinished-CI rerun is the same role.
const baseLabel = (label) => label.replace(/(:retry|:unfinished)+$/, '');
const category = (label) => {
  const l = baseLabel(label);
  if (/^(scout|baseline|handover)\b/.test(l)) return 'recon';
  if (/^wave\d+/.test(l)) return 'implement';
  if (/^repair\b/.test(l)) return 'repair-impl';
  if (/^merge\d*\b/.test(l)) return 'merge';
  if (/^refresh\b/.test(l)) return 'refresh';
  if (/^(mark-blocked|toolchain-touch|mark|unmark)\b/.test(l)) return 'bookkeeping';
  if (/^ci:.*:final/.test(l)) return 'ci-final';
  if (/^ci:.*#\d+$/.test(l)) return 'ci-scoped';
  if (/^ci:/.test(l)) return 'ci-full';
  if (/^fix-ci\b/.test(l)) return 'fix-ci';
  if (/^fix-final\b/.test(l)) return 'fix-final';
  if (/^(fix-cr|fix-review)\b/.test(l)) return 'fix-review';
  if (/^conformance\b/.test(l)) return 'conformance';
  if (/^cr-prep\b/.test(l)) return 'cr-prep';
  if (/^cr-merge\b/.test(l)) return 'cr-merge';
  if (/^cr:/.test(l)) return 'cr-scan';
  return 'other';
};

const readJsonl = (file) => {
  const rows = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {}
  }
  return rows;
};

// One API response is split over several transcript lines that repeat its usage, so usage is
// counted once per message id.
const transcriptOf = (file) => {
  if (!fs.existsSync(file)) return null;
  const byId = new Map();
  const models = new Set();
  let structured = null;
  for (const r of readJsonl(file)) {
    if (r.type !== 'assistant' || !r.message) continue;
    for (const c of r.message.content || []) {
      if (c.type === 'tool_use' && c.name === 'StructuredOutput') structured = c.input;
    }
    if (!r.message.usage) continue;
    byId.set(r.message.id || r.uuid, r.message.usage);
    if (r.message.model) models.add(r.message.model);
  }
  const u = { turns: byId.size, inp: 0, cw5m: 0, cw1h: 0, cr: 0, out: 0, peak: 0 };
  for (const x of byId.values()) {
    const cw = x.cache_creation_input_tokens || 0;
    const cw1h = x.cache_creation?.ephemeral_1h_input_tokens || 0;
    u.inp += x.input_tokens || 0;
    u.cw1h += cw1h;
    u.cw5m += cw - cw1h;
    u.cr += x.cache_read_input_tokens || 0;
    u.out += x.output_tokens || 0;
    u.peak = Math.max(u.peak, (x.input_tokens || 0) + cw + (x.cache_read_input_tokens || 0));
  }
  return { usage: u, models: [...models], structured };
};

const ciVerdict = (o) => {
  if (!o) return 'no-output';
  if (/captur|collected|not run|was not/i.test(o.dirty || '')) return 'protocol-breach';
  if ((o.incomplete || []).length || (o.failures || []).some((x) => /incomplete|still running|no verdict/i.test(x))) return 'incomplete';
  if ((o.dirty || '').trim()) return 'dirty';
  return o.passed ? 'passed' : 'failed';
};

const storeRoots = () => {
  const roots = [path.join(HOME, '.claude', 'projects')];
  const ccs = path.join(HOME, '.ccs');
  for (const group of ['instances', 'shared/context-groups']) {
    const dir = path.join(ccs, group);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) roots.push(path.join(dir, name, 'projects'));
  }
  return roots.filter((r) => fs.existsSync(r));
};

const lsDirs = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink());
  } catch {
    return [];
  }
};

// Instances symlink their projects dir to one shared store, so the same run shows up under
// several roots.
const runFiles = new Map();
for (const root of storeRoots()) {
  for (const proj of lsDirs(root)) {
    for (const session of lsDirs(path.join(root, proj.name))) {
      const wfDir = path.join(root, proj.name, session.name, 'workflows');
      if (!fs.existsSync(wfDir)) continue;
      for (const f of fs.readdirSync(wfDir)) {
        if (!/^wf_.*\.json$/.test(f)) continue;
        const file = path.join(wfDir, f);
        runFiles.set(fs.realpathSync(file), { proj: proj.name });
      }
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });
const out = Object.fromEntries(
  ['runs', 'agents', 'branches', 'findings'].map((k) => [k, fs.createWriteStream(path.join(outDir, `${k}.jsonl`))]),
);
const meta = { since: since?.toISOString() ?? null, until: until?.toISOString() ?? null, collectedAt: new Date().toISOString(), runs: 0, agents: 0, missingTranscripts: 0, usd: 0, fd3Versions: {} };

for (const [file, { proj }] of [...runFiles.entries()].sort()) {
  let run;
  try {
    run = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    continue;
  }
  if (!WORKFLOWS.has(run.workflowName)) continue;
  const ts = new Date(run.timestamp);
  if ((since && ts < since) || (until && ts >= until)) continue;

  const fd3Version = /\/fd3\/([^/]+)\/workflows\//.exec(run.scriptPath || '')?.[1] ?? null;
  const base = { run: run.runId, wf: run.workflowName, fd3Version, proj, ts: run.timestamp };
  const transcripts = path.join(path.dirname(path.dirname(file)), 'subagents', 'workflows', run.runId);
  const agents = (run.workflowProgress || []).filter((a) => a.type === 'workflow_agent');
  let runUsd = 0;

  for (const a of agents) {
    const t = transcriptOf(path.join(transcripts, `agent-${a.agentId}.jsonl`));
    const cat = category(a.label);
    const parts = baseLabel(a.label).split(':');
    const fam = family(t?.models[0] || a.model);
    const u = t?.usage ?? { turns: 0, inp: 0, cw5m: 0, cw1h: 0, cr: 0, out: 0, peak: 0 };
    const p = PRICE[fam];
    const usd = (u.inp * p[0] + u.cw5m * p[1] + u.cw1h * p[2] + u.cr * p[3] + u.out * p[4]) / 1e6;
    runUsd += usd;
    if (!t) meta.missingTranscripts++;

    const row = { ...base, label: a.label, cat, retry: /:retry$/.test(a.label), agentType: a.agentType ?? null, model: a.model, fam, state: a.state, toolCalls: a.toolCalls, durationMs: a.durationMs, ...u, usd, hasTranscript: !!t };
    if (cat === 'cr-scan') {
      row.lens = parts.at(-1);
      // fd3 0.1.0 labelled scans cr:<repo>:<branch>:<skill>, with no pass segment.
      row.pass = parts.length >= 5 ? parts.at(-2) : null;
      try {
        row.filesTotal = JSON.parse(a.resultPreview).filesTotal ?? null;
      } catch {
        row.filesTotal = null;
      }
    }
    if (/^ci-/.test(cat)) row.ciVerdict = ciVerdict(t?.structured);
    if (/^fix-(ci|final)$/.test(cat)) {
      const o = t?.structured;
      // Some fd3 versions' fixers return no commit range; for those whether they committed is unknown.
      row.committed = o?.fromSha && o?.toSha ? o.fromSha !== o.toSha : null;
    }
    if (cat === 'cr-merge') {
      row.pass = parts.at(-1);
      const findings = t?.structured?.findings || [];
      row.findings = findings.length;
      for (const f of findings) out.findings.write(JSON.stringify({ ...base, label: a.label, pass: row.pass, ...f }) + '\n');
    }
    out.agents.write(JSON.stringify(row) + '\n');
    meta.agents++;
  }

  const result = run.result && typeof run.result === 'object' ? run.result : {};
  for (const b of result.branches || []) {
    out.branches.write(JSON.stringify({ ...base, repo: path.basename(b.repo || ''), branch: b.branch, ci: b.ci, fixRounds: b.fixRounds ?? 0, reviewFindings: b.reviewFindings ?? null }) + '\n');
  }
  const hil = (result.hil || []).map((h) => ({ kind: h.kind, stage: h.stage ?? null }));
  out.runs.write(JSON.stringify({ ...base, file, status: run.status, mode: run.args?.mode ?? null, review: run.args?.review ?? null, durationMs: run.durationMs, agents: agents.length, branches: (result.branches || []).length, hil, usd: runUsd }) + '\n');
  meta.runs++;
  meta.usd += runUsd;
  meta.fd3Versions[fd3Version] = (meta.fd3Versions[fd3Version] || 0) + 1;
}

await Promise.all(Object.values(out).map((s) => new Promise((r) => s.end(r))));
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`${meta.runs} runs, ${meta.agents} agents, $${meta.usd.toFixed(2)} at list price, ${meta.missingTranscripts} missing transcripts → ${outDir}`);
