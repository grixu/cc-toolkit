import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();

  c.check(h.checksTableComplete(output), 'Checks table is missing rows (needs all 12)');

  const deferred = h.section(output, 'Deferred') || '';
  c.check(/rate.?limit|ceiling/i.test(deferred), 'the declared gap is not under ## Deferred');
  c.check(/platform team/i.test(deferred), 'the Deferred entry does not name the owner (platform team)');
  c.check(/gate|phase 2/i.test(deferred), 'the Deferred entry does not name the placement (gate before phase 2)');

  const blocking = h.section(output, 'Blocking findings') || '';
  c.check(!/rate.?limit|ceiling/i.test(blocking), 'the declared gap shows up under Blocking findings');

  const closed = h.section(output, 'Closed during this run') || '';
  c.check(!/rate.?limit|ceiling/i.test(closed), 'the declared gap shows up as closed-by-answer instead of deferred');

  const diff = h.diffSandbox('validate-declared-gap', 'gap-payments-spec');
  c.check(diff.modified.every((f) => f === 'spec/gap-spec.md'), `modified outside the spec: ${diff.modified.filter((f) => f !== 'spec/gap-spec.md').join(', ')}`);
  c.check(diff.removed.length === 0, `fixture files removed: ${diff.removed.join(', ')}`);
  c.check(diff.added.every((f) => f.startsWith('spec/')), `files created outside spec/: ${diff.added.filter((f) => !f.startsWith('spec/')).join(', ')}`);

  return c.verdict();
};
