import * as h from '../helpers.mjs';

// Same gap as validate-declared-gap, with the owner and the placement stripped. Step 4 asks who
// owns it: an answer makes it deferred with both named, and no answer makes it blocked, which
// lowers the verdict. What must never happen is the third way — deferred on an owner nobody gave.
const CLAIM = /ceiling|rate[-\s]?limit|DELIVERY_RATE_LIMIT/i;

export default (output) => {
  const c = h.checker();

  c.check(h.checksTableComplete(output), 'Checks table is missing rows (needs all 12)');

  const verdict = h.section(output, 'Verdict') || '';
  const blocked = h.section(output, 'Blocked') || '';
  const deferred = h.section(output, 'Deferred') || '';

  c.check(CLAIM.test(blocked) || CLAIM.test(deferred), 'the unowned ceiling claim reaches neither ## Blocked nor ## Deferred');

  if (CLAIM.test(blocked)) {
    c.check(/\bnot ready\b/i.test(verdict), 'a blocked claim did not lower the verdict to "not ready"');
  } else {
    const entry = deferred.split('\n').find((l) => CLAIM.test(l)) || '';
    c.check(/owner:/i.test(entry), 'the ceiling claim was deferred without an owner — the spec names none, so an answer has to');
    c.check(/placement:/i.test(entry), 'the ceiling claim was deferred without a placement');
    c.check(!/nobody|unowned|unknown|tbd|n\/a/i.test(entry), `the deferred entry stands in for an owner instead of naming one: ${entry.trim()}`);
  }

  // The out-of-scope items do name owners and tickets; they are not what this spec leaves open.
  c.check(!/invoice pdf/i.test(blocked), 'an out-of-scope item that names an owner and a ticket was graded as blocked');

  const SPEC = 'spec/ownerless-gap-spec.md';
  const diff = h.diffSandbox('validate-ownerless-gap', 'ownerless-gap-payments-spec');
  c.check(
    diff.modified.every((f) => f === SPEC),
    `modified outside the spec: ${diff.modified.filter((f) => f !== SPEC).join(', ')}`,
  );
  c.check(diff.removed.length === 0, `fixture files removed: ${diff.removed.join(', ')}`);
  c.check(diff.added.every((f) => f.startsWith('spec/')), `files created outside spec/: ${diff.added.filter((f) => !f.startsWith('spec/')).join(', ')}`);

  return c.verdict();
};
