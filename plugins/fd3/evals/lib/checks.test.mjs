// Model-free tests for the eval checks, fed real run artifacts (anonymised under __fixtures__/) that
// a check once judged wrongly, and texts it must keep failing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as h from './helpers.mjs';
import * as s from './checks/split-shared.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const tasksOf = (name) => h.readTasksDir(path.join(FIXTURES, name));
const failures = (fn) => {
  const c = h.checker();
  fn(c);
  const v = c.verdict();
  return v.pass ? [] : v.reason.split('; ');
};
const bySlug = (tasks, slug) => tasks.find((t) => t.slug === slug);
const setMergeAfter = (tasks, values) => {
  for (const t of tasks) t.fm['merge-after'] = values[t.slug] || [];
  return tasks;
};
const A = '/sandbox/split/repo-a';
const B = '/sandbox/split/repo-b';

// 8b38fd14 held its phase-2 switch behind phase 1 only in report prose: base main, no edge.
test('split hold: a phase-2 branch held only in prose fails', () => {
  const f = failures((c) => s.checkBoundaries(c, tasksOf('split-protected-path-8b38fd14'), { precedesDb: 'CI-1' }));
  assert.ok(f.some((x) => /0006-checkout-settlement-switch\.md: phase-2 branch .* by no stack, edge or merge-after/.test(x)), f.join('\n'));
});

test('split hold: the same split passes once merge-after carries the holds', () => {
  const tasks = setMergeAfter(tasksOf('split-protected-path-8b38fd14'), {
    'checkout-settlement-switch': ['feat/checkout-settlement-write', `${B}:feat/payment-status-panel`],
    'payment-status-live': [`${A}:feat/checkout-settlement-write`],
  });
  assert.deepEqual(failures((c) => s.checkBoundaries(c, tasks, { precedesDb: 'CI-1' })), []);
});

test('split hold: a hold transitive through a chain counts, a same-repository-only hold does not', () => {
  const tasks = setMergeAfter(tasksOf('split-protected-path-8b38fd14'), {
    'checkout-settlement-switch': ['feat/checkout-settlement-write'],
    'payment-status-live': [`${A}:feat/checkout-settlement-write`],
  });
  const f = failures((c) => s.checkBoundaries(c, tasks, { precedesDb: 'CI-1' }));
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(f[0], /checkout-settlement-switch .* held behind feat\/payment-status-panel by no/);
});

test('split hold: merge-after naming an unbuilt branch, two values on a branch, and a loop fail', () => {
  const unbuilt = setMergeAfter(tasksOf('split-protected-path-8b38fd14'), { 'payment-status-panel': ['feat/nowhere'] });
  assert.ok(failures((c) => s.checkMergeAfter(c, unbuilt)).some((x) => /"feat\/nowhere" names a branch no task builds/.test(x)));
  const loop = setMergeAfter(tasksOf('split-protected-path-8b38fd14'), { 'ci-migration-step': ['feat/checkout-settlement-write'] });
  assert.ok(failures((c) => s.checkMergeAfter(c, loop)).some((x) => /held behind itself/.test(x)));
  const split = tasksOf('split-protected-path-8b38fd14');
  const twin = { ...bySlug(split, 'payment-status-panel'), file: '0008-panel-docs.md', slug: 'panel-docs' };
  twin.fm = { ...twin.fm, 'merge-after': [`${A}:feat/ci-migration-step`] };
  assert.ok(failures((c) => s.checkMergeAfter(c, [...split, twin])).some((x) => /2 different merge-after values/.test(x)));
});

// f26743d6 predates the field: its flag branch stacks on repo-a's chain but nothing holds it behind
// repo-b's panel, and the live branch's edges miss checkout's write.
test('split hold: a split written without merge-after fails the field and the cross-repository holds', () => {
  const tasks = tasksOf('split-baseline-f26743d6');
  const structure = failures((c) => s.checkTaskStructure(c, tasks));
  assert.ok(structure.some((x) => /frontmatter is missing merge-after/.test(x)));
  const f = failures((c) => s.checkBoundaries(c, tasks));
  assert.ok(f.some((x) => /0005-checkout-settlement-flag\.md: .* held behind feat\/payment-status-panel by no/.test(x)), f.join('\n'));
  assert.ok(f.some((x) => /0006-payment-status-live-endpoint\.md: .* held behind feat\/checkout-settlement-write by no/.test(x)), f.join('\n'));
});

const note = (file) => h.section(h.readTasksDir(path.join(FIXTURES, 'notes')).find((t) => t.file === file).body, 'Note');

// 828326cf wrote "phase-2 *deploy*" and b5432f4b wrapped "platform\nteam" across a line: both Notes
// carry the facts the literal regexes missed.
test('declared-gap note: a hyphenated phase and a wrapped owner still count', async () => {
  const { checkGapNote } = await import('./checks/split-declared-gap.mjs');
  for (const file of ['split-declared-gap-828326cf.md', 'split-declared-gap-b5432f4b.md']) {
    assert.deepEqual(failures((c) => checkGapNote(c, file, note(file))), [], file);
  }
});

test('declared-gap note: a note without owner or placement fails', async () => {
  const { checkGapNote } = await import('./checks/split-declared-gap.mjs');
  const f = failures((c) => checkGapNote(c, 'x.md', 'No pull request exists for this task: the work is a measurement by hand.'));
  assert.equal(f.length, 2, f.join('\n'));
});

// 8b38fd14's CI-1 Note says the approval is "nothing to confirm before writing the code".
test('protected-path note: a negated confirmation is not an ask, an affirmed one is', async () => {
  const { checkNoPendingAsk } = await import('./checks/split-protected-path.mjs');
  assert.deepEqual(failures((c) => checkNoPendingAsk(c, tasksOf('split-protected-path-8b38fd14'))), []);
  const ask = (text) => failures((c) => checkNoPendingAsk(c, [{ file: 'x.md', body: `## Goal\n\n## Note\n\n${text}\n` }]));
  assert.equal(ask('Confirm with release-team\nbefore editing the workflow.').length, 1);
  assert.equal(ask('Do not start until you get approval from release-team before touching `.github/`.').length, 1);
  assert.equal(ask('There is no need to confirm before editing: the review is the approval.').length, 0);
});

test('normalizeProse joins wraps, hyphens and emphasis', () => {
  assert.equal(h.normalizeProse('the **platform**\n  team holds the phase-2 rate-limit'), 'the platform team holds the phase 2 rate limit');
});

const grill = (name) => fs.readFileSync(path.join(FIXTURES, 'grill', name), 'utf8');
const noTool = { providerResponse: { metadata: { toolCalls: [{ name: 'Bash' }] } } };

// 225b31aa posted round 1 in message 2 and ended on a lookup update; 4137a407 ended on one that
// re-listed numbered findings. Neither final message is the round.
test('latest round: a lookup update after the round is not the round', () => {
  assert.equal(h.lastRound(grill('lookup-update-225b31aa.md')), null);
  assert.equal(h.lastRound(grill('lookup-update-4137a407.md')), null);
  const f = h.latestRoundFailures(grill('lookup-update-225b31aa.md'), h.parseLedger(grill('ledger-225b31aa.md')), noTool);
  assert.match(f.join('\n'), /ledger's round 1 asks .* not the latest round/);
});

test('latest round: the round itself, or a reprint of it in full, is the latest round', () => {
  assert.deepEqual(h.latestRoundFailures(grill('round-225b31aa.md'), h.parseLedger(grill('ledger-225b31aa.md')), noTool), []);
  assert.deepEqual(h.latestRoundFailures(grill('reprint-9ff1f0b7.md'), h.parseLedger(grill('ledger-9ff1f0b7.md')), noTool), []);
});

test('latest round: a later ledger round or an answer nobody gave fails', () => {
  const ledger = h.parseLedger(grill('ledger-225b31aa.md'));
  const later = [...ledger, { label: '9', round: 2, answer: 'open' }];
  assert.match(h.latestRoundFailures(grill('round-225b31aa.md'), later, noTool).join('\n'), /round 2 asks 9/);
  const selfAnswered = ledger.map((r, i) => (i === 0 ? { ...r, answer: 'a) Keep 5' } : r));
  assert.match(h.latestRoundFailures(grill('round-225b31aa.md'), selfAnswered, noTool).join('\n'), /answers to 1 that no user gave/);
  const viaTool = { providerResponse: { metadata: { toolCalls: [{ name: 'AskUserQuestion' }] } } };
  assert.deepEqual(h.latestRoundFailures(grill('round-225b31aa.md'), selfAnswered, viaTool), []);
});

// 39b47064 and c547b433: both AskUserQuestion calls came back with this error, the run ended
// telling the user it could not reach them, and the check passed on verdict lines alone.
const abort = { name: 'AskUserQuestion', is_error: true, output: 'Tool permission request failed: AbortError: Stream closed' };
const answered = { name: 'AskUserQuestion', is_error: false, output: 'User has answered your questions.' };
const calls = (...toolCalls) => ({ providerResponse: { metadata: { toolCalls } } });

test('question tool: a run whose last AskUserQuestion aborted never reached the user', () => {
  assert.equal(h.questionToolFailed(calls({ name: 'Read' }, abort, { name: 'Bash' }, abort)), true);
  assert.equal(h.questionToolFailed(calls({ ...abort, is_error: false })), true);
});

test('question tool: an answered question, a retry that got through, or no question at all passes', () => {
  assert.equal(h.questionToolFailed(calls(answered)), false);
  assert.equal(h.questionToolFailed(calls(abort, answered)), false);
  assert.equal(h.questionToolFailed(calls({ name: 'Read' })), false);
  assert.equal(h.questionToolFailed(undefined), false);
});

test('notes search: hunting for the notes by name counts, reading or listing the given path does not', () => {
  const name = /grilling|summary/i;
  const hunt = (call) => h.searchesFor(calls(call), name).length;
  assert.equal(hunt({ name: 'Glob', input: { pattern: '**/grilling-summary*' } }), 1);
  assert.equal(hunt({ name: 'Bash', input: { command: 'find .. -name "grilling-summary.md"' } }), 1);
  assert.equal(hunt({ name: 'Grep', input: { pattern: 'grilling summary' } }), 1);
  assert.equal(hunt({ name: 'Read', input: { file_path: 'notes/grilling-summary.md' } }), 0);
  assert.equal(hunt({ name: 'Bash', input: { command: 'ls -la notes/grilling-summary.md' } }), 0);
  assert.equal(hunt({ name: 'Bash', input: { command: 'find . -type f' } }), 0);
});

const shape = (text) => h.roundShapeFailures(text);
const round = grill('round-225b31aa.md');

test('round shape: rounds closed by their labels, lettered options under each question, pass', () => {
  for (const name of ['round-225b31aa.md', 'round-e375166f.md', 'reprint-9ff1f0b7.md']) assert.deepEqual(shape(grill(name)), [], name);
});

// 155659a9 closed on "Please answer:" and lettered its sub-questions 3a/3b/3c, the same letters
// its options carry.
test('round shape: a round with no "Answer as:" line, or with lettered sub-questions, fails', () => {
  const text = grill('round-155659a9.md');
  assert.match(shape(text).join('\n'), /no round with an "Answer as:" line/);
  assert.match(shape(text.replace('Please answer:', 'Answer as:')).join('\n'), /sub-questions 3a, 3b, 3c carry letters/);
});

test('round shape: an option without its letter, a label nobody asks, a hole and a trailing question fail', () => {
  assert.match(shape(round.replace('- **b) Drop to 3**', '- **Drop to 3**')).join('\n'), /question 1 has a named option without its letter/);
  assert.match(shape(round.replace('Answer as: 1, 2,', 'Answer as: 1, 2, 2.5,')).join('\n'), /names 2\.5 but no numbered question/);
  const hole = round.replace(/\*\*4\. Should there be[\s\S]*?\n\n\*\*5\./, '**5.').replace(' 4, 5,', ' 5,');
  assert.match(shape(hole).join('\n'), /skips question 4 without naming it/);
  assert.deepEqual(shape(`Open from earlier rounds: none. Blocked by the lookup: 4 (timeouts).\n\n${hole}`), []);
  assert.match(shape(`${round}\nShall I also look at the logs?`).join('\n'), /goes on past the round/);
});

const verifiedRound = `Two findings before the questions:

- The comment at \`infra/results.tf:13\` says reads only look back 30 days. The code says otherwise:
  \`getAuditResult\` (\`src/store.ts:14-26\`) reads by id within a day of the link's creation time, at any age.

**1. What should happen to audit results as they age?**
- **a) Remove the partition expiry** — results stay readable through every old link. **Recommended**: the only read is by id, so storage is the whole cost.
- **b) Raise the expiry to 400 days** — links older than that still break.

**2. Should the monthly summary re-run audits?**
- **a) No** — **Recommended**: a re-run does not fix links already sent.
- **b) Yes** — every summary links to a fresh result.

Answer as: 1, 2`;

test('verified claims: a round that checks the comment against the read path passes', async () => {
  const { claimFailures } = await import('./checks/grill-verified-claims.mjs');
  assert.deepEqual(claimFailures(verifiedRound), []);
});

test('verified claims: the comment repeated as fact, a missing no-expiry option, or a stray citation fails', async () => {
  const { claimFailures } = await import('./checks/grill-verified-claims.mjs');
  const finding = /- The comment[\s\S]*?any age\.\n/;
  const asFact = verifiedRound.replace(finding, '- Reads only look back 30 days, so a 31-day expiry should never bite.\n');
  assert.match(claimFailures(asFact).join('\n'), /asserts a 30-day read window/);
  const wrapped = verifiedRound.replace(finding, '- Since queries use a 30-day\n  window, older results are never read.\n');
  assert.match(claimFailures(wrapped).join('\n'), /asserts a 30-day read window/);
  const negated = verifiedRound.replace(finding, '- There is no 30-day window in the reads.\n');
  assert.deepEqual(claimFailures(negated), []);
  const noDrop = verifiedRound.replace('Remove the partition expiry', 'Raise the expiry to 90 days');
  assert.match(claimFailures(noDrop).join('\n'), /no option or finding drops the partition expiry/);
  assert.match(claimFailures(verifiedRound.replace('src/store.ts:14-26', 'src/store.ts:3')).join('\n'), /store\.ts:3 does not point at the read query/);
  assert.match(claimFailures('Looking into the retention now.').join('\n'), /asks no numbered question/);
});

const closingSpec = `## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **A separate listener process** | Q1 b. |
| D6 | **The listener binds port 8081** | assistant-taken — followed from Q1 b; 8080 is the API server's. |
| D7 | **Bodies over 256 KB are rejected with 413** | assistant-taken — followed from Q4 a. |

## 4. Target architecture

**Declared gap:** the carrier's redelivery schedule is undocumented — owner: carrier integrations team, placement: ticket TRK-41.
`;

const closingReport = `Spec written to spec/out.md, 180 lines.

## Questions

1. **D6 — the listener binds port 8081.** Keep it? a) yes (recommended: 8080 is taken), b) another port.
2. **D7 — bodies over 256 KB get 413.** Keep the limit? a) yes (recommended), b) another size.
3. **Write ADR-0002 for the bullmq queue?** docs/CLAUDE.md asks for one per mechanism choice. a) yes (recommended), b) no.
4. **Consent to create infra/secrets.tf**, a protected path? a) yes (recommended), b) no — the secret is created by hand.`;

test('closing batch: one question per open choice and per assistant-taken row passes', async () => {
  const { batchFailures, parkedChoices } = await import('./checks/write-closing-batch.mjs');
  assert.deepEqual(batchFailures(closingReport, closingSpec), []);
  assert.deepEqual(parkedChoices(closingSpec), []);
});

test('closing batch: a parked choice, a missing question, two rows in one question or a ratify-all fails', async () => {
  const { batchFailures, parkedChoices } = await import('./checks/write-closing-batch.mjs');
  const parked = `${closingSpec}\n### Declared gaps\n\n- G2: whether the bullmq choice gets an ADR — the team decides at task split.\n- Consent to edit the protected infra/ — owner: the user, placement: before phase 1.\n`;
  assert.equal(parkedChoices(parked).length, 2);
  assert.match(batchFailures(closingReport.replace(/\n4\. .*$/, ''), closingSpec).join('\n'), /consent to create the protected infra\/secrets\.tf/);
  const bundled = closingReport.replace(/1\. .*\n2\. .*\n/, '1. **D6 and D7** — port 8081 and a 256 KB limit. a) keep both (recommended), b) change.\n');
  assert.match(batchFailures(bundled, closingSpec).join('\n'), /question 1 puts D6, D7 to the user together/);
  const ratifyAll = closingReport.replace(/1\. .*\n2\. .*\n/, '1. Ratify all assistant-taken rows D6–D7 (port and size limit)? a) yes (recommended).\n');
  assert.match(batchFailures(ratifyAll, closingSpec).join('\n'), /ratifies several rows in one question/);
  assert.match(batchFailures('Spec written. Nothing to ask.', closingSpec).join('\n'), /no numbered question batch/);
});

const specSide = (name) => fs.readFileSync(path.join(FIXTURES, 'spec-side', name), 'utf8');

// 3e61f1cd asked the port as `WEBHOOK_PORT`, and its D10 question cites D8 inside the quoted row.
test('closing batch: a port named as an env var and a row cited inside another row\'s text pass', async () => {
  const { batchFailures, parkedChoices } = await import('./checks/write-closing-batch.mjs');
  const report = specSide('closing-batch-report-3e61f1cd.md');
  const spec = specSide('closing-batch-spec-3e61f1cd.md');
  assert.deepEqual(batchFailures(report, spec), []);
  assert.deepEqual(parkedChoices(spec), []);
  const noPort = report.replace(/\n6\. \*\*D9:\*\*.*/, '');
  assert.match(batchFailures(noPort, spec).join('\n'), /listener port/);
  const bundled = report.replace('7. **D10:**', '7. **D8 and D10:**');
  assert.match(batchFailures(bundled, spec).join('\n'), /question 7 puts D8, D10 to the user together/);
  assert.equal(/(?:\b|_)port\b/i.test('the report and its transport support'), false);
});

// 4df08999, 06b19235 and daaf1134 settled port and size in D rows, then mentioned them in gaps on the
// carrier contract and the deployment, in the D rows themselves and in a fenced handler sketch.
test('closing batch: a gap mentioning a topic a D row settles parks nothing; an unsettled one still fails', async () => {
  const { parkedChoices } = await import('./checks/write-closing-batch.mjs');
  for (const id of ['4df08999', '06b19235', 'daaf1134']) assert.deepEqual(parkedChoices(specSide(`closing-batch-spec-${id}.md`)), [], id);
  const gaps = '\n### Declared gaps\n\n| ID | Gap | Owner |\n|---|---|---|\n| G1 | The listener port is not given in the notes. | the user |\n';
  assert.equal(parkedChoices(gaps).length, 1);
  const portOnly = '| D9 | **Listener on `WEBHOOK_PORT`, default 8081** | assistant-taken |\n\n### Declared gaps\n\n| G1 | Maximum body size not decided. | the user |\n';
  assert.equal(parkedChoices(portOnly).length, 1);
  const sizeWithoutValue = '| D4 | **Oversized bodies get 413** | Q4 a. |\n\n### Declared gaps\n\n| G1 | The body size limit is not decided. | the user |\n';
  assert.equal(parkedChoices(sizeWithoutValue).length, 1);
});

const deployVerdict = (headline, phase1) => `## Verdict
${headline} — the deploy path phase 1 relies on does not exist.

| Phase | Ready | What holds it |
|---|---|---|
| 1 — four work items, cap 1 | ${phase1} | a merge to main never deploys to test |
| 2 | no | the platform team's ceiling confirmation |

## Checks
`;

test('deploy path: phase 1 held, or the document not ready, passes; phase 1 yes on a ready spec fails', async () => {
  const { verdictFailures } = await import('./checks/validate-deploy-path.mjs');
  assert.deepEqual(verdictFailures(deployVerdict('**not ready**', 'yes')), []);
  assert.deepEqual(verdictFailures(deployVerdict('ready', 'no — blocked')), []);
  assert.match(verdictFailures(deployVerdict('ready', 'yes')).join('\n'), /passes phase 1/);
});

test('deploy path: a workflow citation counts only inside the deploy-condition lines', async () => {
  const { citesCondition } = await import('./checks/validate-deploy-path.mjs');
  assert.equal(citesCondition('`.github/workflows/payments-cd.yaml:11` runs deploy-test only on release/test'), true);
  assert.equal(citesCondition('see payments-cd.yaml:10-13 and :19'), true);
  assert.equal(citesCondition('payments-cd.yaml lines 18-21: main deploys stage'), true);
  assert.equal(citesCondition('payments-cd.yaml#L11'), true);
  assert.equal(citesCondition('payments-cd.yaml:28 sends main to prod'), false);
  assert.equal(citesCondition('the deploy workflow (`.github/workflows/payments-cd.yaml`)'), false);
});

// 0e908afc's evidence row names the workflow and quotes the test job's branch, with no line number.
test('deploy path: a row naming the workflow and quoting its test-job condition cites it', async () => {
  const { citesCondition, verdictFailures } = await import('./checks/validate-deploy-path.mjs');
  assert.equal(citesCondition(specSide('deploy-path-evidence-0e908afc.md')), true);
  assert.deepEqual(verdictFailures(specSide('deploy-path-report-0e908afc.md')), []);
  assert.equal(citesCondition('`deploy-test` runs only on a push to `release/test`'), false);
  assert.equal(citesCondition('`.github/workflows/payments-cd.yaml` deploys on a merge to `main`'), false);
});

test('post-verdict change: only the main thread editing the spec counts', async () => {
  const { mainThreadSpecEdits } = await import('./checks/build-spec-post-verdict-change.mjs');
  const edit = { name: 'Edit', input: { file_path: '/sandbox/spec/rollout-spec.md', old_string: 'a', new_string: 'b' } };
  assert.equal(mainThreadSpecEdits(calls(edit)).length, 1);
  assert.equal(mainThreadSpecEdits(calls({ ...edit, parentToolUseId: 'toolu_write_spec' })).length, 0);
  assert.equal(mainThreadSpecEdits(calls({ name: 'Edit', input: { file_path: 'spec/rollout-spec.session/notes.md' } })).length, 0);
  assert.equal(mainThreadSpecEdits(calls({ name: 'Bash', input: { command: "sed -i '' 's/502/200/' spec/rollout-spec.md" } })).length, 1);
  assert.equal(mainThreadSpecEdits(calls({ name: 'Bash', input: { command: 'wc -l spec/rollout-spec.md; grep -n Verdict spec/rollout-spec.md' } })).length, 0);
  assert.equal(mainThreadSpecEdits(calls({ name: 'Bash', input: { command: 'cat >> spec/rollout-spec.session/notes.md <<EOF' } })).length, 0);
});

// 2a8b8230: passes 1 and 2 edited the body, so the loop ran a third that edited nothing.
test('post-verdict change: a loop of passes passes; no pass, five, or an edit after the verdict fails', async () => {
  const { passFailures } = await import('./checks/build-spec-post-verdict-change.mjs');
  const before = fs.readFileSync(path.join(FIXTURES, '..', '..', 'fixtures', 'ratified-rollout-spec', 'spec', 'rollout-spec.md'), 'utf8');
  const after = specSide('post-verdict-spec-2a8b8230.md');
  assert.deepEqual(passFailures(before, after), [true, '']);
  assert.match(passFailures(before, before)[1], /no pass read the change/);
  const block = after.slice(after.indexOf('### Validation pass — 2026-10-25 (post-verdict re-entry, pass 3)'));
  const five = `${after}\n${block.replaceAll('pass 3', 'pass 4')}\n${block.replaceAll('pass 3', 'pass 5')}`;
  assert.match(passFailures(before, five)[1], /5 dated validation blocks/);
  assert.match(passFailures(before, after.replace('## 9. Cleanup', '## 9. Cleanup\n\nTyped in after the verdict.\n'))[1], /an edit after it went unread/);
});

test('post-verdict change: the notes must gain a line recording D2 option b', async () => {
  const { ratifiedLine } = await import('./checks/build-spec-post-verdict-change.mjs');
  const before = '1. Q2 a — synchronous (D2).\n   - b) synchronous, but a failed write is logged';
  assert.equal(ratifiedLine(before, `${before}\n5. Re-entry 2026-10-25 — D2 reversed: Q2 b, ratified by the user.`), true);
  assert.equal(ratifiedLine(before, before), false);
  assert.equal(ratifiedLine(before, `${before}\n5. A change to D3.`), false);
});

// write-spec's end state, as layouts the session-folder guard must pass or fail.
// 80cc3e39 and 523f576c kept the ledger and the prior-conversation record in the scratchpad through
// `cat > $S/...` heredocs; 59cc9948 put the same scratch directory inside the repository.
test('grill session files: scratchpad files written through the shell pass; a scratch dir inside the repo fails', async () => {
  const { sessionFileFailures } = await import('./checks/grill-session-files.mjs');
  const calls = (id) => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'grill', `session-calls-${id}.json`), 'utf8'));
  const repo = '/sandbox/grill-session-files';
  assert.deepEqual(sessionFileFailures(calls('80cc3e39'), repo), []);
  assert.deepEqual(sessionFileFailures(calls('523f576c'), repo), []);
  const inRepo = sessionFileFailures(calls('59cc9948'), repo).join('\n');
  assert.match(inRepo, /question-ledger\.md was written only inside the repository/);
  assert.match(inRepo, /session files written inside the repository: \.fd3-scratch\//);
  const noLedger = calls('523f576c').filter((t) => !/question-ledger/.test(t.input.command || ''));
  assert.match(sessionFileFailures(noLedger, repo).join('\n'), /no notes\/question-ledger\.md was written/);
  const noPrior = calls('523f576c').filter((t) => !/prior-conversation/.test(t.input.command || '') && !/prior-conversation/.test(t.input.file_path || ''));
  assert.deepEqual(sessionFileFailures(noPrior, repo), []);
  const priorInRepo = [...noPrior, { name: 'Write', input: { file_path: `${repo}/research/prior-conversation.md`, content: '-' } }];
  assert.match(sessionFileFailures(priorInRepo, repo).join('\n'), /prior-conversation\.md was written only inside the repository/);
  const quoted = [{ name: 'Bash', input: { command: 'S=/tmp/x; echo "$S -> notes" > /dev/null' } }];
  assert.deepEqual(sessionFileFailures(quoted, repo).filter((f) => /inside the repository/.test(f)), []);
});

// 49a531fb ran four passes and nested three `#### ... answers applied — <date>` blocks inside them.
test('build-spec re-entry: resume sub-blocks are not passes; a fifth dated pass heading is', async () => {
  const { appendedPasses } = await import('./checks/build-spec-reentry.mjs');
  const fixture = h.readFixtureFile('rollout-spec', 'spec/rollout-spec.md');
  const spec = specSide('reentry-spec-49a531fb.md');
  assert.equal(appendedPasses(fixture, spec), 4);
  assert.equal(appendedPasses(fixture, `${spec}\n### Validation pass 5 — 2026-10-25\n\nVerdict: ready\n`), 5);
});

// fdebc07f listed its gaps under "Still open:" and said two claims "aren't verified".
test('template conformance: a closing message that lists what is still open passes; one claiming nothing open fails', async () => {
  const { statesUnsettled } = await import('./checks/write-template-conformance.mjs');
  assert.equal(statesUnsettled(specSide('template-closing-fdebc07f.md')), true);
  assert.equal(statesUnsettled('Spec written to spec/out.md: all 12 sections, every decision ratified.'), false);
});

const sessionRepo = (files) => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fd3-session-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write('notes/grilling-summary.md', 'closing notes\n');
  const git = (...args) => execFileSync('git', ['-C', root, ...args]);
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@localhost', 'commit', '-q', '-m', 'fixture baseline', '--no-gpg-sign');
  fs.rmSync(path.join(root, 'notes'), { recursive: true });
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  return root;
};

test('session folder: the spec, its evidence and an ignored session folder pass', async () => {
  const { sessionFolderFailures } = await import('./checks/session-folder.mjs');
  const inFolder = sessionRepo({
    'spec/out.md': 'spec\n',
    'spec/evidence/rollout.md': 'evidence\n',
    'spec/out.session/.gitignore': '*\n',
    'spec/out.session/notes.md': 'notes\n',
    'spec/out.session/research/dispatch-path-lookup.md': 'report\n',
  });
  assert.deepEqual(sessionFolderFailures(inFolder, 'spec/out.md'), []);
});

test('session folder: a repository-level .gitignore created for it is one more file to commit', async () => {
  const { sessionFolderFailures } = await import('./checks/session-folder.mjs');
  const atRoot = sessionRepo({ '.gitignore': '*.session/\n', 'spec/out.md': 'spec\n', 'spec/out.session/notes.md': 'notes\n' });
  assert.deepEqual(sessionFolderFailures(atRoot, 'spec/out.md'), [
    'files git would offer to commit besides the spec and its evidence: .gitignore',
  ]);
});

test('session folder: notes beside the spec, an unignored folder or a force-added note fail', async () => {
  const { sessionFolderFailures } = await import('./checks/session-folder.mjs');
  const beside = sessionRepo({ 'spec/out.md': 'spec\n', 'spec/out.notes.md': 'notes\n', 'spec/out.research/r.md': 'report\n' });
  const f1 = sessionFolderFailures(beside, 'spec/out.md');
  assert.match(f1[0], /spec\/out\.notes\.md, spec\/out\.research\/r\.md/);
  assert.match(f1[1], /notes never moved/);
  const unignored = sessionRepo({ 'spec/out.md': 'spec\n', 'spec/out.session/notes.md': 'notes\n' });
  const f2 = sessionFolderFailures(unignored, 'spec/out.md');
  assert.match(f2[0], /spec\/out\.session\/notes\.md/);
  assert.match(f2[1], /does not ignore: spec\/out\.session\/notes\.md/);
  const forced = sessionRepo({ 'spec/out.md': 'spec\n', 'spec/out.session/.gitignore': '*\n', 'spec/out.session/notes.md': 'notes\n' });
  execFileSync('git', ['-C', forced, 'add', '-f', 'spec/out.session/notes.md']);
  assert.match(sessionFolderFailures(forced, 'spec/out.md').join('; '), /does not ignore: spec\/out\.session\/notes\.md/);
});
