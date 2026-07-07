// Claude Code dynamic-workflow script for /fd:implement — the FULL delivery cycle in
// one run: for every wave (computed here from task deps) it prepares worktrees, runs the
// task agents, squash-merges the passing tasks (fd:merger), runs wave CI, and repairs red
// CI up to K iterations; after the last wave it runs full CI, the whole-feature code
// review, mechanical fixes, autosquash, and the final full CI. It calls the harness
// `agent()` / `parallel()` globals and is launched via the Workflow tool (scriptPath);
// it is NEVER run with `node`.
//
// The run returns early with status "escalated" only for decisions a human must make
// (architectural spec gap, repair exhaustion, CR judgment call, or a dead merge/CI
// agent), and with status "continue" when the internal agent budget is spent — the main
// thread relaunches with the remaining tasks, no HIL. State files are NOT written here:
// the `Task: <id>` trailers on the feature branch are the in-run ledger, and the main
// thread persists them via record-impl.mjs at every return.
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
    'Full /fd:implement cycle in one run: waves from task deps (worktree isolation, per-task self-gate, breadcrumb), serial squash-merge per wave, wave CI with a bounded repair loop, then feature close (full CI, code review, mechanical fixes, autosquash, final CI). Returns completed | continue | escalated; the main thread persists state from Task: trailers at every return.',
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
  tasks.forEach((t, i) => {
    if (!t || typeof t !== 'object') {
      throw new Error(`wave-implement: tasks[${i}] must be an object`);
    }
    for (const field of ['id', 'worktree', 'branch', 'taskFile']) {
      if (typeof t[field] !== 'string' || t[field] === '') {
        throw new Error(`wave-implement: tasks[${i}].${field} must be a non-empty string`);
      }
    }
    for (const field of ['deps', 'serializeAfter', 'acIds']) {
      if (t[field] !== undefined && !Array.isArray(t[field])) {
        throw new Error(`wave-implement: tasks[${i}].${field} must be an array when present`);
      }
    }
  });
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    throw new Error('wave-implement: args.gate must be an object');
  }
  if (!ci || typeof ci !== 'object' || (ci.scope !== 'full' && ci.scope !== 'scoped')) {
    throw new Error('wave-implement: args.ci.scope must be "full" or "scoped"');
  }
  if (!codeReview || !Array.isArray(codeReview.skills) || codeReview.skills.length === 0) {
    throw new Error('wave-implement: args.codeReview.skills must be a non-empty array');
  }
  if (!repair || !Number.isInteger(repair.maxIterations) || repair.maxIterations < 1) {
    throw new Error('wave-implement: args.repair.maxIterations must be a positive integer');
  }

  return {
    mode, featureDir, slug, repoRoot, featureBranch, baseBranch, tasks, gate, ci,
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

// An AC is closed once EVERY task that lists it in acIds has merged. Returns the full
// closed set for the given merged ids; callers diff consecutive calls for a wave delta.
function acsClosedByWave(allTasks, mergedTaskIds) {
  const merged = new Set(mergedTaskIds);
  const owners = new Map();
  for (const t of allTasks) {
    for (const ac of t.acIds ?? []) {
      if (!owners.has(ac)) owners.set(ac, []);
      owners.get(ac).push(t.id);
    }
  }
  const closed = [];
  for (const [ac, ids] of owners) {
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

// Splits a wave's failures into repair work: failed/unmerged tasks are repaired in their
// own worktrees (parallel, re-merged after); CI failures on already-merged code become
// ONE serial feature-branch repair (fixup commits), so nothing races the feature branch.
function repairPlanFrom({ taskResults = [], mergeResults = [], ciResult = null }) {
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
  // A red CI ALWAYS yields a feature repair — even with an empty failures list (an agent
  // that under-reports must not let the wave sail through green).
  const featureRepair = ciResult && ciResult.status === 'fail'
    ? {
      diagnosis: (ciResult.failures ?? []).length > 0
        ? ciResult.failures.map((f) => `${f.location}: ${f.detail}`).join('\n')
        : 'CI failed without structured failure entries — re-run the configured commands and diagnose from their output tails',
    }
    : null;
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
  required: ['status', 'scope', 'commands', 'failures'],
  properties: {
    status: { type: 'string', enum: ['pass', 'fail'] },
    scope: { type: 'string', enum: ['scoped', 'full'], description: 'the scope actually run (scoped may fall back to full)' },
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
// the shared task-agent contract verbatim (with the breadcrumb).
function taskPrompt(task, mode) {
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
    );
  }

  if (task.decision) {
    lines.push(
      '',
      'HIL decision — a human already resolved this task\'s open question; implement per this decision, do not re-litigate it:',
      task.decision,
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

function ciPrompt(ci, { repoRoot, scope, changedFiles, closedAcs }) {
  const commands = [
    ci.lint ? `lint: ${ci.lint}` : null,
    ci.build ? `build: ${ci.build}` : null,
    ci.test ? `test: ${ci.test}` : null,
  ].filter(Boolean);
  const lines = [
    'You run the CI gate for a merged wave of tasks, at the repository root, on the feature branch as currently checked out. Run commands, report literal exit codes — never summarize a failure away.',
    '',
    `Repository root: ${repoRoot}`,
    `Configured commands: ${commands.length ? commands.join(' | ') : '(none configured — report status "pass" with an empty commands list and note it in failures as location "config", detail "no CI commands configured")'}`,
    `Requested scope: ${scope}`,
  ];
  if (scope === 'scoped') {
    lines.push(
      '',
      'Scoped run: map the changed files below to workspace packages (pnpm-workspace.yaml / package.json#workspaces / turbo.json) and run the commands filtered to those packages plus their dependents. Fall back to the FULL unfiltered commands unless the mapping is unambiguous; report the scope you actually ran.',
      `Changed files: ${changedFiles.length ? changedFiles.join(', ') : '(none reported)'}`,
    );
  }
  if (closedAcs.length > 0) {
    lines.push(
      '',
      `Acceptance criteria closed by this wave: ${closedAcs.join(', ')} — verify the test run demonstrably covers them; an AC left untested by a green run is a failure entry (location "ac:<id>").`,
    );
  }
  lines.push(
    '',
    'Return JSON: status, scope, commands = [{cmd, exitCode, tail (last lines when non-zero)}], failures = [{location, detail}] (empty when green).',
  );
  return lines.join('\n');
}

// Merged-code repairs run as ONE serial agent per iteration: fixup commits land directly
// on the feature branch, so parallel writers are forbidden by construction.
function featureRepairPrompt(diagnosis, { repoRoot, featureBranch, baseBranch }) {
  return [
    'You repair a red CI on the feature branch. Work at the repository root on the feature branch as checked out; you are the ONLY writer right now.',
    '',
    `Repository root: ${repoRoot}`,
    `Feature branch: ${featureBranch} (base: ${baseBranch})`,
    '',
    'Failures to fix — fix exactly these, nothing speculative:',
    diagnosis,
    '',
    'Land each fix as `git commit --fixup <sha-of-the-commit-that-introduced-it>` (find the culprit with `git log`/`git blame`; when genuinely unattributable, use a normal commit with the trailer `Task: <owning-task-id>`). Do NOT rebase or autosquash — that happens at feature close.',
    'Re-run only the failed commands to confirm the fix; report literal exit codes.',
    '',
    'Return JSON: status ("ok" when every listed failure is fixed and re-verified, else "failed"), detail.',
  ].join('\n');
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

// ---------------------------------------------------------------------------------
// Run path (harness only). Everything below references the agent/parallel/phase/log
// globals, so importing this module under plain node (for the tests) has no side effects.

async function run(rawArgs) {
  const a = parseArgs(rawArgs);
  const waves = scheduleWaves(a.tasks);
  const taskById = new Map(a.tasks.map((t) => [t.id, t]));

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
  const escalate = (list) => payload({ status: 'escalated', escalations: [...escalations, ...list] });

  const runCi = async (scope, changedFiles, closedAcs, label, phaseName) => {
    const raw = await spawn(
      ciPrompt(a.ci, { repoRoot: a.repoRoot, scope, changedFiles, closedAcs }),
      { label, phase: phaseName, schema: CI_RESULT_SCHEMA },
    );
    return reconcileCi(raw);
  };

  const mergeTasks = async (passing, label, phaseName) => {
    if (passing.length === 0) return [];
    const merged = await spawn(
      mergerPrompt(passing, { repoRoot: a.repoRoot, featureBranch: a.featureBranch, worktreeCleanup: a.worktreeCleanup }),
      { label, phase: phaseName, agentType: 'fd:merger', schema: MERGE_RESULT_SCHEMA },
    );
    if (!merged) return null;
    for (const m of merged.results) {
      if (m.status === 'merged' && !mergedIds.includes(m.task)) mergedIds.push(m.task);
    }
    return merged.results;
  };

  for (const { wave, batches } of waves) {
    const label = `wave-${wave}`;
    phase(`Wave ${wave}`);
    const waveTasks = batches.flat();

    if (agentCalls >= a.budget.maxAgents) {
      log(`agent budget spent (${agentCalls}/${a.budget.maxAgents}) — checkpointing before wave ${wave}`);
      return payload({ status: 'continue', reason: 'agent-budget' });
    }

    // Serial worktree preparation, cut from the feature branch AFTER the prior wave's merges.
    const prep = await spawn(
      prepareWavePrompt(waveTasks, { repoRoot: a.repoRoot, featureBranch: a.featureBranch, worktreeSetup: a.worktreeSetup }),
      { label: `${label}:prepare`, phase: `Wave ${wave}`, schema: PREP_RESULT_SCHEMA },
    );
    if (!prep || prep.status !== 'ready') {
      return escalate([{
        kind: 'engine-failure',
        wave,
        question: 'Worktree preparation failed — fix the working copy and relaunch?',
        options: [],
        context: prep?.detail ?? 'prepare-wave agent returned no result',
      }]);
    }

    const waveResults = [];
    for (const batch of batches) {
      const batchResults = await parallel(
        batch.map((task) => () =>
          spawn(taskPrompt(task, a.mode === 'repair' ? 'repair' : 'implement'),
            { label: task.id, phase: `Wave ${wave}`, schema: TASK_RESULT_SCHEMA })),
      );
      batchResults.forEach((r, i) => {
        const task = batch[i];
        const result = r ?? {
          id: task.id,
          status: 'failed',
          changedFiles: [],
          headSha: '',
          gate: { ac: 'fail', lint: 'fail' },
          diagnosis: 'task agent returned no result (killed or errored)',
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
        question: 'The merger agent died mid-wave; branch state is unknown. Salvage from trailers and relaunch?',
        options: [], context: `wave ${wave}: merger returned no result`,
      }]);
    }

    if (escalations.length > 0) {
      return escalate([]);
    }

    const changed = unionChangedFiles(waveResults.filter((r) => r.status === 'passed'));
    const closedNow = acsClosedByWave(a.tasks, mergedIds);
    const closedDelta = closedNow.filter((ac) => !closedBefore.includes(ac));
    closedBefore = closedNow;

    let ci = await runCi(a.ci.scope, changed, closedDelta, `${label}:ci`, `Wave ${wave}`);
    if (!ci) {
      return escalate([{
        kind: 'engine-failure', wave,
        question: 'The wave CI agent died; the wave verdict is unknown. Relaunch?',
        options: [], context: `wave ${wave}: CI agent returned no result`,
      }]);
    }

    let iterations = 0;
    let plan = repairPlanFrom({ taskResults: waveResults, mergeResults, ciResult: ci });
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
            spawn(taskPrompt(task, 'repair'),
              { label: `${task.id}:repair-${iterations}`, phase: `Wave ${wave}`, schema: TASK_RESULT_SCHEMA })),
        )).map((r, i) => r ?? {
          id: repairTasks[i].id, status: 'failed', changedFiles: [], headSha: '',
          gate: { ac: 'fail', lint: 'fail' }, diagnosis: 'repair agent returned no result',
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
            question: 'The merger agent died during a repair merge. Salvage from trailers and relaunch?',
            options: [], context: `wave ${wave}, repair iteration ${iterations}`,
          }]);
        }
        mergeResults = rm;
      } else {
        mergeResults = [];
      }

      if (plan.featureRepair) {
        await spawn(
          featureRepairPrompt(plan.featureRepair.diagnosis, { repoRoot: a.repoRoot, featureBranch: a.featureBranch, baseBranch: a.baseBranch }),
          { label: `${label}:repair-${iterations}`, phase: `Wave ${wave}`, schema: STEP_RESULT_SCHEMA },
        );
      }

      const repairChanged = unionChangedFiles(repairResults.filter((r) => r.status === 'passed'));
      ci = await runCi(a.ci.scope, repairChanged.length > 0 ? repairChanged : changed, closedDelta, `${label}:ci-${iterations}`, `Wave ${wave}`);
      if (!ci) {
        return escalate([{
          kind: 'engine-failure', wave,
          question: 'The wave CI agent died during repair; the verdict is unknown. Relaunch?',
          options: [], context: `wave ${wave}, repair iteration ${iterations}`,
        }]);
      }
      plan = repairPlanFrom({ taskResults: repairResults, mergeResults, ciResult: ci });
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
      ci: { status: ci.status, scope: ci.scope },
      repairIterations: iterations,
      closedAcs: closedDelta,
    });
  }

  if (!a.close) {
    return payload({ status: 'completed', close: null });
  }

  // ------------------------------ Feature close ------------------------------
  phase('Close');
  const close = {};

  let fullCi = await runCi('full', [], [], 'close:ci', 'Close');
  if (!fullCi) {
    return escalate([{
      kind: 'engine-failure', question: 'The feature-close CI agent died. Relaunch?', options: [], context: 'close: full CI returned no result',
    }]);
  }
  let closeIterations = 0;
  while (fullCi.status === 'fail' && closeIterations < a.repair.maxIterations) {
    closeIterations += 1;
    const plan = repairPlanFrom({ ciResult: fullCi });
    await spawn(
      featureRepairPrompt(plan.featureRepair.diagnosis, { repoRoot: a.repoRoot, featureBranch: a.featureBranch, baseBranch: a.baseBranch }),
      { label: `close:repair-${closeIterations}`, phase: 'Close', schema: STEP_RESULT_SCHEMA },
    );
    fullCi = await runCi('full', [], [], `close:ci-${closeIterations}`, 'Close');
    if (!fullCi) {
      return escalate([{
        kind: 'engine-failure', question: 'The feature-close CI agent died during repair. Relaunch?', options: [], context: `close repair iteration ${closeIterations}`,
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
      kind: 'engine-failure', question: 'Writing the review diff failed. Relaunch?', options: [], context: diffStep?.detail ?? 'diff agent returned no result',
    }]);
  }

  const cr = await spawn(
    crPrompt(a.codeReview, { diffFile: diffStep.path, featureDir: a.featureDir }),
    { label: 'close:review', phase: 'Close', schema: CR_RESULT_SCHEMA, effort: 'high' },
  );
  if (!cr) {
    return escalate([{
      kind: 'engine-failure', question: 'The code-review agent died. Relaunch?', options: [], context: 'close: CR returned no result',
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
        { repoRoot: a.repoRoot, featureBranch: a.featureBranch, baseBranch: a.baseBranch },
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
      question: 'Autosquash failed or died; fixups are still separate commits. Resolve manually and relaunch?',
      options: [], context: squash?.detail ?? 'autosquash agent returned no result',
    }]);
  }

  const finalCi = await runCi('full', [], [], 'close:final-ci', 'Close');
  if (!finalCi || finalCi.status === 'fail') {
    return escalate([{
      kind: 'repair-exhausted',
      question: 'The FINAL full CI after code-review fixes and autosquash is red — the close regressed. How should this proceed?',
      options: [],
      context: (finalCi?.failures ?? [{ location: 'ci', detail: 'final CI agent returned no result' }])
        .map((f) => `${f.location}: ${f.detail}`).join('\n'),
    }]);
  }
  close.finalCi = { status: finalCi.status };

  return payload({ status: 'completed', close });
}

// Workflow-runtime entry — MUST stay the last line; plain `node` cannot parse a
// top-level return, which is why the tests strip it before importing.
return await run(args);
