import * as h from '../helpers.mjs';

const SCENARIO = 'build-spec-reentry';
const SPEC = 'spec/rollout-spec.md';

const verdictLines = (text) => (text.match(/^Verdict: /gm) || []).length;

// A finished spec handed to build-spec is a re-validation, never a new grilling: the decisions in it
// are the user's, already made.
export default (output, context) => {
  const c = h.checker();
  c.check(!h.questionToolFailed(context), 'the run ended on an AskUserQuestion call that errored: its questions never reached the user');
  const diff = h.diffSandbox(SCENARIO, 'rollout-spec');

  const ledger = diff.added.filter((f) => /question-ledger\.md$/.test(f));
  c.check(ledger.length === 0, `a grilling round started on a finished spec: ${ledger.join(', ')}`);

  const before = verdictLines(h.readFixtureFile('rollout-spec', SPEC));
  const spec = h.readSandboxFile(SCENARIO, SPEC);
  c.check(
    spec !== null && verdictLines(spec) > before,
    `no validation pass appended a verdict line (found ${spec ? verdictLines(spec) : 0}, the fixture holds ${before})`,
  );

  // Three passes, plus at most one for edits after the verdict: a pass that counts its own
  // appended block as an edit re-invokes the next forever.
  if (spec !== null) {
    const fixtureHeadings = new Set(h.headings(h.readFixtureFile('rollout-spec', SPEC)));
    const passes = h.headings(spec).filter((x) => /20\d\d/.test(x) && !fixtureHeadings.has(x)).length;
    c.check(passes <= 4, `${passes} dated validation blocks appended; the loop allows three passes and one post-verdict pass`);
  }

  const beside = diff.added.filter((f) => /\.notes\.md$|\.research\//.test(f));
  c.check(beside.length === 0, `session files written beside the spec instead of into a session folder: ${beside.join(', ')}`);
  const newSpecs = diff.added.filter((f) => f.endsWith('.md') && !/(^|\/)(notes|research|evidence)\//.test(f) && !/\.session\//.test(f));
  c.check(newSpecs.length === 0, `a second spec was written instead of re-validating the given one: ${newSpecs.join(', ')}`);

  const code = diff.modified.filter((f) => f !== SPEC);
  c.check(code.length === 0, `validation touched files other than the spec: ${code.join(', ')}`);

  return c.verdict();
};
