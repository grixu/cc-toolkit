import * as h from '../helpers.mjs';

// The final message is the run's latest round, closed by its `Answer as:` labels, with lettered
// options under every question; the ledger proves no later round went out and nothing was
// answered on the user's behalf.
export default (output, context) => {
  const c = h.checker();
  for (const failure of h.roundShapeFailures(output)) c.check(false, failure);
  for (const failure of h.ledgerFailures(output, h.readLedger('grill-round-shape', context), context)) c.check(false, failure);
  return c.verdict();
};
