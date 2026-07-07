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
  + '\nexport { parseArgs, scheduleFromSerializeAfter, taskPrompt, TASK_RESULT_SCHEMA };\n';
const {
  parseArgs,
  scheduleFromSerializeAfter,
  taskPrompt,
  TASK_RESULT_SCHEMA,
} = await import(`data:text/javascript;base64,${Buffer.from(importable).toString('base64')}`);

const task = (over = {}) => ({ id: 'T-001', worktree: '/wt/T-001', branch: 'fd/x/T-001', taskFile: 'tasks/T-001.md', ...over });
const validArgs = (over = {}) => ({
  mode: 'implement',
  wave: 1,
  featureBranch: 'feat/x',
  tasks: [task()],
  gate: { acIds: ['AC-1'], lintChanged: true },
  ...over,
});

test('parseArgs: passes a valid object through and returns the contract fields', () => {
  const args = validArgs();
  const out = parseArgs(args);
  assert.equal(out.mode, 'implement');
  assert.equal(out.wave, 1);
  assert.equal(out.featureBranch, 'feat/x');
  assert.deepEqual(out.tasks, args.tasks);
  assert.deepEqual(out.gate, args.gate);
});

test('parseArgs: parses a JSON-string payload (Workflow live-launch quirk)', () => {
  const out = parseArgs(JSON.stringify(validArgs()));
  assert.equal(out.mode, 'implement');
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
  assert.throws(() => parseArgs(validArgs({ mode: 'go' })), /args\.mode/);
});

test('parseArgs: a missing featureBranch throws', () => {
  assert.throws(() => parseArgs(validArgs({ featureBranch: '' })), /featureBranch/);
});

test('parseArgs: an empty tasks array throws', () => {
  assert.throws(() => parseArgs(validArgs({ tasks: [] })), /non-empty array/);
});

test('parseArgs: a task missing a required field throws with its index', () => {
  assert.throws(() => parseArgs(validArgs({ tasks: [task({ worktree: '' })] })), /tasks\[0\]\.worktree/);
  assert.throws(() => parseArgs(validArgs({ tasks: [task(), { id: 'T-002' }] })), /tasks\[1\]\.worktree/);
});

test('parseArgs: a missing or malformed gate throws', () => {
  assert.throws(() => parseArgs(validArgs({ gate: undefined })), /args\.gate must be an object/);
  assert.throws(() => parseArgs(validArgs({ gate: { acIds: 'AC-1' } })), /gate\.acIds must be an array/);
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

test('taskPrompt: embeds the task file path, the stub rule, and the breadcrumb instruction', () => {
  const p = taskPrompt(task({ taskFile: 'tasks/T-042.md' }), { acIds: ['AC-1', 'AC-2'] }, 'implement');
  assert.match(p, /tasks\/T-042\.md/);
  assert.match(p, /Stub rule:/);
  assert.match(p, /--allow-empty/);
  assert.match(p, /Fd-Gate: pass/);
  assert.match(p, /AC-1, AC-2/);
});

test('taskPrompt: implement mode carries no diagnosis; repair mode includes it', () => {
  const impl = taskPrompt(task(), { acIds: [] }, 'implement');
  assert.doesNotMatch(impl, /Repair diagnosis/);

  const repair = taskPrompt(task({ diagnosis: 'AC-1 fails: null pointer in parse()' }), { acIds: ['AC-1'] }, 'repair');
  assert.match(repair, /Repair diagnosis/);
  assert.match(repair, /null pointer in parse\(\)/);
  assert.match(repair, /--fixup/);
});

test('TASK_RESULT_SCHEMA: shape the main thread depends on', () => {
  assert.deepEqual(TASK_RESULT_SCHEMA.required, ['id', 'status', 'changedFiles', 'headSha', 'gate']);
  assert.deepEqual(TASK_RESULT_SCHEMA.properties.status.enum, ['passed', 'failed']);
  assert.deepEqual(TASK_RESULT_SCHEMA.properties.gate.required, ['ac', 'lint']);
});
