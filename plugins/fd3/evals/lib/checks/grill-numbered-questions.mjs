import * as h from '../helpers.mjs';

export default (output, context) => {
  const c = h.checker();

  // Any numbered lines would do otherwise — a lookup update re-listing findings passed as a round.
  c.check(h.lastRound(output) !== null, 'the final message closes no round with an "Answer as:" line');
  for (const failure of h.ledgerFailures(output, h.readLedger('grill-numbered-questions', context), context)) c.check(false, failure);

  const lines = output.split('\n');
  const firstNumbered = lines.findIndex((l) => /^\s{0,3}(?:#{1,4}\s+)?(?:\*\*)?Q?\d+[.)]\s/.test(l));
  c.check(firstNumbered !== -1, 'no numbered questions at all');

  if (firstNumbered !== -1) {
    // Heuristic from the plan: every ? in the round body belongs to a numbered item —
    // so no question may appear before the first numbered item (a buried lead), and
    // sub-parts arrive as 4.1/4.2 rather than as un-numbered trailing questions.
    const preamble = lines.slice(0, firstNumbered).join('\n');
    c.check(!/\?/.test(preamble), 'a question appears before the first numbered item (buried, un-numbered question)');
  }

  return c.verdict();
};
