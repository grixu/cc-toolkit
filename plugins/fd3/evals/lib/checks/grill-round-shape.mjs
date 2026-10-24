import * as h from '../helpers.mjs';

// The final message must be the run's latest round: the ledger proves no later round went out and
// nothing was answered on the user's behalf.
export default (output, context) => {
  const c = h.checker();

  // Accept the round's numbering styles: "1.", "**1.", "### 1.", "Q1." / "**Q1."
  const numbered = output.match(/^\s{0,3}(?:#{1,4}\s+)?(?:\*\*)?Q?\d+[.)]\s/gm) || [];
  c.check(numbered.length >= 2, `fewer than 2 numbered questions (${numbered.length})`);
  c.check(/recommend/i.test(output), 'no marked recommendation among the options');
  c.check((output.match(/^\s*[-*]\s+\*\*/gm) || []).length >= 2, 'no named options under the questions');
  for (const failure of h.latestRoundFailures(output, h.readLedger('grill-round-shape'), context)) c.check(false, failure);

  return c.verdict();
};
