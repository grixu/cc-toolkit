// Claude Code dynamic-workflow script for /fd:implement — one wave (or one repair
// wave) of task implementation. It calls the harness `agent()` / `parallel()` globals
// and is launched via the Workflow tool (scriptPath); it is NEVER run with `node`.
// It does implementation + per-task self-gate + a durable breadcrumb ONLY — no merging,
// no manifest writes, no scoped CI, no code review (those belong to the main thread).
//
// The runtime provides `args` (the passed input) and the `agent`/`parallel` globals,
// wraps the body in an async context, and takes the body's top-level `return` as the
// workflow result — hence the final `return await run(args)` line. That line is illegal
// under plain `node`, so the unit tests import this module by stripping it (see
// tests/wave-implement.test.mjs); everything above it is import-safe and side-effect-free.
// No Date.now()/Math.random() here — the script is deterministic; agents produce any
// time-dependent values.

export const meta = {
  name: 'wave-implement',
  description:
    'One /fd:implement wave: run each ready task in its isolated worktree, self-gate it (AC covered entirely + lint of changed files), and leave a durable Fd-Gate breadcrumb commit. Returns per-task structured results; the main thread does the serial merge, manifest writes, scoped CI, and code review.',
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

  const { mode, wave, featureBranch, tasks, gate } = a;
  if (mode !== 'implement' && mode !== 'repair') {
    throw new Error(`wave-implement: args.mode must be "implement" or "repair", got ${JSON.stringify(mode)}`);
  }
  if (wave === undefined || wave === null) {
    throw new Error('wave-implement: args.wave is required');
  }
  if (typeof featureBranch !== 'string' || featureBranch === '') {
    throw new Error('wave-implement: args.featureBranch must be a non-empty string');
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('wave-implement: args.tasks must be a non-empty array');
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
  });
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    throw new Error('wave-implement: args.gate must be an object');
  }
  if (!Array.isArray(gate.acIds)) {
    throw new Error('wave-implement: args.gate.acIds must be an array');
  }

  return { mode, wave, featureBranch, tasks, gate };
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

// Structured contract every task agent returns (one per agent() call). The main thread
// merges passing tasks in order and records impl.commits; a failed task feeds the repair loop.
const TASK_RESULT_SCHEMA = {
  type: 'object',
  required: ['id', 'status', 'changedFiles', 'headSha', 'gate'],
  properties: {
    id: { type: 'string', description: 'the T-<n> id of the task this result is for' },
    status: {
      type: 'string',
      enum: ['passed', 'failed'],
      description: 'passed = self-gate green and the breadcrumb commit written; failed = gate red or work incomplete',
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
  },
};

// Single source of truth for the task-agent directives. Embedded verbatim in every task
// prompt here; the subagent fallback in commands/implement.md reuses the same directives.
const TASK_CONTRACT = [
  'Task-agent contract — follow exactly:',
  '- The task file is self-contained. Do NOT re-grep or rediscover paths, symbols, or contracts already named in its body or codeDeps — read the task file once and trust it.',
  '- Batch your edits: make all code changes first, then run typecheck and lint ONCE at the end — never after every edit.',
  '- Stub rule: if a dependency file you need does not exist yet, a peer task owns it — write a MINIMAL, contract-satisfying stub, never recreate or fully implement a peer\'s file. Do not touch files this task does not own.',
  '- Commit atomically, piece by piece, on your worktree branch, with the decision rationale in each commit message.',
  '- Self-gate before finishing: validate the ACs this task covers entirely and lint the files you changed or created.',
  '- Breadcrumb: your FINAL act, only after the self-gate passes, is exactly ONE empty commit on your worktree branch —',
  '    git -C <worktree> commit --allow-empty -m "<subject>" -m "<one-line gate summary>" --trailer "Task: <id>" --trailer "Fd-Gate: pass"',
  '  Both the Task and Fd-Gate trailers must be present. If the self-gate FAILS, do NOT write the breadcrumb: return status "failed" with a diagnosis instead.',
].join('\n');

// Builds one task agent's prompt: where to work, its self-gate, the mode (repair carries
// the diagnosis to fix), and the shared task-agent contract verbatim (with the breadcrumb).
function taskPrompt(task, gate, mode) {
  const acLine = gate.acIds && gate.acIds.length
    ? gate.acIds.join(', ')
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
    );
  }

  lines.push(
    '',
    TASK_CONTRACT,
    '',
    'Return a JSON object matching the result schema: id, status ("passed"|"failed"), changedFiles, headSha, gate {ac, lint}, and diagnosis when status is "failed".',
  );

  return lines.join('\n');
}

// Run path (harness only). Schedules the wave's tasks into serialization batches, runs
// each batch's task agents in parallel, and returns the collected per-task results.
// References the `agent`/`parallel` globals only here, so importing this module under
// plain node (for the tests) has no side effects.
async function run(rawArgs) {
  const { mode, tasks, gate } = parseArgs(rawArgs);
  const batches = scheduleFromSerializeAfter(tasks);

  const results = [];
  for (const batch of batches) {
    const batchResults = await parallel(
      batch.map((task) => () => agent(taskPrompt(task, gate, mode), { label: task.id, schema: TASK_RESULT_SCHEMA })),
    );
    for (const r of batchResults) if (r) results.push(r);
  }

  return { tasks: results };
}

// Workflow-runtime entry — MUST stay the last line; plain `node` cannot parse a
// top-level return, which is why the tests strip it before importing.
return await run(args);
