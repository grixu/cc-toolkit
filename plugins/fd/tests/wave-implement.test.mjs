import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The script ends with a top-level `return await run(args)` — the Workflow-runtime
// entry — which plain node cannot parse. It also must not carry `export` statements
// beyond `meta`: the runtime wraps the body in an async function, where they are a
// syntax error. Strip the trailing entry, append our own export line for the helpers
// under test, and import via a data: URL.
const scriptPath = fileURLToPath(new URL('../scripts/wave-implement.mjs', import.meta.url));
const source = readFileSync(scriptPath, 'utf8');
const entryMarker = '// Workflow-runtime entry';
const cut = source.indexOf(entryMarker);
if (cut === -1) throw new Error('wave-implement.mjs: Workflow-runtime entry marker not found');
const importable = source.slice(0, cut)
  + '\nexport { parseArgs, scheduleFromSerializeAfter, scheduleWaves, taskPrompt, ciPrompt,'
  + ' unionChangedFiles, acsClosedByWave, reconcileCi, repairPlanFrom, classifyFindings,'
  + ' TASK_RESULT_SCHEMA, CI_RESULT_SCHEMA, MERGE_RESULT_SCHEMA, CR_RESULT_SCHEMA };\n';
const {
  parseArgs,
  scheduleFromSerializeAfter,
  scheduleWaves,
  taskPrompt,
  ciPrompt,
  unionChangedFiles,
  acsClosedByWave,
  reconcileCi,
  repairPlanFrom,
  classifyFindings,
  TASK_RESULT_SCHEMA,
  CI_RESULT_SCHEMA,
  MERGE_RESULT_SCHEMA,
  CR_RESULT_SCHEMA,
} = await import(`data:text/javascript;base64,${Buffer.from(importable).toString('base64')}`);

const task = (over = {}) => ({ id: 'T-001', worktree: '/wt/T-001', branch: 'fd/x/T-001', taskFile: 'tasks/T-001.md', ...over });
const validArgs = (over = {}) => ({
  mode: 'full',
  featureDir: '/repo/docs/features/x',
  slug: 'x',
  repoRoot: '/repo',
  featureBranch: 'feat/x',
  baseBranch: 'main',
  tasks: [task()],
  gate: { lintChanged: true },
  ci: { scope: 'scoped', lint: 'pnpm lint', test: 'pnpm test', build: 'pnpm build', packageManager: 'pnpm' },
  codeReview: { skills: ['code-review'] },
  repair: { maxIterations: 3 },
  ...over,
});

test('parseArgs: passes a valid object through, fills the defaults', () => {
  const args = validArgs();
  const out = parseArgs(args);
  assert.equal(out.mode, 'full');
  assert.equal(out.featureBranch, 'feat/x');
  assert.equal(out.baseBranch, 'main');
  assert.deepEqual(out.tasks, args.tasks);
  assert.equal(out.close, true);
  assert.deepEqual(out.worktreeSetup, []);
  assert.equal(out.worktreeCleanup, 'always');
  assert.equal(out.budget.maxAgents, 200);
});

test('parseArgs: parses a JSON-string payload (Workflow live-launch quirk)', () => {
  const out = parseArgs(JSON.stringify(validArgs()));
  assert.equal(out.mode, 'full');
  assert.equal(out.tasks[0].id, 'T-001');
});

test('parseArgs: a non-JSON string throws', () => {
  assert.throws(() => parseArgs('{not json'), /not valid JSON/);
});

test('parseArgs: a non-object payload throws', () => {
  assert.throws(() => parseArgs(42), /must be an object/);
  assert.throws(() => parseArgs([]), /must be an object/);
});

test('parseArgs: an invalid mode throws', () => {
  assert.throws(() => parseArgs(validArgs({ mode: 'implement' })), /args\.mode/);
});

test('parseArgs: a missing required string throws with its name', () => {
  assert.throws(() => parseArgs(validArgs({ featureBranch: '' })), /featureBranch/);
  assert.throws(() => parseArgs(validArgs({ repoRoot: undefined })), /repoRoot/);
  assert.throws(() => parseArgs(validArgs({ baseBranch: '' })), /baseBranch/);
});

test('parseArgs: an empty tasks array throws', () => {
  assert.throws(() => parseArgs(validArgs({ tasks: [] })), /non-empty array/);
});

test('parseArgs: a task missing a required field throws with its index', () => {
  assert.throws(() => parseArgs(validArgs({ tasks: [task({ worktree: '' })] })), /tasks\[0\]\.worktree/);
  assert.throws(() => parseArgs(validArgs({ tasks: [task(), { id: 'T-002' }] })), /tasks\[1\]\.worktree/);
  assert.throws(() => parseArgs(validArgs({ tasks: [task({ acIds: 'AC-1' })] })), /tasks\[0\]\.acIds/);
});

test('parseArgs: malformed engine sections throw', () => {
  assert.throws(() => parseArgs(validArgs({ gate: undefined })), /args\.gate must be an object/);
  assert.throws(() => parseArgs(validArgs({ ci: { scope: 'wave' } })), /ci\.scope/);
  assert.throws(() => parseArgs(validArgs({ codeReview: { skills: [] } })), /codeReview\.skills/);
  assert.throws(() => parseArgs(validArgs({ repair: { maxIterations: 0 } })), /maxIterations/);
});

test('scheduleFromSerializeAfter: no hints puts every task in a single batch, input order kept', () => {
  const tasks = [task({ id: 'T-001' }), task({ id: 'T-002' }), task({ id: 'T-003' })];
  const batches = scheduleFromSerializeAfter(tasks);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].map((t) => t.id), ['T-001', 'T-002', 'T-003']);
});

test('scheduleFromSerializeAfter: a chain of hints yields ordered batches', () => {
  const tasks = [
    task({ id: 'T-003', serializeAfter: ['T-002'] }),
    task({ id: 'T-001' }),
    task({ id: 'T-002', serializeAfter: ['T-001'] }),
  ];
  const batches = scheduleFromSerializeAfter(tasks);
  assert.deepEqual(batches.map((b) => b.map((t) => t.id)), [['T-001'], ['T-002'], ['T-003']]);
});

test('scheduleFromSerializeAfter: a diamond lands the join after both predecessors', () => {
  const tasks = [
    task({ id: 'A' }),
    task({ id: 'B', serializeAfter: ['A'] }),
    task({ id: 'C', serializeAfter: ['A'] }),
    task({ id: 'D', serializeAfter: ['B', 'C'] }),
  ];
  const batches = scheduleFromSerializeAfter(tasks);
  assert.deepEqual(batches.map((b) => b.map((t) => t.id)), [['A'], ['B', 'C'], ['D']]);
});

test('scheduleFromSerializeAfter: an unknown serializeAfter ref throws', () => {
  const tasks = [task({ id: 'T-001', serializeAfter: ['T-999'] })];
  assert.throws(() => scheduleFromSerializeAfter(tasks), /unknown task T-999/);
});

test('scheduleFromSerializeAfter: a cycle throws', () => {
  const tasks = [
    task({ id: 'T-001', serializeAfter: ['T-002'] }),
    task({ id: 'T-002', serializeAfter: ['T-001'] }),
  ];
  assert.throws(() => scheduleFromSerializeAfter(tasks), /cycle/);
});

test('scheduleFromSerializeAfter: an empty list returns no batches', () => {
  assert.deepEqual(scheduleFromSerializeAfter([]), []);
});

test('scheduleWaves: no deps puts everything in one wave', () => {
  const waves = scheduleWaves([task({ id: 'T-001' }), task({ id: 'T-002' })]);
  assert.equal(waves.length, 1);
  assert.deepEqual(waves[0].batches[0].map((t) => t.id), ['T-001', 'T-002']);
});

test('scheduleWaves: a linear deps chain yields one wave per link', () => {
  const waves = scheduleWaves([
    task({ id: 'T-003', deps: ['T-002'] }),
    task({ id: 'T-001' }),
    task({ id: 'T-002', deps: ['T-001'] }),
  ]);
  assert.deepEqual(waves.map((w) => w.batches.flat().map((t) => t.id)), [['T-001'], ['T-002'], ['T-003']]);
});

test('scheduleWaves: a diamond joins after both producers', () => {
  const waves = scheduleWaves([
    task({ id: 'A' }),
    task({ id: 'B', deps: ['A'] }),
    task({ id: 'C', deps: ['A'] }),
    task({ id: 'D', deps: ['B', 'C'] }),
  ]);
  assert.deepEqual(waves.map((w) => w.batches.flat().map((t) => t.id)), [['A'], ['B', 'C'], ['D']]);
});

test('scheduleWaves: a dep on a task outside the list counts as satisfied (merged in a prior run)', () => {
  const waves = scheduleWaves([
    task({ id: 'T-007', deps: ['T-001'] }),
    task({ id: 'T-008', deps: ['T-007'] }),
  ]);
  assert.deepEqual(waves.map((w) => w.batches.flat().map((t) => t.id)), [['T-007'], ['T-008']]);
});

test('scheduleWaves: a deps cycle throws', () => {
  assert.throws(() => scheduleWaves([
    task({ id: 'T-001', deps: ['T-002'] }),
    task({ id: 'T-002', deps: ['T-001'] }),
  ]), /deps cycle/);
});

test('scheduleWaves: serializeAfter batches within a wave; cross-wave refs are filtered, not thrown', () => {
  const waves = scheduleWaves([
    task({ id: 'A' }),
    task({ id: 'B', deps: ['A'], serializeAfter: ['A'] }),
    task({ id: 'C', deps: ['A'], serializeAfter: ['B'] }),
  ]);
  // A alone in wave 0; B and C share wave 1, where serializeAfter B->C splits the batches
  // and the cross-wave ref B->A is dropped instead of throwing.
  assert.deepEqual(waves[1].batches.map((b) => b.map((t) => t.id)), [['B'], ['C']]);
});

test('unionChangedFiles: dedupes and sorts across results', () => {
  const files = unionChangedFiles([
    { changedFiles: ['src/b.ts', 'src/a.ts'] },
    { changedFiles: ['src/a.ts', 'src/c.ts'] },
    null,
  ]);
  assert.deepEqual(files, ['src/a.ts', 'src/b.ts', 'src/c.ts']);
});

test('acsClosedByWave: an AC closes only when every owning task has merged', () => {
  const tasks = [
    task({ id: 'T-001', acIds: ['AC-1', 'AC-2'] }),
    task({ id: 'T-002', acIds: ['AC-2'] }),
    task({ id: 'T-003', acIds: [] }),
  ];
  assert.deepEqual(acsClosedByWave(tasks, ['T-001']), ['AC-1']);
  assert.deepEqual(acsClosedByWave(tasks, ['T-001', 'T-002']), ['AC-1', 'AC-2']);
  assert.deepEqual(acsClosedByWave(tasks, []), []);
});

test('reconcileCi: a pass claim with a non-zero exit code is downgraded to fail', () => {
  const lying = reconcileCi({
    status: 'pass', scope: 'full',
    commands: [{ cmd: 'pnpm test', exitCode: 1, tail: '1 failed' }],
    failures: [],
  });
  assert.equal(lying.status, 'fail');
  assert.ok(lying.failures.some((f) => f.location === 'ci-verdict'));

  const honest = reconcileCi({ status: 'pass', scope: 'full', commands: [{ cmd: 'pnpm test', exitCode: 0 }], failures: [] });
  assert.equal(honest.status, 'pass');
  assert.equal(reconcileCi(null), null);
});

test('repairPlanFrom: failed tasks and merge conflicts repair in worktrees; CI failures become one feature repair', () => {
  const plan = repairPlanFrom({
    taskResults: [
      { id: 'T-001', status: 'passed' },
      { id: 'T-002', status: 'failed', diagnosis: 'lint red' },
    ],
    mergeResults: [
      { task: 'T-001', status: 'merged', sha: 'abc' },
      { task: 'T-003', status: 'conflict', detail: 'overlapping hunk in src/x.ts' },
    ],
    ciResult: { status: 'fail', failures: [{ location: 'src/y.ts:12', detail: 'type error' }] },
  });
  assert.deepEqual(plan.worktreeRepairs, [
    { id: 'T-002', diagnosis: 'lint red' },
    { id: 'T-003', diagnosis: 'overlapping hunk in src/x.ts' },
  ]);
  assert.match(plan.featureRepair.diagnosis, /src\/y\.ts:12: type error/);

  const clean = repairPlanFrom({ taskResults: [{ id: 'T-001', status: 'passed' }], mergeResults: [], ciResult: { status: 'pass', failures: [] } });
  assert.deepEqual(clean, { worktreeRepairs: [], featureRepair: null });

  // red CI with an under-reporting agent (no failure entries) must still force a repair
  const silent = repairPlanFrom({ ciResult: { status: 'fail', failures: [] } });
  assert.match(silent.featureRepair.diagnosis, /without structured failure entries/);
});

test('classifyFindings: only explicit mechanical findings are auto-fixed; everything else is a judgment call', () => {
  const { mechanical, judgment } = classifyFindings([
    { kind: 'mechanical', location: 'a.ts', detail: 'missed rename' },
    { kind: 'judgment', location: 'b.ts', detail: 'API shape choice' },
    { location: 'c.ts', detail: 'no kind given' },
  ]);
  assert.equal(mechanical.length, 1);
  assert.equal(judgment.length, 2);
  assert.deepEqual(classifyFindings(undefined), { mechanical: [], judgment: [] });
});

test('taskPrompt: embeds the task file path, per-task ACs, the stub rule, and the breadcrumb instruction', () => {
  const p = taskPrompt(task({ taskFile: 'tasks/T-042.md', acIds: ['AC-1', 'AC-2'] }), 'implement');
  assert.match(p, /tasks\/T-042\.md/);
  assert.match(p, /Stub rule:/);
  assert.match(p, /--allow-empty/);
  assert.match(p, /Fd-Gate: pass/);
  assert.match(p, /AC-1, AC-2/);
  assert.match(p, /Escalation rule:/);
});

test('taskPrompt: repair mode carries the diagnosis; a HIL decision block appears when set', () => {
  const impl = taskPrompt(task({ acIds: [] }), 'implement');
  assert.doesNotMatch(impl, /Repair diagnosis/);
  assert.doesNotMatch(impl, /HIL decision/);

  const repair = taskPrompt(task({ diagnosis: 'AC-1 fails: null pointer in parse()' }), 'repair');
  assert.match(repair, /Repair diagnosis/);
  assert.match(repair, /null pointer in parse\(\)/);
  assert.match(repair, /--fixup/);

  const decided = taskPrompt(task({ decision: 'Use approach B: store the flag on the org record.' }), 'implement');
  assert.match(decided, /HIL decision/);
  assert.match(decided, /approach B/);
});

test('ciPrompt: scoped names the changed files and the fallback; full does not', () => {
  const ci = { scope: 'scoped', lint: 'pnpm lint', test: 'pnpm test', build: 'pnpm build', packageManager: 'pnpm' };
  const scoped = ciPrompt(ci, { repoRoot: '/repo', scope: 'scoped', changedFiles: ['src/a.ts'], closedAcs: ['AC-1'] });
  assert.match(scoped, /src\/a\.ts/);
  assert.match(scoped, /Fall back to the FULL/);
  assert.match(scoped, /AC-1/);

  const full = ciPrompt(ci, { repoRoot: '/repo', scope: 'full', changedFiles: [], closedAcs: [] });
  assert.doesNotMatch(full, /Fall back to the FULL/);
  assert.match(full, /pnpm test/);
});

test('result schemas: the shapes the run path depends on', () => {
  assert.deepEqual(TASK_RESULT_SCHEMA.required, ['id', 'status', 'changedFiles', 'headSha', 'gate']);
  assert.deepEqual(TASK_RESULT_SCHEMA.properties.status.enum, ['passed', 'failed', 'escalated']);
  assert.deepEqual(TASK_RESULT_SCHEMA.properties.gate.required, ['ac', 'lint']);
  assert.deepEqual(TASK_RESULT_SCHEMA.properties.escalation.required, ['question', 'context']);

  assert.deepEqual(CI_RESULT_SCHEMA.required, ['status', 'scope', 'commands', 'failures']);
  assert.deepEqual(CI_RESULT_SCHEMA.properties.commands.items.required, ['cmd', 'exitCode']);

  assert.deepEqual(MERGE_RESULT_SCHEMA.required, ['results']);
  assert.deepEqual(MERGE_RESULT_SCHEMA.properties.results.items.properties.status.enum, ['merged', 'conflict', 'blocked']);

  assert.deepEqual(CR_RESULT_SCHEMA.required, ['status', 'skillsRun', 'findings']);
  assert.deepEqual(CR_RESULT_SCHEMA.properties.findings.items.properties.kind.enum, ['mechanical', 'judgment']);
});

test('the script carries no exports beyond meta (Workflow runtime constraint)', () => {
  const exportLines = source.split('\n').filter((l) => /^export /.test(l));
  assert.deepEqual(exportLines, ['export const meta = {']);
  assert.ok(!/^import /m.test(source));
});
