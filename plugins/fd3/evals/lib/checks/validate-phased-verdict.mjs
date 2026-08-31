import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  c.check(h.checksTableComplete(output), 'Checks table is missing rows (needs all 12)');

  const verdict = h.section(output, 'Verdict') || '';
  c.check(/\|\s*Phase\s*\|\s*Ready\s*\|/i.test(verdict), 'verdict is not the Phase|Ready|What holds it table (required for a phased spec)');
  // The Phase cell may label the phase ("1 — DB-1 lands…"); only the leading number is contract.
  c.check(/^\|\s*1\b[^|]*\|\s*yes\b/im.test(verdict), 'phase 1 row does not read yes');
  const phase2 = /^\|\s*2\b[^|]*\|.*$/im.exec(verdict);
  c.check(phase2 !== null, 'no phase 2 row in the verdict table');
  if (phase2) {
    c.check(/gate|ceiling|platform|confirm/i.test(phase2[0]), 'phase 2 row does not name the gate the deferred claim bounds');
  }
  c.check(!/\bnot ready\b/i.test(verdict), 'the document is called not ready because of a deferred claim');

  const deferred = h.section(output, 'Deferred') || '';
  c.check(/rate.?limit|ceiling/i.test(deferred) && /platform team/i.test(deferred), 'the deferred claim (with owner) is not under ## Deferred');

  const diff = h.diffSandbox('validate-phased-verdict', 'phased-payments-spec');
  c.check(diff.modified.every((f) => f === 'spec/phased-spec.md'), `modified outside the spec: ${diff.modified.filter((f) => f !== 'spec/phased-spec.md').join(', ')}`);
  c.check(diff.removed.length === 0, `fixture files removed: ${diff.removed.join(', ')}`);
  c.check(diff.added.every((f) => f.startsWith('spec/')), `files created outside spec/: ${diff.added.filter((f) => !f.startsWith('spec/')).join(', ')}`);

  return c.verdict();
};
