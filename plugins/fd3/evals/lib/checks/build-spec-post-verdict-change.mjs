import * as h from '../helpers.mjs';

const SCENARIO = 'build-spec-post-verdict-change';
const FIXTURE = 'ratified-rollout-spec';
const SPEC = 'spec/rollout-spec.md';
const NOTES = 'spec/rollout-spec.notes.md';
const OPTION_A_ERROR = 'a ledger write failure fails the charge with HTTP 502';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_WRITE = /\bsed\s+-i|\bperl\s+-[a-z]*i|>>?\s*\S*rollout-spec\.md\b|\btee\b[^|]*rollout-spec\.md|\bmv\b[^|;&]*rollout-spec\.md|\bcp\b[^|;&]*rollout-spec\.md/;

// Tool calls the main thread made on the spec itself; the forked write-spec and validate-spec runs
// carry a parent tool-use id.
export function mainThreadSpecEdits(context) {
  return (context?.providerResponse?.metadata?.toolCalls || [])
    .filter((call) => !call.parentToolUseId)
    .filter((call) => {
      const input = call.input ?? {};
      if (EDIT_TOOLS.has(call.name)) return /(^|\/)spec\/rollout-spec\.md$/.test(String(input.file_path ?? input.notebook_path ?? ''));
      if (call.name === 'Bash') return /rollout-spec\.md\b/.test(input.command ?? '') && SHELL_WRITE.test(input.command ?? '');
      return false;
    })
    .map((call) => `${call.name} ${JSON.stringify(call.input).slice(0, 160)}`);
}

// Lines the run added to the notes file: one of them records the reversed choice, naming the
// decision or its question and option b.
export function ratifiedLine(before, after) {
  const old = new Set(String(before || '').split('\n'));
  return String(after || '')
    .split('\n')
    .filter((l) => !old.has(l))
    .some((l) => /\bD2\b|\bQ2\b|question 2/i.test(l) && /\bb\)|\(b\)|\boption b\b|\bQ2 b\b|\blogged\b/i.test(l));
}

// Re-entry runs the whole stage-3 loop on the changed spec: a pass that edits the body earns the
// next, up to three, plus one post-verdict pass. What must hold is that a pass read the change and
// that nothing was edited after the last verdict, whose recorded line count would then be stale.
export function passFailures(fixture, spec) {
  const fixtureHeadings = new Set(h.headings(fixture));
  const passes = h.headings(spec).filter((x) => /20\d\d/.test(x) && /valid|pass/i.test(x) && !fixtureHeadings.has(x)).length;
  const last = [...spec.matchAll(/^Verdict: .*\bspec (\d+) lines at this verdict/gm)].pop();
  const lines = (spec.match(/\n/g) || []).length;
  if (passes < 1) return [false, 'no dated validation block appended: no pass read the change'];
  if (passes > 4) return [false, `${passes} dated validation blocks appended; the loop allows three passes and one post-verdict pass`];
  if (!last || Number(last[1]) !== lines) {
    return [false, `the last verdict records ${last ? last[1] : 'no'} lines but the spec holds ${lines}: an edit after it went unread`];
  }
  return [true, ''];
}

export default (output, context) => {
  const c = h.checker();
  c.check(!h.questionToolFailed(context), 'the run ended on an AskUserQuestion call that errored: its questions never reached the user');

  const edits = mainThreadSpecEdits(context);
  c.check(edits.length === 0, `the main thread edited the spec itself instead of routing the change through write-spec: ${edits.join('; ')}`);

  const diff = h.diffSandbox(SCENARIO, FIXTURE);
  c.check(
    ratifiedLine(h.readFixtureFile(FIXTURE, NOTES), h.readSandboxFile(SCENARIO, NOTES)),
    `${NOTES} gained no ratified-decision line for D2 option b`,
  );

  const spec = h.readSandboxFile(SCENARIO, SPEC);
  if (c.check(spec !== null, `${SPEC} is gone`)) {
    const fixture = h.readFixtureFile(FIXTURE, SPEC);
    c.check(!h.normalizeProse(spec).includes(h.normalizeProse(OPTION_A_ERROR)), 'the spec still fails the charge on a ledger write failure: option b was never applied');
    c.check(...passFailures(fixture, spec));
  }

  const ledger = diff.added.filter((f) => /question-ledger\.md$/.test(f));
  c.check(ledger.length === 0, `a grilling round started on a finished spec: ${ledger.join(', ')}`);
  const newSpecs = diff.added.filter((f) => f.endsWith('.md') && !/(^|\/)(notes|research|evidence)\//.test(f) && !/\.(notes|research)\b/.test(f));
  c.check(newSpecs.length === 0, `a second spec was written instead of changing the given one: ${newSpecs.join(', ')}`);
  const code = diff.modified.filter((f) => f !== SPEC && f !== NOTES);
  c.check(code.length === 0, `the run touched files other than the spec and its notes: ${code.join(', ')}`);
  return c.verdict();
};
