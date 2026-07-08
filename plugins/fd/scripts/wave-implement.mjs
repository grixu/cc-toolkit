// Claude Code dynamic-workflow script for /fd:implement — the FULL delivery cycle in
// one run: for every wave (computed here from task deps) it prepares worktrees, runs the
// task agents, squash-merges the passing tasks (fd:merger), gates the wave with a
// typecheck+build smoke plus AC verification (in parallel), and repairs red gates up to
// K iterations; after the last wave it runs the feature's first full CI, the
// whole-feature code review, mechanical fixes, autosquash, and the final full CI. It calls the harness
// `agent()` / `parallel()` globals and is launched via the Workflow tool (scriptPath);
// it is NEVER run with `node`.
//
// The run returns early with status "escalated" for decisions a human must make
// (architectural spec gap, repair exhaustion, CR judgment call), for an engine agent
// that returned no result (cause invisible here — kill, API error, or rate limit), and
// for invalid args (kind "invalid-args": regenerate engine-args.json, relaunch, no HIL);
// status "continue" means the internal agent budget is spent — the main thread
// relaunches with the remaining tasks, no HIL. An escalated wave's red gate returns as
// gateDebt, settled at the start of the relaunch. State files are NOT written here:
// the `Task: <id>` trailers on the feature branch are the in-run ledger, and the main
// thread persists them via record-impl.mjs at every return.
//
// The return itself is a SLIM summary: the full run detail (per-task diagnoses and
// changed files, per-AC verdicts with evidence, CR findings) goes to
// <featureDir>/impl-run-report.json — written by a low-effort agent, because this
// script has no filesystem access — and the return carries the pointer as `report`.
// Escalations stay complete in the return (HIL acts on them without a file read);
// if the report writer dies, the fat payload returns as-is with `report: null`.
//
// The runtime provides `args` and the `agent`/`parallel`/`phase`/`log` globals, wraps
// the body in an async context, and takes the body's top-level `return` as the workflow
// result — hence the final `return await run(args)` line. That line is illegal under
// plain `node`, so the unit tests import this module by stripping it (see
// tests/wave-implement.test.mjs); everything above it is import-safe and side-effect-free.
// No Date.now()/Math.random() here — the script is deterministic; agents produce any
// time-dependent values.

export const meta = {
  name: 'wave-implement',
  description:
    'Full /fd:implement cycle in one run: waves from task deps (worktree isolation, per-task self-gate, breadcrumb), serial squash-merge per wave, per-wave smoke (typecheck+build) plus AC verification with a bounded repair loop, then feature close (first full CI, code review, mechanical fixes, autosquash, final CI). Returns completed | continue | escalated as a slim summary plus a pointer to the full run report at <featureDir>/impl-run-report.json; the main thread persists state from Task: trailers at every return.',
};

// Defensive: the Workflow tool should pass `args` as a real object, but a live-authored
// launch can pass it JSON-encoded as a string; a naive typeof check then silently drops
// the whole payload. Parse the string form, and validate every field the run path relies on.
function parseArgs(rawArgs) {
  let a = rawArgs;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch (err) {
      throw new Error(`wave-implement: args is a string but not valid JSON: ${err.message}`);
    }
  }
  if (!a || typeof a !== 'object' || Array.isArray(a)) {
    throw new Error('wave-implement: args must be an object (or a JSON string encoding one)');
  }

  const {
    mode, featureDir, slug, repoRoot, featureBranch, baseBranch,
    tasks, gate, ci, worktreeSetup, worktreeCleanup, codeReview, repair, budget,
  } = a;
  const close = a.close === undefined ? true : a.close;

  if (mode !== 'full' && mode !== 'repair') {
    throw new Error(`wave-implement: args.mode must be "full" or "repair", got ${JSON.stringify(mode)}`);
  }
  for (const [name, value] of [
    ['featureDir', featureDir], ['slug', slug], ['repoRoot', repoRoot],
    ['featureBranch', featureBranch], ['baseBranch', baseBranch],
  ]) {
    if (typeof value !== 'string' || value === '') {
      throw new Error(`wave-implement: args.${name} must be a non-empty string`);
    }
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('wave-implement: args.tasks must be a non-empty array');
  }
  // tasksCount is an optional corruption tripwire: a hand-relayed args payload that lost
  // or duplicated a task no longer matches the count the main thread declared.
  if (a.tasksCount !== undefined && a.tasksCount !== tasks.length) {
    throw new Error(`wave-implement: args.tasksCount (${a.tasksCount}) does not match tasks.length (${tasks.length}) — corrupted args, regenerate engine-args.json and relaunch`);
  }
  tasks.forEach((t, i) => {
    if (!t || typeof t !== 'object') {
      throw new Error(`wave-implement: tasks[${i}] must be an object`);
    }
    for (const field of ['id', 'worktree', 'branch', 'taskFile']) {
      if (typeof t[field] !== 'string' || t[field] === '') {
        throw new Error(`wave-implement: tasks[${i}].${field} must be a non-empty string`);
      }
    }
    if (!/^T-\d+$/.test(t.id)) {
      throw new Error(`wave-implement: tasks[${i}].id must match T-<n>, got ${JSON.stringify(t.id)}`);
    }
    for (const field of ['deps', 'serializeAfter', 'acIds']) {
      if (t[field] !== undefined && !Array.isArray(t[field])) {
        throw new Error(`wave-implement: tasks[${i}].${field} must be an array when present`);
      }
    }
    // A task referencing itself is never a real edge — it is corruption (the field-tested
    // failure mode of relaying args by hand). Rejecting beats silently filtering: the
    // intended edge pointed SOMEWHERE, and dropping it would lose a serialization constraint.
    for (const field of ['deps', 'serializeAfter']) {
      for (const ref of t[field] ?? []) {
        if (typeof ref !== 'string' || !/^T-\d+$/.test(ref)) {
          throw new Error(`wave-implement: tasks[${i}].${field} entry must match T-<n>, got ${JSON.stringify(ref)} — corrupted args?`);
        }
        if (ref === t.id) {
          throw new Error(`wave-implement: tasks[${i}].${field} references the task itself (${t.id}) — corrupted args, regenerate engine-args.json and relaunch`);
        }
      }
    }
  });
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    throw new Error('wave-implement: args.gate must be an object');
  }
  if (!ci || typeof ci !== 'object' || Array.isArray(ci)) {
    throw new Error('wave-implement: args.ci must be an object carrying the configured commands (typecheck, build, lint, test, packageManager; null = confirmed absence)');
  }
  if (!codeReview || !Array.isArray(codeReview.skills) || codeReview.skills.length === 0) {
    throw new Error('wave-implement: args.codeReview.skills must be a non-empty array');
  }
  if (!repair || !Number.isInteger(repair.maxIterations) || repair.maxIterations < 1) {
    throw new Error('wave-implement: args.repair.maxIterations must be a positive integer');
  }
  // gateDebt: the un-repaired gate verdict of a prior run's escalated wave (its gate ran
  // but repair waited for the human). Settled before wave 0 so new worktrees are not cut
  // from a known-red branch.
  let gateDebt = null;
  if (a.gateDebt !== undefined && a.gateDebt !== null) {
    const g = a.gateDebt;
    if (typeof g !== 'object' || Array.isArray(g)) {
      throw new Error('wave-implement: args.gateDebt must be an object { smoke, acs } when present');
    }
    const acs = g.acs ?? [];
    if (!Array.isArray(acs) || acs.some((x) => typeof x !== 'string' || x === '')) {
      throw new Error('wave-implement: args.gateDebt.acs must be an array of AC ids');
    }
    if (g.smoke === true || acs.length > 0) gateDebt = { smoke: g.smoke === true, acs };
  }

  return {
    mode, featureDir, slug, repoRoot, featureBranch, baseBranch, tasks, gate, ci, gateDebt,
    graphMcp: a.graphMcp === true,
    worktreeSetup: Array.isArray(worktreeSetup) ? worktreeSetup : [],
    worktreeCleanup: worktreeCleanup === 'keep-failed' ? 'keep-failed' : 'always',
    codeReview,
    repair,
    budget: budget && Number.isInteger(budget.maxAgents) && budget.maxAgents > 0
      ? { maxAgents: budget.maxAgents }
      : { maxAgents: 200 },
    close: Boolean(close),
  };
}

// Pure scheduler for the read-after-write serialization hints. Returns an array of
// batches (arrays of tasks): a task with no `serializeAfter` lands in the first batch;
// a task lands in the earliest batch after ALL of its `serializeAfter` predecessors.
// Unknown refs and cycles throw. Batches run sequentially; tasks within a batch run in
// parallel. Input order is preserved inside each batch so a rerun schedules identically.
function scheduleFromSerializeAfter(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];

  const byId = new Map();
  for (const t of tasks) {
    if (!t || typeof t.id !== 'string' || t.id === '') {
      throw new Error('scheduleFromSerializeAfter: every task needs a non-empty string id');
    }
    if (byId.has(t.id)) {
      throw new Error(`scheduleFromSerializeAfter: duplicate task id ${t.id}`);
    }
    byId.set(t.id, t);
  }

  const predsOf = (t) => {
    const s = t.serializeAfter;
    if (Array.isArray(s)) return s;
    if (typeof s === 'string' && s) return [s];
    return [];
  };

  const VISITING = -1;
  const level = new Map();
  const levelOf = (id, trail) => {
    if (level.has(id)) {
      const cached = level.get(id);
      if (cached === VISITING) {
        throw new Error(`scheduleFromSerializeAfter: serializeAfter cycle: ${[...trail, id].join(' -> ')}`);
      }
      return cached;
    }
    const preds = predsOf(byId.get(id));
    if (preds.length === 0) {
      level.set(id, 0);
      return 0;
    }
    level.set(id, VISITING);
    let max = -1;
    for (const p of preds) {
      if (!byId.has(p)) {
        throw new Error(`scheduleFromSerializeAfter: task ${id} serializeAfter unknown task ${p}`);
      }
      max = Math.max(max, levelOf(p, [...trail, id]));
    }
    const resolved = max + 1;
    level.set(id, resolved);
    return resolved;
  };
  for (const t of tasks) levelOf(t.id, []);

  const depth = Math.max(...level.values());
  const batches = Array.from({ length: depth + 1 }, () => []);
  for (const t of tasks) batches[level.get(t.id)].push(t);
  return batches;
}

// Two-level scheduler for the whole run. Wave level comes from `deps` (intra-feature
// producer tasks): a dep pointing at a task NOT in the list is already merged in an
// earlier run and counts as satisfied — unlike serializeAfter, it never throws. Within
// each wave, batches come from scheduleFromSerializeAfter with each task's
// serializeAfter filtered to same-wave ids (cross-wave ordering is already guaranteed
// by the wave sequence). Cycles in deps throw.
function scheduleWaves(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];

  const byId = new Map();
  for (const t of tasks) {
    if (!t || typeof t.id !== 'string' || t.id === '') {
      throw new Error('scheduleWaves: every task needs a non-empty string id');
    }
    if (byId.has(t.id)) throw new Error(`scheduleWaves: duplicate task id ${t.id}`);
    byId.set(t.id, t);
  }

  const depsOf = (t) => {
    const d = t.deps;
    if (Array.isArray(d)) return d.filter((x) => typeof x === 'string' && x !== '');
    if (typeof d === 'string' && d) return [d];
    return [];
  };

  const VISITING = -1;
  const level = new Map();
  const levelOf = (id, trail) => {
    if (level.has(id)) {
      const cached = level.get(id);
      if (cached === VISITING) {
        throw new Error(`scheduleWaves: deps cycle: ${[...trail, id].join(' -> ')}`);
      }
      return cached;
    }
    level.set(id, VISITING);
    let max = -1;
    for (const dep of depsOf(byId.get(id))) {
      if (!byId.has(dep)) continue; // merged in a prior run — satisfied
      max = Math.max(max, levelOf(dep, [...trail, id]));
    }
    const resolved = max + 1;
    level.set(id, resolved);
    return resolved;
  };
  for (const t of tasks) levelOf(t.id, []);

  const depth = Math.max(...level.values());
  const waves = [];
  for (let w = 0; w <= depth; w++) {
    const waveTasks = tasks.filter((t) => level.get(t.id) === w);
    const waveIds = new Set(waveTasks.map((t) => t.id));
    const scoped = waveTasks.map((t) => {
      const s = Array.isArray(t.serializeAfter)
        ? t.serializeAfter
        : (typeof t.serializeAfter === 'string' && t.serializeAfter ? [t.serializeAfter] : []);
      return { ...t, serializeAfter: s.filter((id) => waveIds.has(id)) };
    });
    waves.push({ wave: w, batches: scheduleFromSerializeAfter(scoped) });
  }
  return waves;
}

function unionChangedFiles(results) {
  const files = new Set();
  for (const r of results) {
    for (const f of r?.changedFiles ?? []) files.add(f);
  }
  return [...files].sort();
}

// Every task listing an AC in acIds co-owns it. The map feeds both closure detection
// and repair attribution (an unverified AC's fix must land as a fixup of an owner's commit).
function acOwners(allTasks) {
  const owners = new Map();
  for (const t of allTasks) {
    for (const ac of t.acIds ?? []) {
      if (!owners.has(ac)) owners.set(ac, []);
      owners.get(ac).push(t.id);
    }
  }
  return owners;
}

// An AC is closed once EVERY task that lists it in acIds has merged. Returns the full
// closed set for the given merged ids; callers diff consecutive calls for a wave delta.
function acsClosedByWave(allTasks, mergedTaskIds) {
  const merged = new Set(mergedTaskIds);
  const closed = [];
  for (const [ac, ids] of acOwners(allTasks)) {
    if (ids.every((id) => merged.has(id))) closed.push(ac);
  }
  return closed.sort();
}

// A CI verdict is only as good as its exit codes: a "pass" claim with any non-zero
// command exit is downgraded to fail so a hallucinated verdict cannot green-light a wave.
function reconcileCi(ciResult) {
  if (!ciResult || typeof ciResult !== 'object') return null;
  const commands = Array.isArray(ciResult.commands) ? ciResult.commands : [];
  const anyRed = commands.some((c) => c && c.exitCode !== 0);
  if (ciResult.status === 'pass' && anyRed) {
    return {
      ...ciResult,
      status: 'fail',
      failures: [
        ...(ciResult.failures ?? []),
        { location: 'ci-verdict', detail: 'agent reported pass but a command exited non-zero' },
      ],
    };
  }
  return ciResult;
}

// Same defense for the AC verifier: a "pass" claim with an unverified AC in its own list
// is a contradiction — downgrade so a sloppy verdict cannot close the wave.
function reconcileAc(acResult) {
  if (!acResult || typeof acResult !== 'object') return null;
  const acs = Array.isArray(acResult.acs) ? acResult.acs : [];
  if (acResult.status === 'pass' && acs.some((v) => v && v.verdict === 'unverified')) {
    return { ...acResult, status: 'fail' };
  }
  return acResult;
}

// Splits a wave's failures into repair work: failed/unmerged tasks are repaired in their
// own worktrees (parallel, re-merged after); smoke/CI failures and unverified ACs sit on
// already-merged code, so they become ONE serial feature-branch repair (fixup commits) —
// nothing races the feature branch.
function repairPlanFrom({ taskResults = [], mergeResults = [], ciResult = null, acResult = null, owners = new Map() }) {
  const seen = new Set();
  const worktreeRepairs = [];
  for (const r of taskResults) {
    if (r.status === 'failed' && !seen.has(r.id)) {
      seen.add(r.id);
      worktreeRepairs.push({ id: r.id, diagnosis: r.diagnosis || 'task failed without a diagnosis' });
    }
  }
  for (const m of mergeResults) {
    if ((m.status === 'conflict' || m.status === 'blocked') && !seen.has(m.task)) {
      seen.add(m.task);
      worktreeRepairs.push({ id: m.task, diagnosis: m.detail || `merge ${m.status}` });
    }
  }
  const featureLines = [];
  // A red CI/smoke ALWAYS yields a feature repair — even with an empty failures list (an
  // agent that under-reports must not let the wave sail through green).
  if (ciResult && ciResult.status === 'fail') {
    featureLines.push(
      (ciResult.failures ?? []).length > 0
        ? ciResult.failures.map((f) => `${f.location}: ${f.detail}`).join('\n')
        : 'CI failed without structured failure entries — re-run the configured commands and diagnose from their output tails',
    );
  }
  for (const v of acResult?.acs ?? []) {
    if (!v || v.verdict !== 'unverified') continue;
    const owning = owners.get(v.id) ?? [];
    featureLines.push(
      `ac:${v.id}: ${v.detail || 'not verified'} — finish the behavior or add the missing test; land it as a fixup of the owning task's commit (${owning.length ? owning.join(', ') : 'locate the owner via the Task: trailers'})`,
    );
  }
  const featureRepair = featureLines.length > 0 ? { diagnosis: featureLines.join('\n') } : null;
  return { worktreeRepairs, featureRepair };
}

// CR findings default to the human: only an explicit kind "mechanical" is auto-fixed,
// anything else escalates as a judgment call.
function classifyFindings(findings) {
  const mechanical = [];
  const judgment = [];
  for (const f of findings ?? []) {
    (f && f.kind === 'mechanical' ? mechanical : judgment).push(f);
  }
  return { mechanical, judgment };
}

// Structured contract every task agent returns (one per agent() call). Passing tasks are
// squash-merged in order; a failed task feeds the repair loop; an escalated task halts
// new work and returns the question to the main thread's HIL.
const TASK_RESULT_SCHEMA = {
  type: 'object',
  required: ['id', 'status', 'changedFiles', 'headSha', 'gate'],
  properties: {
    id: { type: 'string', description: 'the T-<n> id of the task this result is for' },
    status: {
      type: 'string',
      enum: ['passed', 'failed', 'escalated'],
      description: 'passed = self-gate green and the breadcrumb commit written; failed = gate red or work incomplete; escalated = a decision only a human can make blocks this task',
    },
    changedFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'repo-relative paths this task created or modified in its worktree',
    },
    headSha: {
      type: 'string',
      description: 'full SHA of the worktree branch HEAD after the breadcrumb commit ("" if nothing was committed)',
    },
    gate: {
      type: 'object',
      required: ['ac', 'lint'],
      properties: {
        ac: { type: 'string', enum: ['pass', 'fail'], description: 'verdict for the ACs this task covers entirely' },
        lint: { type: 'string', enum: ['pass', 'fail'], description: 'verdict for lint of the changed/created files only' },
      },
    },
    diagnosis: {
      type: 'string',
      description: 'on failure: cause, location, and the context a repair task needs — omit when status is passed',
    },
    escalation: {
      type: 'object',
      required: ['question', 'context'],
      properties: {
        question: { type: 'string', description: 'the one decision the human must make' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            required: ['label', 'detail'],
            properties: { label: { type: 'string' }, detail: { type: 'string' } },
          },
          description: 'viable resolutions with their trade-offs (2-4 entries)',
        },
        context: { type: 'string', description: 'self-contained background: what the spec is silent about and why it matters here' },
      },
      description: 'required when status is "escalated": the architectural gap that blocks this task',
    },
  },
};

const PREP_RESULT_SCHEMA = {
  type: 'object',
  required: ['status', 'prepared'],
  properties: {
    status: { type: 'string', enum: ['ready', 'failed'] },
    prepared: { type: 'array', items: { type: 'string' }, description: 'task ids whose worktrees are ready' },
    detail: { type: 'string', description: 'on failure: which worktree failed and why' },
  },
};

const MERGE_RESULT_SCHEMA = {
  type: 'object',
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['task', 'status', 'sha'],
        properties: {
          task: { type: 'string' },
          status: { type: 'string', enum: ['merged', 'conflict', 'blocked'] },
          sha: { type: 'string', description: 'full SHA of the squash commit ("" when not merged)' },
          detail: { type: 'string', description: 'conflict summary or blocking reason' },
        },
      },
    },
  },
};

const CI_RESULT_SCHEMA = {
  type: 'object',
  required: ['status', 'commands', 'failures'],
  properties: {
    status: { type: 'string', enum: ['pass', 'fail'] },
    commands: {
      type: 'array',
      items: {
        type: 'object',
        required: ['cmd', 'exitCode'],
        properties: {
          cmd: { type: 'string' },
          exitCode: { type: 'integer', description: 'the literal process exit code — never summarize' },
          tail: { type: 'string', description: 'last lines of output when non-zero' },
        },
      },
    },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        required: ['location', 'detail'],
        properties: { location: { type: 'string' }, detail: { type: 'string' } },
      },
    },
  },
};

const AC_RESULT_SCHEMA = {
  type: 'object',
  required: ['status', 'acs'],
  properties: {
    status: { type: 'string', enum: ['pass', 'fail'], description: 'fail when ANY listed AC is unverified' },
    acs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'verdict', 'detail'],
        properties: {
          id: { type: 'string' },
          verdict: {
            type: 'string',
            enum: ['covered-by-test', 'verified-by-inspection', 'unverified'],
            description: 'covered-by-test = a targeted test run proves it; verified-by-inspection = no test can exist, the merged code demonstrably satisfies it; unverified = missing, incomplete, or unconfirmed',
          },
          detail: { type: 'string', description: 'the evidence: test command + exit code, or what the inspection established; for unverified — exactly what is missing' },
        },
      },
    },
  },
};

const CR_RESULT_SCHEMA = {
  type: 'object',
  required: ['status', 'skillsRun', 'findings'],
  properties: {
    status: { type: 'string', enum: ['pass', 'findings'] },
    skillsRun: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'location', 'detail'],
        properties: {
          kind: { type: 'string', enum: ['mechanical', 'judgment'], description: 'mechanical = objectively fixable in place; judgment = needs a human call' },
          severity: { type: 'string' },
          location: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
    reportFile: { type: 'string', description: 'path of the full written review report' },
  },
};

const STEP_RESULT_SCHEMA = {
  type: 'object',
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ok', 'failed'] },
    path: { type: 'string', description: 'produced file path, when the step writes one' },
    detail: { type: 'string' },
  },
};

// Single source of truth for the task-agent directives. Embedded verbatim in every task
// prompt here; the subagent fallback in commands/implement.md reuses the same directives.
const TASK_CONTRACT = [
  'Task-agent contract — follow exactly:',
  '- The task file is self-contained. Do NOT re-grep or rediscover paths, symbols, or contracts already named in its body or codeDeps — read the task file once and trust it.',
  '- The task file is your ONLY fd material: never read spec.md, other tasks\' files, or feature workspace state (feature.lock.json, state.json, analysis/) — a gap in the task file is a diagnosis or escalation to report, not a license to hunt.',
  '- Batch your edits: make all code changes first, then run typecheck and lint ONCE at the end — never after every edit.',
  '- Stub rule: if a dependency file you need does not exist yet, a peer task owns it — write a MINIMAL, contract-satisfying stub, never recreate or fully implement a peer\'s file. Do not touch files this task does not own.',
  '- Commit atomically, piece by piece, on your worktree branch, with the decision rationale in each commit message.',
  '- Self-gate before finishing: validate the ACs this task covers entirely and lint the files you changed or created.',
  '- Escalation rule: when the spec is silent on something this task needs and more than one viable design exists, do NOT pick one. Stop, return status "escalated" with the question, the viable options, and self-contained context. No breadcrumb, no further edits.',
  '- Breadcrumb: your FINAL act, only after the self-gate passes, is exactly ONE empty commit on your worktree branch —',
  '    git -C <worktree> commit --allow-empty -m "<subject>" -m "<one-line gate summary>" --trailer "Task: <id>" --trailer "Fd-Gate: pass"',
  '  Both the Task and Fd-Gate trailers must be present. If the self-gate FAILS, do NOT write the breadcrumb: return status "failed" with a diagnosis instead.',
].join('\n');

// Builds one task agent's prompt: where to work, its self-gate, the mode (repair carries
// the diagnosis to fix), the HIL decision when one resolved an earlier escalation, and
// the shared task-agent contract verbatim (with the breadcrumb). opts.graphMcp switches
// code retrieval to the Codebase Memory graph (set when /fd:config detected the server).
function taskPrompt(task, mode, opts = {}) {
  const acIds = task.acIds ?? [];
  const acLine = acIds.length
    ? acIds.join(', ')
    : '(none covered entirely by this task — this task closes no AC on its own)';

  const lines = [
    'You implement ONE task of a feature wave, in an isolated git worktree.',
    '',
    `Task id: ${task.id}`,
    `Worktree: ${task.worktree}`,
    `Worktree branch: ${task.branch}`,
    `Task file (read it fully first): ${task.taskFile}`,
    `Mode: ${mode}`,
    '',
    'Self-gate for this task:',
    `- Acceptance criteria covered entirely by this task: ${acLine}`,
    '- Lint the files you changed or created (changed files only, not the whole repo).',
  ];

  if (mode === 'repair' && task.diagnosis) {
    lines.push(
      '',
      'Repair diagnosis — fix exactly this, and land it as a `git commit --fixup` of the original task commit:',
      task.diagnosis,
      'Never delete or weaken a test to make the gate pass — a red test is a diagnosis, not noise.',
    );
  }

  if (task.decision) {
    lines.push(
      '',
      'HIL decision — a human already resolved this task\'s open question; implement per this decision, do not re-litigate it:',
      task.decision,
    );
  }

  if (opts.graphMcp) {
    lines.push(
      '',
      'Code retrieval — the repository is indexed in Codebase Memory (MCP):',
      '- Locate symbols and usages with mcp__codebase-memory-mcp__search_graph / search_code, fetch exact source with get_code_snippet, follow call chains with trace_path — INSTEAD of Grep/Glob or shell `cat | grep` hunts, and instead of reading a whole file to find one symbol.',
      '- Read stays for: files you are about to edit, files the task file names (codeDeps), and configs.',
      '- The graph indexes the repository-root checkout — your worktree\'s own uncommitted work is NOT in it; use Read or `git -C <worktree>` for files you just created or changed.',
    );
  }

  lines.push(
    '',
    TASK_CONTRACT,
    '',
    'Return a JSON object matching the result schema: id, status ("passed"|"failed"|"escalated"), changedFiles, headSha, gate {ac, lint}, diagnosis when failed, escalation {question, options, context} when escalated.',
  );

  return lines.join('\n');
}

// Worktree creation is serial by design: concurrent `git worktree add` calls race on
// .git/worktrees, and every wave must be cut from the feature branch AFTER the previous
// wave's merges so its tasks see the merged code.
function prepareWavePrompt(waveTasks, { repoRoot, featureBranch, worktreeSetup }) {
  const lines = [
    'You prepare git worktrees for one wave of task agents. Work strictly SEQUENTIALLY — never two `git worktree` commands in parallel.',
    '',
    `Repository root: ${repoRoot}`,
    `Feature branch (create everything from its CURRENT tip): ${featureBranch}`,
    '',
    'For each entry below, in order:',
    '1. If the worktree path already exists, remove it first: `git -C <repoRoot> worktree remove --force <path>` (fall back to `rm -rf` + `git worktree prune` if needed); delete a stale branch of the same name with `git branch -D`.',
    `2. \`git -C <repoRoot> worktree add <path> -b <branch> ${featureBranch}\``,
  ];
  if (worktreeSetup.length > 0) {
    lines.push(`3. Inside the new worktree run, in order: ${worktreeSetup.join(' && ')}`);
  }
  lines.push('', 'Worktrees to prepare:');
  for (const t of waveTasks) {
    lines.push(`- task ${t.id}: path ${t.worktree}, branch ${t.branch}`);
  }
  lines.push('', 'Return JSON: status ("ready" only if EVERY worktree is usable, else "failed"), prepared (task ids that are ready), detail on failure.');
  return lines.join('\n');
}

function mergerPrompt(passingTasks, { repoRoot, featureBranch, worktreeCleanup }) {
  const lines = [
    'Squash-merge the following gated task branches into the feature branch, strictly in the order listed. Follow your merger contract exactly (one squash commit per task, `Task: <id>` trailer, exclude the Fd-Gate breadcrumb from the message, abort on non-mechanical conflicts).',
    '',
    `Repository root: ${repoRoot}`,
    `Feature branch: ${featureBranch}`,
    '',
    'Tasks (authoritative order):',
  ];
  for (const t of passingTasks) {
    lines.push(`- { task: ${t.id}, worktree: ${t.worktree}, branch: ${t.branch} }`);
  }
  lines.push(
    '',
    worktreeCleanup === 'always'
      ? 'After each successful merge, remove that task\'s worktree (`git worktree remove --force <path>`); leave the worktrees of conflicted/blocked tasks in place.'
      : 'Leave every worktree in place (cleanup policy: keep-failed).',
    '',
    'In addition to your usual report, return a JSON object matching the result schema: results = [{task, status ("merged"|"conflict"|"blocked"), sha (full squash-commit SHA, "" when not merged), detail}].',
  );
  return lines.join('\n');
}

// Full-pipeline CI runs ONLY at feature close (and after autosquash) — between waves the
// gate is smokePrompt + acVerifyPrompt, because lint and the full suite judge finished
// features and false-flag intermediate states (e.g. exports whose consumers arrive in a
// later wave), and a false red feeds the repair loop with destructive "fixes".
function ciPrompt(ci, { repoRoot }) {
  const commands = [
    ci.lint ? `lint: ${ci.lint}` : null,
    ci.build ? `build: ${ci.build}` : null,
    ci.test ? `test: ${ci.test}` : null,
  ].filter(Boolean);
  return [
    'You run the FULL CI gate for the whole feature, at the repository root, on the feature branch as currently checked out. Run every command unfiltered, report literal exit codes — never summarize a failure away.',
    '',
    `Repository root: ${repoRoot}`,
    `Configured commands: ${commands.length ? commands.join(' | ') : '(none configured — report status "pass" with an empty commands list and note it in failures as location "config", detail "no CI commands configured")'}`,
    '',
    'Return JSON: status, commands = [{cmd, exitCode, tail (last lines when non-zero)}], failures = [{location, detail}] (empty when green).',
  ].join('\n');
}

// The between-waves smoke: typecheck + build only. Broken types/APIs are the one failure
// class that compounds (the next wave's worktrees are cut from this branch); lint and
// tests wait for feature close.
function smokePrompt(ci, { repoRoot }) {
  const commands = [
    ci.typecheck ? `typecheck: ${ci.typecheck}` : null,
    ci.build ? `build: ${ci.build}` : null,
  ].filter(Boolean);
  return [
    'You run the integration smoke for a merged wave of tasks, at the repository root, on the feature branch as currently checked out. Run the commands below (all of them, in order), report literal exit codes — never summarize a failure away.',
    '',
    `Repository root: ${repoRoot}`,
    `Commands to run: ${commands.join(' | ')}`,
    '',
    'Do NOT run lint or the test suite — an intermediate wave state legitimately fails end-state checks (e.g. exported symbols whose consumers arrive in later waves); those run at feature close.',
    '',
    'Return JSON: status, commands = [{cmd, exitCode, tail (last lines when non-zero)}], failures = [{location, detail}] (empty when green).',
  ].join('\n');
}

// AC verification is its own agent (parallel to the smoke): an AC is proven by a targeted
// test run when one exists, and by code inspection when no test can exist — a full-suite
// pass was never the right proxy for either.
function acVerifyPrompt({ closedAcs, owners, taskById, repoRoot }) {
  const lines = [
    'You verify acceptance criteria that a merged wave just closed, at the repository root, on the feature branch as currently checked out. You are read-only except for RUNNING tests — never edit, never commit.',
    '',
    `Repository root: ${repoRoot}`,
    '',
    'ACs to verify — each with its owning tasks; their task files state the expected behavior and name its tests:',
  ];
  for (const ac of closedAcs) {
    const owning = (owners.get(ac) ?? []).map((id) => `${id} (${taskById.get(id)?.taskFile ?? 'task file unknown'})`);
    lines.push(`- ${ac}: ${owning.length ? owning.join(', ') : 'owner unknown — locate it via the task files'}`);
  }
  lines.push(
    '',
    'For each AC use the STRONGEST applicable method:',
    '1. covered-by-test — a test demonstrably exercising the AC exists: run JUST that test (targeted filter, never the whole suite) and confirm it passes; evidence = the command + exit code.',
    '2. verified-by-inspection — no test can meaningfully exist (config value, removal, wiring): read the merged code and state exactly what satisfies the AC.',
    '3. unverified — the behavior is missing, incomplete, or unconfirmed: state exactly what is missing.',
    'A missing test for a TESTABLE behavior is "unverified", never "verified-by-inspection".',
    '',
    'Return JSON: status ("fail" when any AC is unverified), acs = [{id, verdict, detail}] — one entry per AC listed above.',
  );
  return lines.join('\n');
}

// Merged-code repairs run as ONE serial agent per iteration: fixup commits land directly
// on the feature branch, so parallel writers are forbidden by construction. Commit surgery
// is non-negotiable — /fd:to-prs slices the branch by per-task commits, so every fix must
// fold into its task's commit at autosquash.
function featureRepairPrompt(diagnosis, { repoRoot, featureBranch, baseBranch, taskIds = [] }) {
  return [
    'You repair failures on the merged feature branch. Work at the repository root on the feature branch as checked out; you are the ONLY writer right now.',
    '',
    `Repository root: ${repoRoot}`,
    `Feature branch: ${featureBranch} (base: ${baseBranch})`,
    taskIds.length ? `Tasks in this run: ${taskIds.join(', ')} (earlier commits may carry other Task ids)` : null,
    '',
    'FIRST build the attribution map: `git log --format="%H %s [%(trailers:key=Task,valueonly,separator=%x2C)]" ' + `${baseBranch}..${featureBranch}\` — every squash commit carries a \`Task:\` trailer naming its task.`,
    '',
    'Failures to fix — fix exactly these, nothing speculative:',
    diagnosis,
    '',
    'Commit surgery — /fd:to-prs slices the branch into per-task PRs from these commits, so every fix must land attributably:',
    '- Fix confined to ONE task\'s files: `git commit --fixup <that task\'s squash commit>` (attribute via the map above plus `git blame`). One fixup per culprit commit — never one bulk commit for unrelated fixes.',
    '- Cross-cutting fix (files spanning more than one task, or outside any task\'s footprint): a NORMAL commit — subject `fix(integration): <what>`, trailers `Task: <culprit-id>` AND `Integration-Fix: true`, where the culprit is the task whose change caused the breakage. It rides into the culprit\'s PR by its Task: trailer and is never autosquashed, so the reviewer sees the clean change and its blast-radius adaptations separately.',
    '- When some files of one fix were CREATED or last rewritten by a LATER task, SPLIT the fix per owning task — each piece as that owner\'s fixup or integration-fix commit; one commit spanning owners breaks the PR-stack rebase.',
    '- Genuinely unattributable: a normal commit with the trailer `Task: <owning-task-id>` of your best-evidence owner, and say so in your report.',
    '- Do NOT rebase or autosquash — that happens at feature close.',
    'A failure at location `ac:<id>` means an acceptance criterion is unmet or untested: finish the behavior or add the missing test, and fixup onto the commit of the owning task named in that failure line.',
    'NEVER delete or weaken a test to make a gate pass — a red or "tautological-looking" test is a diagnosis to act on, not noise; the AC verifier re-checks every AC after your repair and a lost test surfaces as a new failure.',
    'NEVER delete an exported-but-unused symbol to satisfy a check: if it maps to a spec element or a task\'s `produces` contract, it is a deliberate contract whose consumers do not exist yet — check the task files first; a genuinely dead symbol is a finding to REPORT in detail, not code to remove.',
    'Re-run only the failed commands to confirm the fix; report literal exit codes.',
    '',
    'Return JSON: status ("ok" when every listed failure is fixed and re-verified, else "failed"), detail.',
  ].filter((l) => l !== null).join('\n');
}

function writeDiffPrompt({ repoRoot, baseBranch, featureBranch, featureDir }) {
  return [
    'Prepare the code-review input file.',
    '',
    `Run at ${repoRoot}: \`git diff ${baseBranch}...${featureBranch}\` (three dots) plus \`git diff --name-only ${baseBranch}...${featureBranch}\`.`,
    `Write BOTH (name list first, then the full diff) into ${featureDir}/cr-diff.patch, overwriting any previous file.`,
    '',
    'Return JSON: status ("ok"|"failed"), path (the file you wrote), detail on failure.',
  ].join('\n');
}

function crPrompt(codeReview, { diffFile, featureDir }) {
  return [
    'You run the whole-feature code review. The diff is already written to a file — Read it from the path below; NEVER ask for it inline.',
    '',
    `Diff file: ${diffFile}`,
    `Review skills to apply — invoke EACH by name via the Skill tool, in order: ${codeReview.skills.join(', ')}`,
    '(If the Skill tool cannot resolve a name, read that skill\'s SKILL.md from the plugin cache and apply its instructions manually; record it in skillsRun either way.)',
    '',
    'Rules: no nested subagent fan-out, no network research. Judge only what the diff shows.',
    `Write the full review report to ${featureDir}/cr-report.md.`,
    '',
    'Classify every finding: kind "mechanical" = objectively fixable in place (bug, missed rename, lint-grade smell, missing null-check with an obvious guard); kind "judgment" = needs a human decision (design trade-off, scope question, spec ambiguity). When unsure, choose "judgment".',
    'An exported-but-unused symbol that maps to a spec element or a task\'s `produces` contract is NOT dead code — its consumers may arrive in a later feature; if it looks genuinely dead, classify as "judgment", never "mechanical".',
    '',
    'Return JSON: status ("pass" when no findings), skillsRun, findings = [{kind, severity, location, detail}], reportFile.',
  ].join('\n');
}

function autosquashPrompt({ repoRoot, baseBranch, featureBranch }) {
  return [
    'Fold the accumulated fixup commits into their targets on the feature branch.',
    '',
    `At ${repoRoot}, on ${featureBranch}: run \`git rebase --autosquash ${baseBranch}\` (git >= 2.44 runs it non-interactively; on older git use \`GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash ${baseBranch}\`).`,
    'If the rebase stops on a conflict, abort it (`git rebase --abort`) and report failed — never resolve conflicts here.',
    'Afterwards verify every `Task:` trailer is still present: `git log --format=%H%x20%(trailers:key=Task,valueonly) ' + `${baseBranch}..${featureBranch}\`.`,
    '',
    'Return JSON: status ("ok"|"failed"), detail (include the trailer verification summary).',
  ].join('\n');
}

// The return lands verbatim in the main conversation's context: a field run measured its
// two biggest context jumps of a 12h session (+54k and +51k tokens) as exactly these
// payloads. Keep only what the main thread acts on — statuses, ids, SHAs, escalations
// verbatim (HIL reads them straight from the return), and gateDebt (copied into relaunch
// args). Everything else lives in the report file the `report` field points at.
function slimReturn(full, reportPath) {
  const slim = {
    status: full.status,
    report: reportPath,
    remaining: full.remaining ?? [],
    tasks: (full.tasks ?? []).map((t) => ({ id: t.id, status: t.status, headSha: t.headSha })),
    waves: (full.waves ?? []).map((w) => {
      const wave = {
        wave: w.wave,
        tasks: w.tasks,
        merged: w.merged,
        smoke: { status: w.smoke?.status },
        acVerification: { status: w.acVerification?.status },
        repairIterations: w.repairIterations,
        closedAcs: w.closedAcs,
      };
      if (w.gateDebt) wave.gateDebt = w.gateDebt;
      return wave;
    }),
  };
  if (full.reason !== undefined) slim.reason = full.reason;
  if (full.escalations !== undefined) slim.escalations = full.escalations;
  if (full.close !== undefined) {
    slim.close = full.close?.cr
      ? {
          ...full.close,
          // CR findings already live in cr.reportFile AND the run report — the return
          // keeps the verdict and the count, enough to say "clean" without a file read.
          cr: {
            status: full.close.cr.status,
            skillsRun: full.close.cr.skillsRun,
            findingsCount: (full.close.cr.findings ?? []).length,
            reportFile: full.close.cr.reportFile ?? null,
          },
        }
      : full.close;
  }
  return slim;
}

function reportWritePrompt(reportPath, payloadJson) {
  return [
    'Persist the engine run report.',
    '',
    `Write the JSON between the BEGIN/END markers below to ${reportPath} VERBATIM — markers excluded, overwriting any previous file.`,
    'Use the Write tool ONLY — never a Bash heredoc or echo (the payload carries free text that can trip repo hooks). Do not reformat, summarize, or fix anything in it.',
    '',
    'BEGIN REPORT JSON',
    payloadJson,
    'END REPORT JSON',
    '',
    'Return JSON: status ("ok"|"failed"), path (the file you wrote), detail on failure.',
  ].join('\n');
}

// ---------------------------------------------------------------------------------
// Run path (harness only). Everything below references the agent/parallel/phase/log
// globals, so importing this module under plain node (for the tests) has no side effects.

async function run(rawArgs) {
  // Args validation failures return structurally instead of throwing: a raw stack trace
  // in the Workflow result gives the main thread nothing to act on, while kind
  // "invalid-args" means exactly "regenerate engine-args.json and relaunch — no code ran".
  let a;
  let waves;
  try {
    a = parseArgs(rawArgs);
    waves = scheduleWaves(a.tasks);
  } catch (err) {
    return {
      status: 'escalated',
      waves: [],
      tasks: [],
      remaining: [],
      escalations: [{
        kind: 'invalid-args',
        question: 'The run arguments failed validation — no agent ran and nothing was touched. Regenerate engine-args.json from the canonical inputs and relaunch (no HIL needed unless the canonical file itself is wrong).',
        options: [],
        context: err.message,
      }],
    };
  }
  const taskById = new Map(a.tasks.map((t) => [t.id, t]));

  // agent() yields null for ANY terminal death — kill, API error, or account rate limit —
  // and the cause is not visible to this script, so no escalation text may guess one.
  const NO_RESULT = 'returned no result (killed, terminal API error, or account rate limit — the cause is not visible to the engine). The branch and Task: trailers are intact, so relaunching is safe; if this coincided with a session limit, wait for the reset first.';

  let agentCalls = 0;
  const spawn = (prompt, opts) => {
    agentCalls += 1;
    return agent(prompt, opts);
  };

  const results = [];
  const waveReports = [];
  const mergedIds = [];
  const escalations = [];
  let closedBefore = [];

  const remaining = () => a.tasks.map((t) => t.id).filter((id) => !mergedIds.includes(id));
  const payload = (extra) => ({ waves: waveReports, tasks: results, remaining: remaining(), ...extra });
  // Every exit goes through finish(): an agent persists the full report (this script
  // cannot touch the filesystem), the caller gets the slim summary + pointer. A dead
  // writer degrades to the fat payload — losing slimness beats losing the fail detail.
  const reportPath = `${a.featureDir}/impl-run-report.json`;
  const finish = async (full) => {
    const step = await spawn(
      reportWritePrompt(reportPath, JSON.stringify(full, null, 2)),
      { label: 'report:write', phase: 'Report', schema: STEP_RESULT_SCHEMA, effort: 'low' },
    );
    if (!step || step.status !== 'ok') return { ...full, report: null };
    return slimReturn(full, reportPath);
  };
  const escalate = (list) => finish(payload({ status: 'escalated', escalations: [...escalations, ...list] }));

  const owners = acOwners(a.tasks);
  const taskIds = a.tasks.map((t) => t.id);
  const smokeCommands = [a.ci.typecheck, a.ci.build].filter(Boolean);

  const runCloseCi = async (label) => {
    const raw = await spawn(
      ciPrompt(a.ci, { repoRoot: a.repoRoot }),
      { label, phase: 'Close', schema: CI_RESULT_SCHEMA },
    );
    return reconcileCi(raw);
  };
  // Skipping is loud, never silent: a repo with neither typecheck nor build has NO
  // between-waves integration signal, and the wave report must say so.
  // Mechanical stages (worktree prep, merge sequence, smoke) run at low effort: they
  // execute a known command sequence, and reasoning output is a top context/limit stream.
  const runSmoke = async (label, phaseName) => {
    if (smokeCommands.length === 0) {
      log(`${label}: smoke skipped — tooling has neither typecheck nor build configured`);
      return { status: 'skipped', commands: [], failures: [] };
    }
    const raw = await spawn(
      smokePrompt(a.ci, { repoRoot: a.repoRoot }),
      { label, phase: phaseName, schema: CI_RESULT_SCHEMA, effort: 'low' },
    );
    return reconcileCi(raw);
  };
  const runAcVerify = async (acs, label, phaseName) => {
    if (acs.length === 0) return { status: 'pass', acs: [] };
    const raw = await spawn(
      acVerifyPrompt({ closedAcs: acs, owners, taskById, repoRoot: a.repoRoot }),
      { label, phase: phaseName, schema: AC_RESULT_SCHEMA },
    );
    return reconcileAc(raw);
  };

  const mergeTasks = async (passing, label, phaseName) => {
    if (passing.length === 0) return [];
    const merged = await spawn(
      mergerPrompt(passing, { repoRoot: a.repoRoot, featureBranch: a.featureBranch, worktreeCleanup: a.worktreeCleanup }),
      { label, phase: phaseName, agentType: 'fd:merger', schema: MERGE_RESULT_SCHEMA, effort: 'low' },
    );
    if (!merged) return null;
    for (const m of merged.results) {
      if (m.status === 'merged' && !mergedIds.includes(m.task)) mergedIds.push(m.task);
    }
    return merged.results;
  };

  // Gate debt from a prior run: an escalated wave's gate ran red but its repair waited
  // for the human. Settle it BEFORE wave 0 — this run's worktrees are cut from the
  // feature branch, and cutting them from a known-red branch poisons every task agent
  // with someone else's regression. Debt ACs may belong to tasks merged in the prior
  // run (absent from args.tasks); the verifier locates owners via task files/trailers.
  if (a.gateDebt) {
    phase('Gate debt');
    let [smoke, acCheck] = await parallel([
      () => (a.gateDebt.smoke ? runSmoke('debt:smoke', 'Gate debt') : Promise.resolve({ status: 'pass', commands: [], failures: [] })),
      () => runAcVerify(a.gateDebt.acs, 'debt:ac-verify', 'Gate debt'),
    ]);
    if (!smoke || !acCheck) {
      return escalate([{
        kind: 'engine-failure',
        question: 'A gate-debt agent (smoke or AC verification) did not return; the inherited verdict is unknown. Relaunch?',
        options: [], context: `gate debt: ${!smoke ? 'smoke' : 'AC verification'} agent ${NO_RESULT}`,
      }]);
    }
    let debtIterations = 0;
    let plan = repairPlanFrom({ ciResult: smoke, acResult: acCheck, owners });
    while (plan.featureRepair && debtIterations < a.repair.maxIterations) {
      debtIterations += 1;
      log(`gate debt: repair iteration ${debtIterations}/${a.repair.maxIterations}`);
      await spawn(
        featureRepairPrompt(plan.featureRepair.diagnosis, { repoRoot: a.repoRoot, featureBranch: a.featureBranch, baseBranch: a.baseBranch, taskIds }),
        { label: `debt:repair-${debtIterations}`, phase: 'Gate debt', schema: STEP_RESULT_SCHEMA },
      );
      [smoke, acCheck] = await parallel([
        () => (a.gateDebt.smoke ? runSmoke(`debt:smoke-${debtIterations}`, 'Gate debt') : Promise.resolve({ status: 'pass', commands: [], failures: [] })),
        () => runAcVerify(a.gateDebt.acs, `debt:ac-verify-${debtIterations}`, 'Gate debt'),
      ]);
      if (!smoke || !acCheck) {
        return escalate([{
          kind: 'engine-failure',
          question: 'A gate-debt agent (smoke or AC verification) did not return during repair; the verdict is unknown. Relaunch?',
          options: [], context: `gate debt, repair iteration ${debtIterations}: agent ${NO_RESULT}`,
        }]);
      }
      plan = repairPlanFrom({ ciResult: smoke, acResult: acCheck, owners });
    }
    if (plan.featureRepair) {
      return escalate([{
        kind: 'repair-exhausted',
        question: `The gate debt inherited from the prior run is still red after ${a.repair.maxIterations} repair iterations. How should this proceed?`,
        options: [], context: plan.featureRepair.diagnosis,
      }]);
    }
    log(`gate debt settled in ${debtIterations} repair iteration(s)`);
  }

  for (const { wave, batches } of waves) {
    const label = `wave-${wave}`;
    phase(`Wave ${wave}`);
    const waveTasks = batches.flat();

    if (agentCalls >= a.budget.maxAgents) {
      log(`agent budget spent (${agentCalls}/${a.budget.maxAgents}) — checkpointing before wave ${wave}`);
      return finish(payload({ status: 'continue', reason: 'agent-budget' }));
    }

    // Serial worktree preparation, cut from the feature branch AFTER the prior wave's merges.
    const prep = await spawn(
      prepareWavePrompt(waveTasks, { repoRoot: a.repoRoot, featureBranch: a.featureBranch, worktreeSetup: a.worktreeSetup }),
      { label: `${label}:prepare`, phase: `Wave ${wave}`, schema: PREP_RESULT_SCHEMA, effort: 'low' },
    );
    if (!prep || prep.status !== 'ready') {
      return escalate([{
        kind: 'engine-failure',
        wave,
        question: 'Worktree preparation did not complete. If the context reports a concrete failure, fix that and relaunch; otherwise relaunch as-is.',
        options: [],
        context: prep?.detail ?? `prepare-wave agent ${NO_RESULT}`,
      }]);
    }

    const waveResults = [];
    for (const batch of batches) {
      const batchResults = await parallel(
        batch.map((task) => () =>
          spawn(taskPrompt(task, a.mode === 'repair' ? 'repair' : 'implement', { graphMcp: a.graphMcp }),
            { label: task.id, phase: `Wave ${wave}`, agentType: 'fd:implementer', schema: TASK_RESULT_SCHEMA })),
      );
      batchResults.forEach((r, i) => {
        const task = batch[i];
        const result = r ?? {
          id: task.id,
          status: 'failed',
          changedFiles: [],
          headSha: '',
          gate: { ac: 'fail', lint: 'fail' },
          diagnosis: 'task agent returned no result (killed, API error, or account rate limit)',
        };
        waveResults.push(result);
        results.push(result);
        if (result.status === 'escalated') {
          escalations.push({
            kind: 'architectural',
            taskId: result.id,
            wave,
            question: result.escalation?.question ?? 'task escalated without a question',
            options: result.escalation?.options ?? [],
            context: result.escalation?.context ?? '',
          });
        }
      });
      // Finish the running batch, land its passing work, but start nothing new.
      if (escalations.length > 0) break;
    }

    const order = new Map(waveTasks.map((t, i) => [t.id, i]));
    const passing = waveResults
      .filter((r) => r.status === 'passed')
      .sort((x, y) => order.get(x.id) - order.get(y.id))
      .map((r) => taskById.get(r.id));

    let mergeResults = await mergeTasks(passing, `${label}:merge`, `Wave ${wave}`);
    if (mergeResults === null) {
      return escalate([{
        kind: 'engine-failure', wave,
        question: 'The merger agent did not return mid-wave; verify the branch state from the Task: trailers before relaunching.',
        options: [], context: `wave ${wave}: merger agent ${NO_RESULT}`,
      }]);
    }

    // Escalation with nothing newly merged: no un-gated code landed, so there is no
    // gate to run — straight to the human.
    if (escalations.length > 0 && !mergeResults.some((m) => m.status === 'merged')) {
      return escalate([]);
    }

    const closedNow = acsClosedByWave(a.tasks, mergedIds);
    const closedDelta = closedNow.filter((ac) => !closedBefore.includes(ac));
    closedBefore = closedNow;

    let [smoke, acCheck] = await parallel([
      () => runSmoke(`${label}:smoke`, `Wave ${wave}`),
      () => runAcVerify(closedDelta, `${label}:ac-verify`, `Wave ${wave}`),
    ]);
    if (!smoke || !acCheck) {
      return escalate([{
        kind: 'engine-failure', wave,
        question: 'A wave gate agent (smoke or AC verification) did not return; the wave verdict is unknown. Relaunch?',
        options: [], context: `wave ${wave}: ${!smoke ? 'smoke' : 'AC verification'} agent ${NO_RESULT}`,
      }]);
    }
    const acVerdicts = new Map();
    for (const v of acCheck.acs ?? []) acVerdicts.set(v.id, v);

    // Escalation path: the gate RAN (merged tasks deserve their verdict, and the next
    // run's worktrees are cut from this branch) but repair does NOT — the pending human
    // decision may invalidate any fix. The red remainder is returned as the wave
    // report's gateDebt; the main thread passes it back via args.gateDebt on relaunch.
    if (escalations.length > 0) {
      waveReports.push({
        wave,
        tasks: waveTasks.map((t) => t.id),
        merged: mergedIds.filter((id) => order.has(id)),
        smoke: { status: smoke.status },
        acVerification: {
          status: [...acVerdicts.values()].some((v) => v.verdict === 'unverified') ? 'fail' : 'pass',
          acs: [...acVerdicts.values()],
        },
        repairIterations: 0,
        closedAcs: closedDelta,
        gateDebt: {
          smoke: smoke.status === 'fail',
          acs: (acCheck.acs ?? []).filter((v) => v.verdict === 'unverified').map((v) => v.id),
        },
      });
      return escalate([]);
    }

    let iterations = 0;
    let plan = repairPlanFrom({ taskResults: waveResults, mergeResults, ciResult: smoke, acResult: acCheck, owners });
    while ((plan.worktreeRepairs.length > 0 || plan.featureRepair) && iterations < a.repair.maxIterations) {
      iterations += 1;
      log(`${label}: repair iteration ${iterations}/${a.repair.maxIterations}`);

      let repairResults = [];
      if (plan.worktreeRepairs.length > 0) {
        const repairTasks = plan.worktreeRepairs
          .map(({ id, diagnosis }) => ({ ...taskById.get(id), diagnosis }))
          .filter((t) => t.id);
        repairResults = (await parallel(
          repairTasks.map((task) => () =>
            spawn(taskPrompt(task, 'repair', { graphMcp: a.graphMcp }),
              { label: `${task.id}:repair-${iterations}`, phase: `Wave ${wave}`, agentType: 'fd:implementer', schema: TASK_RESULT_SCHEMA })),
        )).map((r, i) => r ?? {
          id: repairTasks[i].id, status: 'failed', changedFiles: [], headSha: '',
          gate: { ac: 'fail', lint: 'fail' }, diagnosis: 'repair agent returned no result (killed, API error, or account rate limit)',
        });
        const escalatedRepairs = repairResults.filter((r) => r.status === 'escalated');
        if (escalatedRepairs.length > 0) {
          return escalate(escalatedRepairs.map((r) => ({
            kind: 'architectural', taskId: r.id, wave,
            question: r.escalation?.question ?? 'repair escalated without a question',
            options: r.escalation?.options ?? [], context: r.escalation?.context ?? '',
          })));
        }
        const passingRepairs = repairResults.filter((r) => r.status === 'passed').map((r) => taskById.get(r.id));
        const rm = await mergeTasks(passingRepairs, `${label}:merge-repair-${iterations}`, `Wave ${wave}`);
        if (rm === null) {
          return escalate([{
            kind: 'engine-failure', wave,
            question: 'The merger agent did not return during a repair merge; verify the branch state from the Task: trailers before relaunching.',
            options: [], context: `wave ${wave}, repair iteration ${iterations}: merger agent ${NO_RESULT}`,
          }]);
        }
        mergeResults = rm;
      } else {
        mergeResults = [];
      }

      if (plan.featureRepair) {
        await spawn(
          featureRepairPrompt(plan.featureRepair.diagnosis, { repoRoot: a.repoRoot, featureBranch: a.featureBranch, baseBranch: a.baseBranch, taskIds }),
          { label: `${label}:repair-${iterations}`, phase: `Wave ${wave}`, schema: STEP_RESULT_SCHEMA },
        );
      }

      // Re-verification is FULL, never scoped to the still-unverified subset: a repair
      // may delete or weaken the very test that made an AC "covered-by-test" in the
      // previous iteration, and neither the smoke nor the close full CI would notice a
      // test that no longer runs — this re-check is the only tripwire.
      [smoke, acCheck] = await parallel([
        () => runSmoke(`${label}:smoke-${iterations}`, `Wave ${wave}`),
        () => runAcVerify(closedDelta, `${label}:ac-verify-${iterations}`, `Wave ${wave}`),
      ]);
      if (!smoke || !acCheck) {
        return escalate([{
          kind: 'engine-failure', wave,
          question: 'A wave gate agent (smoke or AC verification) did not return during repair; the verdict is unknown. Relaunch?',
          options: [], context: `wave ${wave}, repair iteration ${iterations}: agent ${NO_RESULT}`,
        }]);
      }
      for (const v of acCheck.acs ?? []) acVerdicts.set(v.id, v);
      plan = repairPlanFrom({ taskResults: repairResults, mergeResults, ciResult: smoke, acResult: acCheck, owners });
    }

    if (plan.worktreeRepairs.length > 0 || plan.featureRepair) {
      const stuck = [
        ...plan.worktreeRepairs.map((r) => `${r.id}: ${r.diagnosis}`),
        ...(plan.featureRepair ? [`feature branch: ${plan.featureRepair.diagnosis}`] : []),
      ].join('\n');
      return escalate([{
        kind: 'repair-exhausted', wave,
        question: `Wave ${wave} is still red after ${a.repair.maxIterations} repair iterations. How should this proceed?`,
        options: [], context: stuck,
      }]);
    }

    waveReports.push({
      wave,
      tasks: waveTasks.map((t) => t.id),
      merged: mergedIds.filter((id) => order.has(id)),
      smoke: { status: smoke.status },
      acVerification: {
        status: [...acVerdicts.values()].some((v) => v.verdict === 'unverified') ? 'fail' : 'pass',
        acs: [...acVerdicts.values()],
      },
      repairIterations: iterations,
      closedAcs: closedDelta,
    });
  }

  if (!a.close) {
    return finish(payload({ status: 'completed', close: null }));
  }

  // ------------------------------ Feature close ------------------------------
  phase('Close');
  const close = {};

  let fullCi = await runCloseCi('close:ci');
  if (!fullCi) {
    return escalate([{
      kind: 'engine-failure', question: 'The feature-close CI agent did not return. Relaunch?', options: [], context: `close: full CI agent ${NO_RESULT}`,
    }]);
  }
  let closeIterations = 0;
  while (fullCi.status === 'fail' && closeIterations < a.repair.maxIterations) {
    closeIterations += 1;
    const plan = repairPlanFrom({ ciResult: fullCi });
    await spawn(
      featureRepairPrompt(plan.featureRepair.diagnosis, { repoRoot: a.repoRoot, featureBranch: a.featureBranch, baseBranch: a.baseBranch, taskIds }),
      { label: `close:repair-${closeIterations}`, phase: 'Close', schema: STEP_RESULT_SCHEMA },
    );
    fullCi = await runCloseCi(`close:ci-${closeIterations}`);
    if (!fullCi) {
      return escalate([{
        kind: 'engine-failure', question: 'The feature-close CI agent did not return during repair. Relaunch?', options: [], context: `close repair iteration ${closeIterations}: CI agent ${NO_RESULT}`,
      }]);
    }
  }
  if (fullCi.status === 'fail') {
    return escalate([{
      kind: 'repair-exhausted',
      question: `Feature-close CI is still red after ${a.repair.maxIterations} repair iterations. How should this proceed?`,
      options: [], context: (fullCi.failures ?? []).map((f) => `${f.location}: ${f.detail}`).join('\n'),
    }]);
  }
  close.fullCi = { status: fullCi.status, repairIterations: closeIterations };

  const diffStep = await spawn(
    writeDiffPrompt({ repoRoot: a.repoRoot, baseBranch: a.baseBranch, featureBranch: a.featureBranch, featureDir: a.featureDir }),
    { label: 'close:diff', phase: 'Close', schema: STEP_RESULT_SCHEMA, effort: 'low' },
  );
  if (!diffStep || diffStep.status !== 'ok') {
    return escalate([{
      kind: 'engine-failure', question: 'Writing the review diff did not complete. Relaunch?', options: [], context: diffStep?.detail ?? `close: diff agent ${NO_RESULT}`,
    }]);
  }

  const cr = await spawn(
    crPrompt(a.codeReview, { diffFile: diffStep.path, featureDir: a.featureDir }),
    { label: 'close:review', phase: 'Close', schema: CR_RESULT_SCHEMA, effort: 'high' },
  );
  if (!cr) {
    return escalate([{
      kind: 'engine-failure', question: 'The code-review agent did not return. Relaunch?', options: [], context: `close: CR agent ${NO_RESULT}`,
    }]);
  }
  const { mechanical, judgment } = classifyFindings(cr.findings);
  if (judgment.length > 0) {
    return escalate(judgment.map((f) => ({
      kind: 'cr-judgment',
      question: `Code review judgment call at ${f.location}: ${f.detail}`,
      options: [],
      context: `severity: ${f.severity ?? 'unspecified'}; full report: ${cr.reportFile ?? 'n/a'}`,
    })));
  }
  if (mechanical.length > 0) {
    await spawn(
      featureRepairPrompt(
        mechanical.map((f) => `${f.location}: ${f.detail}`).join('\n'),
        { repoRoot: a.repoRoot, featureBranch: a.featureBranch, baseBranch: a.baseBranch, taskIds },
      ),
      { label: 'close:cr-fixes', phase: 'Close', schema: STEP_RESULT_SCHEMA },
    );
  }
  close.cr = { status: cr.status, skillsRun: cr.skillsRun, findings: cr.findings, reportFile: cr.reportFile ?? null };

  const squash = await spawn(
    autosquashPrompt({ repoRoot: a.repoRoot, baseBranch: a.baseBranch, featureBranch: a.featureBranch }),
    { label: 'close:autosquash', phase: 'Close', schema: STEP_RESULT_SCHEMA },
  );
  if (!squash || squash.status !== 'ok') {
    return escalate([{
      kind: 'engine-failure',
      question: 'Autosquash failed or did not return; fixups are still separate commits. Resolve manually and relaunch?',
      options: [], context: squash?.detail ?? `close: autosquash agent ${NO_RESULT}`,
    }]);
  }

  const finalCi = await runCloseCi('close:final-ci');
  if (!finalCi || finalCi.status === 'fail') {
    return escalate([{
      kind: 'repair-exhausted',
      question: 'The FINAL full CI after code-review fixes and autosquash is red — the close regressed. How should this proceed?',
      options: [],
      context: (finalCi?.failures ?? [{ location: 'ci', detail: `final CI agent ${NO_RESULT}` }])
        .map((f) => `${f.location}: ${f.detail}`).join('\n'),
    }]);
  }
  close.finalCi = { status: finalCi.status };

  return finish(payload({ status: 'completed', close }));
}

// Workflow-runtime entry — MUST stay the last line; plain `node` cannot parse a
// top-level return, which is why the tests strip it before importing.
return await run(args);
