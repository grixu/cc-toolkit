import * as h from '../helpers.mjs';

const SCENARIO = 'build-spec-reentry';
const SPEC = 'spec/rollout-spec.md';

const verdictLines = (text) => (text.match(/^Verdict: /gm) || []).length;

// A finished spec handed to build-spec is a re-validation, never a new grilling: the decisions in it
// are the user's, already made.
export default () => {
  const c = h.checker();
  const diff = h.diffSandbox(SCENARIO, 'rollout-spec');

  const ledger = diff.added.filter((f) => /question-ledger\.md$/.test(f));
  c.check(ledger.length === 0, `a grilling round started on a finished spec: ${ledger.join(', ')}`);

  const before = verdictLines(h.readFixtureFile('rollout-spec', SPEC));
  const spec = h.readSandboxFile(SCENARIO, SPEC);
  c.check(
    spec !== null && verdictLines(spec) > before,
    `no validation pass appended a verdict line (found ${spec ? verdictLines(spec) : 0}, the fixture holds ${before})`,
  );

  const newSpecs = diff.added.filter((f) => f.endsWith('.md') && !/(^|\/)(notes|research|evidence)\//.test(f));
  c.check(newSpecs.length === 0, `a second spec was written instead of re-validating the given one: ${newSpecs.join(', ')}`);

  const code = diff.modified.filter((f) => f !== SPEC);
  c.check(code.length === 0, `validation touched files other than the spec: ${code.join(', ')}`);

  return c.verdict();
};
