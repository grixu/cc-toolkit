import * as h from '../helpers.mjs';

const SCENARIO = 'validate-deploy-path';
const FIXTURE = 'deploy-path-payments-spec';
const SPEC = 'spec/phased-spec.md';

// The fixture workflow's triggers, its test job and the stage job's `main` condition: any of them
// shows that a merge to main never reaches test.
const CONDITION_LINES = [3, 19];

export function verdictFailures(output) {
  const verdict = h.section(output, 'Verdict') || '';
  const firstLine = (verdict.split('\n').find((l) => l.trim()) || '').trim();
  const headline = /^\**\s*(not ready|ready)\b/i.exec(firstLine);
  const phase1 = /^\|\s*1\b[^|]*\|\s*([^|]*)\|/im.exec(verdict);
  const notReady = headline !== null && /^not ready$/i.test(headline[1]);
  const phase1Held = phase1 !== null && !/^\**\s*yes\b/i.test(phase1[1].trim());
  return notReady || phase1Held ? [] : ['the verdict passes phase 1 although a merge to main never deploys to test'];
}

// Citations of the workflow with a line, in the report or anything the pass wrote: `payments-cd.yaml:11`,
// `:10-13`, `#L11`, `line 11`.
export function workflowCitations(text) {
  return [...String(text || '').matchAll(/payments-cd\.ya?ml`?(?::|#|,?\s+lines?\s+)L?(\d+)(?:\s*[-–]\s*L?(\d+))?/gi)].map((m) => [
    Number(m[1]),
    Number(m[2] || m[1]),
  ]);
}

// validate-spec's evidence rows quote their source rather than require a line, so a line that names
// the workflow and quotes the test job's own condition cites it as well as a line number does.
const QUOTED_CONDITION = /release\/test|refs\/heads\/main/;

export const citesCondition = (text) =>
  workflowCitations(text).some(([from, to]) => to >= CONDITION_LINES[0] && from <= CONDITION_LINES[1]) ||
  String(text || '')
    .split('\n')
    .some((line) => /payments-cd\.ya?ml/.test(line) && QUOTED_CONDITION.test(line));

export default (output) => {
  const c = h.checker();
  for (const failure of verdictFailures(output)) c.check(false, failure);

  const diff = h.diffSandbox(SCENARIO, FIXTURE);
  const written = [h.readSandboxFile(SCENARIO, SPEC) || '', ...diff.added.map((f) => h.readSandboxFile(SCENARIO, f) || '')].join('\n');
  c.check(
    citesCondition(output) || citesCondition(written),
    `no finding cites .github/workflows/payments-cd.yaml at a line of its deploy conditions (${CONDITION_LINES.join('-')})`,
  );

  c.check(diff.modified.every((f) => f === SPEC), `modified outside the spec: ${diff.modified.filter((f) => f !== SPEC).join(', ')}`);
  c.check(diff.removed.length === 0, `fixture files removed: ${diff.removed.join(', ')}`);
  c.check(diff.added.every((f) => f.startsWith('spec/')), `files created outside spec/: ${diff.added.filter((f) => !f.startsWith('spec/')).join(', ')}`);
  return c.verdict();
};
