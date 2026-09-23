import * as h from '../helpers.mjs';

// The grilling half keeps two bookkeeping files, and both have a pinned home: the question
// ledger under notes/, the prior-conversation record under research/. Loose in the working
// tree they land in the user's repository and outlive the session.
export default (output, context) => {
  const c = h.checker();

  const numbered = /^\s{0,3}(?:#{1,4}\s+)?(?:\*\*)?Q?\d+[.)]\s/m.test(output);
  c.check(numbered || h.askedThroughTool(context), 'no round of questions — the grilling half never ran');

  const diff = h.diffSandbox('grill-session-files', 'retry-topic');

  // The session scratchpad sits wherever the skill puts it, so match the trailing directory.
  const ledger = diff.added.filter((f) => /question-ledger\.md$/.test(f));
  if (c.check(ledger.length > 0, 'no question ledger was kept')) {
    c.check(
      ledger.every((f) => /(^|\/)notes\/question-ledger\.md$/.test(f)),
      `the question ledger is not in a notes/ directory: ${ledger.join(', ')}`,
    );
  }

  // Placement only: the prompt is the bare command, so nothing was established before it and
  // writing no prior-conversation record is correct here.
  const prior = diff.added.filter((f) => /prior-conversation\.md$/.test(f));
  c.check(
    prior.every((f) => /(^|\/)research\/prior-conversation\.md$/.test(f)),
    `the prior-conversation record is not in a research/ directory: ${prior.join(', ')}`,
  );

  const stray = diff.added.filter((f) => !/(^|\/)(notes|research)\//.test(f));
  c.check(stray.length === 0, `session files written outside notes/ and research/: ${stray.join(', ')}`);
  c.check(diff.modified.length === 0, `fixture files modified: ${diff.modified.join(', ')}`);

  return c.verdict();
};
