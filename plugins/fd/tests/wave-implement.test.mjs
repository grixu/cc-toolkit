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
  + ' smokePrompt, acVerifyPrompt, featureRepairPrompt, unionChangedFiles, acOwners,'
  + ' acsClosedByWave, reconcileCi, reconcileAc, repairPlanFrom, classifyFindings,'
  + ' TASK_RESULT_SCHEMA, CI_RESULT_SCHEMA, AC_RESULT_SCHEMA, MERGE_RESULT_SCHEMA, CR_RESULT_SCHEMA };\n';
const {
  parseArgs,
  scheduleFromSerializeAfter,
  scheduleWaves,
  taskPrompt,
  ciPrompt,
  smokePrompt,
  acVerifyPrompt,
  featureRepairPrompt,
  unionChangedFiles,
  acOwners,
  acsClosedByWave,
  reconcileCi,
  reconcileAc,
  repairPlanFrom,
  classifyFindings,
  TASK_RESULT_SCHEMA,
  CI_RESULT_SCHEMA,
  AC_RESULT_SCHEMA,
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
  ci: { typecheck: 'pnpm typecheck', lint: 'pnpm lint', test: 'pnpm test', build: 'pnpm build', packageManager: 'pnpm' },
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
  assert.throws(() => parseArgs(validArgs({ ci: null })), /args\.ci must be an object/);
  assert.throws(() => parseArgs(validArgs({ ci: ['pnpm test'] })), /args\.ci must be an object/);
  assert.throws(() => parseArgs(validArgs({ codeReview: { skills: [] } })), /codeReview\.skills/);
  assert.throws(() => parseArgs(validArgs({ repair: { maxIterations: 0 } })), /maxIterations/);
});

test('parseArgs: corruption tripwires — self-reference, ref format, declared tasksCount', () => {
  assert.throws(
    () => parseArgs(validArgs({ tasks: [task({ serializeAfter: ['T-001'] })] })),
    /references the task itself/,
  );
  assert.throws(
    () => parseArgs(validArgs({ tasks: [task({ deps: ['T-001'] })] })),
    /references the task itself/,
  );
  assert.throws(
    () => parseArgs(validArgs({ tasks: [task({ deps: ['t-2'] })] })),
    /must match T-<n>/,
  );
  assert.throws(() => parseArgs(validArgs({ tasks: [task({ id: 'task-1', worktree: '/wt/task-1', branch: 'fd/x/task-1' })] })), /must match T-<n>/);
  assert.throws(() => parseArgs(validArgs({ tasksCount: 2 })), /tasksCount/);
  assert.equal(parseArgs(validArgs({ tasksCount: 1 })).tasks.length, 1);
});

test('parseArgs: gateDebt — absent or empty folds to null, populated normalizes, malformed throws', () => {
  assert.equal(parseArgs(validArgs()).gateDebt, null);
  assert.equal(parseArgs(validArgs({ gateDebt: null })).gateDebt, null);
  assert.equal(parseArgs(validArgs({ gateDebt: { smoke: false, acs: [] } })).gateDebt, null);
  assert.deepEqual(
    parseArgs(validArgs({ gateDebt: { smoke: true, acs: ['AC-7'] } })).gateDebt,
    { smoke: true, acs: ['AC-7'] },
  );
  assert.deepEqual(
    parseArgs(validArgs({ gateDebt: { acs: ['AC-7'] } })).gateDebt,
    { smoke: false, acs: ['AC-7'] },
  );
  assert.throws(() => parseArgs(validArgs({ gateDebt: ['AC-7'] })), /gateDebt/);
  assert.throws(() => parseArgs(validArgs({ gateDebt: { acs: [''] } })), /gateDebt\.acs/);
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
    status: 'pass',
    commands: [{ cmd: 'pnpm test', exitCode: 1, tail: '1 failed' }],
    failures: [],
  });
  assert.equal(lying.status, 'fail');
  assert.ok(lying.failures.some((f) => f.location === 'ci-verdict'));

  const honest = reconcileCi({ status: 'pass', commands: [{ cmd: 'pnpm test', exitCode: 0 }], failures: [] });
  assert.equal(honest.status, 'pass');
  assert.equal(reconcileCi(null), null);
});

test('reconcileAc: a pass claim with an unverified AC in the list is downgraded to fail', () => {
  const lying = reconcileAc({
    status: 'pass',
    acs: [
      { id: 'AC-1', verdict: 'covered-by-test', detail: 'pnpm vitest run -t AC-1 → exit 0' },
      { id: 'AC-2', verdict: 'unverified', detail: 'no test, behavior not found' },
    ],
  });
  assert.equal(lying.status, 'fail');

  const honest = reconcileAc({ status: 'pass', acs: [{ id: 'AC-1', verdict: 'verified-by-inspection', detail: 'config key present' }] });
  assert.equal(honest.status, 'pass');
  assert.equal(reconcileAc(null), null);
});

test('acOwners: maps every AC to all tasks listing it', () => {
  const owners = acOwners([
    task({ id: 'T-001', acIds: ['AC-1', 'AC-2'] }),
    task({ id: 'T-002', acIds: ['AC-2'] }),
  ]);
  assert.deepEqual(owners.get('AC-1'), ['T-001']);
  assert.deepEqual(owners.get('AC-2'), ['T-001', 'T-002']);
});

test('repairPlanFrom: failed tasks and merge conflicts repair in worktrees; smoke/CI failures become one feature repair', () => {
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

test('repairPlanFrom: an unverified AC becomes a feature repair naming its owners; verified ACs repair nothing', () => {
  const owners = acOwners([
    task({ id: 'T-004', acIds: ['AC-7'] }),
    task({ id: 'T-005', acIds: ['AC-7', 'AC-8'] }),
  ]);
  const plan = repairPlanFrom({
    acResult: {
      status: 'fail',
      acs: [
        { id: 'AC-7', verdict: 'unverified', detail: 'no test exercises the retry path' },
        { id: 'AC-8', verdict: 'covered-by-test', detail: 'targeted run green' },
      ],
    },
    owners,
  });
  assert.deepEqual(plan.worktreeRepairs, []);
  assert.match(plan.featureRepair.diagnosis, /ac:AC-7/);
  assert.match(plan.featureRepair.diagnosis, /no test exercises the retry path/);
  assert.match(plan.featureRepair.diagnosis, /T-004, T-005/);
  assert.match(plan.featureRepair.diagnosis, /fixup of the owning task/);
  assert.doesNotMatch(plan.featureRepair.diagnosis, /AC-8/);

  const verified = repairPlanFrom({
    acResult: { status: 'pass', acs: [{ id: 'AC-8', verdict: 'verified-by-inspection', detail: 'wiring present' }] },
    owners,
  });
  assert.deepEqual(verified, { worktreeRepairs: [], featureRepair: null });

  // a smoke red and an unverified AC stack into ONE serial feature repair
  const both = repairPlanFrom({
    ciResult: { status: 'fail', failures: [{ location: 'build', detail: 'TS2345 in src/z.ts' }] },
    acResult: { status: 'fail', acs: [{ id: 'AC-7', verdict: 'unverified', detail: 'missing test' }] },
    owners,
  });
  assert.match(both.featureRepair.diagnosis, /TS2345/);
  assert.match(both.featureRepair.diagnosis, /ac:AC-7/);
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
  assert.match(repair, /Never delete or weaken a test/);

  const decided = taskPrompt(task({ decision: 'Use approach B: store the flag on the org record.' }), 'implement');
  assert.match(decided, /HIL decision/);
  assert.match(decided, /approach B/);
});

test('ciPrompt: the close gate is always the full unfiltered pipeline', () => {
  const ci = { typecheck: 'pnpm typecheck', lint: 'pnpm lint', test: 'pnpm test', build: 'pnpm build', packageManager: 'pnpm' };
  const p = ciPrompt(ci, { repoRoot: '/repo' });
  assert.match(p, /FULL CI gate/);
  assert.match(p, /pnpm lint/);
  assert.match(p, /pnpm test/);
  assert.match(p, /pnpm build/);
  assert.match(p, /unfiltered/);
  assert.doesNotMatch(p, /scope/i);

  const bare = ciPrompt({ packageManager: 'pnpm' }, { repoRoot: '/repo' });
  assert.match(bare, /no CI commands configured/);
});

test('smokePrompt: typecheck + build only, lint and tests explicitly forbidden', () => {
  const ci = { typecheck: 'pnpm typecheck', lint: 'pnpm lint', test: 'pnpm test', build: 'pnpm build', packageManager: 'pnpm' };
  const p = smokePrompt(ci, { repoRoot: '/repo' });
  assert.match(p, /typecheck: pnpm typecheck/);
  assert.match(p, /build: pnpm build/);
  assert.match(p, /Do NOT run lint or the test suite/);
  assert.doesNotMatch(p, /pnpm lint/);
  assert.doesNotMatch(p, /pnpm test\b/);

  const buildOnly = smokePrompt({ build: 'pnpm build' }, { repoRoot: '/repo' });
  assert.match(buildOnly, /build: pnpm build/);
  assert.doesNotMatch(buildOnly, /typecheck:/);
});

test('acVerifyPrompt: lists each AC with its owners and task files, and the three verdict methods', () => {
  const tasks = [
    task({ id: 'T-004', taskFile: 'tasks/T-004.md', acIds: ['AC-7'] }),
    task({ id: 'T-005', taskFile: 'tasks/T-005.md', acIds: ['AC-7'] }),
  ];
  const p = acVerifyPrompt({
    closedAcs: ['AC-7'],
    owners: acOwners(tasks),
    taskById: new Map(tasks.map((t) => [t.id, t])),
    repoRoot: '/repo',
  });
  assert.match(p, /AC-7: T-004 \(tasks\/T-004\.md\), T-005 \(tasks\/T-005\.md\)/);
  assert.match(p, /covered-by-test/);
  assert.match(p, /verified-by-inspection/);
  assert.match(p, /unverified/);
  assert.match(p, /never the whole suite/);
  assert.match(p, /never edit, never commit/);
});

test('featureRepairPrompt: attribution map first, surgical fixups, AC repairs, contract-export protection', () => {
  const p = featureRepairPrompt('ac:AC-7: missing test — fixup onto T-004', {
    repoRoot: '/repo', featureBranch: 'feat/x', baseBranch: 'main', taskIds: ['T-004', 'T-005'],
  });
  assert.match(p, /trailers:key=Task/);
  assert.match(p, /--fixup/);
  assert.match(p, /One fixup per culprit commit/);
  assert.match(p, /Do NOT rebase or autosquash/);
  assert.match(p, /location `ac:<id>`/);
  assert.match(p, /NEVER delete an exported-but-unused symbol/);
  assert.match(p, /Tasks in this run: T-004, T-005/);
});

test('featureRepairPrompt: integration-fix contract — cross-cutting commits, per-owner split, test protection', () => {
  const p = featureRepairPrompt('typecheck: TS2769 in 6 downstream files after T-001 schema change', {
    repoRoot: '/repo', featureBranch: 'feat/x', baseBranch: 'main', taskIds: ['T-001'],
  });
  assert.match(p, /fix\(integration\):/);
  assert.match(p, /Integration-Fix: true/);
  assert.match(p, /never autosquashed/);
  assert.match(p, /SPLIT the fix per owning task/);
  assert.match(p, /NEVER delete or weaken a test/);
});

test('result schemas: the shapes the run path depends on', () => {
  assert.deepEqual(TASK_RESULT_SCHEMA.required, ['id', 'status', 'changedFiles', 'headSha', 'gate']);
  assert.deepEqual(TASK_RESULT_SCHEMA.properties.status.enum, ['passed', 'failed', 'escalated']);
  assert.deepEqual(TASK_RESULT_SCHEMA.properties.gate.required, ['ac', 'lint']);
  assert.deepEqual(TASK_RESULT_SCHEMA.properties.escalation.required, ['question', 'context']);

  assert.deepEqual(CI_RESULT_SCHEMA.required, ['status', 'commands', 'failures']);
  assert.deepEqual(CI_RESULT_SCHEMA.properties.commands.items.required, ['cmd', 'exitCode']);

  assert.deepEqual(AC_RESULT_SCHEMA.required, ['status', 'acs']);
  assert.deepEqual(AC_RESULT_SCHEMA.properties.acs.items.required, ['id', 'verdict', 'detail']);
  assert.deepEqual(
    AC_RESULT_SCHEMA.properties.acs.items.properties.verdict.enum,
    ['covered-by-test', 'verified-by-inspection', 'unverified'],
  );

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
