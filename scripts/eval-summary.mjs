#!/usr/bin/env node
// Summarise a run-evals.sh run directory (trial-<i>.json + meta.json) per test and per suite;
// prints a table and writes summary.json next to the trials.
//
//   node scripts/eval-summary.mjs plugins/fd3/evals/.results/runs/<run>
import fs from 'node:fs';
import path from 'node:path';

const runDir = process.argv[2];
if (!runDir) {
  console.error('usage: node scripts/eval-summary.mjs <run-dir>');
  process.exit(2);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const metaPath = path.join(runDir, 'meta.json');
const meta = fs.existsSync(metaPath) ? readJson(metaPath) : null;

const trialFiles = fs
  .readdirSync(runDir)
  .map((f) => /^trial-(\d+)\.json$/.exec(f))
  .filter(Boolean)
  .map((m) => ({ index: Number(m[1]), file: path.join(runDir, m[0]) }))
  .sort((a, b) => a.index - b.index);

const expectedTrials = meta?.trials ?? trialFiles.length;
const missingTrials = [];
for (let i = 1; i <= expectedTrials; i++) {
  if (!trialFiles.some((t) => t.index === i)) missingTrials.push(i);
}

// promptfoo's ResultFailureReason: 0 none, 1 assertion failed, 2 error (the test never got graded).
const FAILURE_REASON_ERROR = 2;

const Z = 1.96;
function wilson(passes, n) {
  if (n === 0) return null;
  const p = passes / n;
  const denom = 1 + (Z * Z) / n;
  const centre = (p + (Z * Z) / (2 * n)) / denom;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function percentile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

const configuredTarget = meta?.configured_target_model?.[0] ?? null;
const matchesConfigured = (m) =>
  configuredTarget === null || m.canonical === configuredTarget || m.key.replace(/\[.*\]$/, '') === configuredTarget;

// modelUsage also holds subagents and the CLI's own helper calls (e.g. a Haiku title request), and a
// sonnet researcher can outspend the main thread, so the configured target is the main model whenever
// it appears at all; only without it does the biggest spender stand in.
function primaryModel(modelUsage) {
  if (!modelUsage || typeof modelUsage !== 'object') return null;
  let best = null;
  let bestWeight = -1;
  for (const [key, usage] of Object.entries(modelUsage)) {
    if (!key || key === 'undefined') continue;
    const model = { key, canonical: usage?.canonicalModel ?? key };
    if (configuredTarget !== null && matchesConfigured(model)) return model;
    const weight = usage?.costUSD ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    if (weight > bestWeight) {
      bestWeight = weight;
      best = model;
    }
  }
  return best;
}

const tests = new Map();
for (const { index, file } of trialFiles) {
  const results = readJson(file).results?.results ?? [];
  const seen = new Map();
  for (const r of results) {
    const description = r.testCase?.description ?? `test #${r.testIdx}`;
    seen.set(description, (seen.get(description) ?? 0) + 1);
  }
  for (const r of results) {
    const description = r.testCase?.description ?? `test #${r.testIdx}`;
    const id = seen.get(description) > 1 ? `${description} [${r.prompt?.label ?? r.promptIdx}]` : description;
    if (!tests.has(id)) tests.set(id, { id, trials: [] });
    const usage = r.response?.metadata?.modelUsage;
    tests.get(id).trials.push({
      trial: index,
      pass: r.success === true,
      error: r.success !== true && r.failureReason === FAILURE_REASON_ERROR,
      cost: typeof r.cost === 'number' ? r.cost : null,
      latencyMs: typeof r.latencyMs === 'number' ? r.latencyMs : null,
      primaryModel: primaryModel(usage),
      models: usage && typeof usage === 'object' ? Object.keys(usage) : null,
    });
  }
}

function countBy(values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

const perTest = [...tests.values()].map(({ id, trials }) => {
  const n = trials.length;
  const passes = trials.filter((t) => t.pass).length;
  const errors = trials.filter((t) => t.error).length;
  const primaries = trials.map((t) => t.primaryModel).filter(Boolean);
  const recorded = trials.some((t) => t.models !== null);
  return {
    test: id,
    trials: n,
    passes,
    failures: n - passes - errors,
    errors,
    pass_rate: n ? passes / n : null,
    pass_rate_wilson95: wilson(passes, n),
    // pass^k: every one of the run's trials ran this test and passed it.
    pass_all_trials: n === expectedTrials && passes === n,
    mean_cost_usd: mean(trials.map((t) => t.cost).filter((c) => c !== null)),
    latency_ms_p50: percentile(trials.map((t) => t.latencyMs).filter((l) => l !== null), 0.5),
    latency_ms_p95: percentile(trials.map((t) => t.latencyMs).filter((l) => l !== null), 0.95),
    actual_model: recorded ? countBy(primaries.map((m) => m.canonical)) : null,
    subagent_models: recorded
      ? [...new Set(trials.flatMap((t) => t.models ?? []))].filter((k) => !primaries.some((m) => m.key === k))
      : null,
    model_mismatch: recorded ? primaries.some((m) => !matchesConfigured(m)) : null,
    per_trial: trials.map((t) => ({ trial: t.trial, pass: t.pass, error: t.error, cost: t.cost, latencyMs: t.latencyMs })),
  };
});

const all = perTest.flatMap((t) => t.per_trial);
const suitePasses = all.filter((t) => t.pass).length;
const suiteErrors = all.filter((t) => t.error).length;
const totals = {
  tests: perTest.length,
  results: all.length,
  passes: suitePasses,
  failures: all.length - suitePasses - suiteErrors,
  errors: suiteErrors,
  pass_rate: all.length ? suitePasses / all.length : null,
  pass_rate_wilson95: wilson(suitePasses, all.length),
  tests_passing_all_trials: perTest.filter((t) => t.pass_all_trials).length,
  total_cost_usd: all.reduce((a, t) => a + (t.cost ?? 0), 0),
  model_mismatches: perTest.filter((t) => t.model_mismatch).length,
};

const summary = {
  run_dir: runDir,
  meta,
  trials_expected: expectedTrials,
  trials_found: trialFiles.length,
  missing_trials: missingTrials,
  cost_note: 'cost is the target provider cost promptfoo records per result; grader calls are not included',
  grader_model_note: 'the result JSON does not record which model graded llm-rubric asserts; only the configured one is known',
  tests: perTest,
  totals,
};
fs.writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

const pct = (x) => (x === null ? '–' : `${Math.round(x * 100)}%`);
const interval = (ci) => (ci ? `[${pct(ci[0])}, ${pct(ci[1])}]` : '');
const usd = (x) => (x === null ? '–' : `$${x.toFixed(2)}`);
const secs = (ms) => (ms === null ? '–' : `${(ms / 1000).toFixed(0)}s`);
const models = (t) => {
  if (t.actual_model === null) return 'not recorded';
  const main = Object.entries(t.actual_model).map(([m, c]) => (c === t.trials ? m : `${m}×${c}`)).join(', ');
  return `${main}${t.model_mismatch ? ' (≠ configured)' : ''}`;
};

const rows = perTest.map((t) => [
  t.test,
  `${t.passes}/${t.trials}`,
  `${pct(t.pass_rate)} ${interval(t.pass_rate_wilson95)}`,
  t.pass_all_trials ? 'yes' : 'no',
  `${t.failures}/${t.errors}`,
  usd(t.mean_cost_usd),
  `${secs(t.latency_ms_p50)}/${secs(t.latency_ms_p95)}`,
  models(t),
]);
const header = ['test', 'pass', 'rate [95% Wilson]', 'pass^k', 'fail/err', 'mean cost', 'p50/p95', 'model (actual)'];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();

console.log(`\n${runDir}`);
if (meta) {
  console.log(
    `sha ${meta.git_sha?.slice(0, 7)}${meta.git_dirty ? ' (dirty)' : ''} · ${meta.config}` +
      `${meta.filter_pattern ? ` · filter ${meta.filter_pattern}` : ''} · promptfoo ${meta.promptfoo_version}` +
      ` · SDK ${meta.claude_agent_sdk_version} · Claude Code ${meta.claude_code_version}`,
  );
  console.log(
    `configured target ${meta.configured_target_model?.join(', ') ?? 'unpinned'} · grader ` +
      `${meta.configured_grader_model ?? 'unpinned'} (grader model actually used: not recorded in results)`,
  );
} else {
  console.log('no meta.json — configured models and versions unknown');
}
console.log(`trials ${trialFiles.length}/${expectedTrials}${missingTrials.length ? ` · missing trial ${missingTrials.join(', ')}` : ''}\n`);
console.log(line(header));
for (const r of rows) console.log(line(r));
console.log(
  `\nsuite: ${totals.passes}/${totals.results} passed ${pct(totals.pass_rate)} ${interval(totals.pass_rate_wilson95)}` +
    ` · ${totals.failures} failed · ${totals.errors} errored · pass^k ${totals.tests_passing_all_trials}/${totals.tests} tests` +
    ` · target cost ${usd(totals.total_cost_usd)}` +
    `${totals.model_mismatches ? ` · ${totals.model_mismatches} test(s) answered by a model other than the configured one` : ''}`,
);
