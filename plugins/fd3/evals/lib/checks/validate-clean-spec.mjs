import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();
  const spec = h.readSandboxFile('validate-clean-spec', 'spec/clean-spec.md');
  const fixture = h.readFixtureFile('clean-payments-spec', 'spec/clean-spec.md');

  c.check(h.checksTableComplete(output), 'Checks table is missing rows (needs all 12)');
  c.check(h.checksTableAllPass(output), 'not every check row is a pass');

  const verdict = h.section(output, 'Verdict') || '';
  c.check(/\bready\b/i.test(verdict) || /\|\s*1\s*\|\s*yes/i.test(verdict), 'verdict is not ready');
  c.check(!/\bnot ready\b/i.test(verdict), 'verdict says not ready');

  const blocking = h.section(output, 'Blocking findings');
  c.check(blocking === null || !/^\s*[-*|]/m.test(blocking), 'a Blocking findings section with content is present');

  if (c.check(spec !== null, 'spec/clean-spec.md missing from sandbox')) {
    const fixtureTrimmed = fixture.replace(/\s+$/, '');
    c.check(spec.replace(/\s+$/, '').startsWith(fixtureTrimmed), 'spec edits are not append-only (fixture content is no longer a prefix)');
    const fixtureHeadings = new Set(h.headings(fixture));
    const newHeadings = h.headings(spec).filter((x) => !fixtureHeadings.has(x));
    c.check(newHeadings.some((x) => /20\d\d/.test(x)), 'no dated evidence sub-heading appended to the spec');
  }

  const diff = h.diffSandbox('validate-clean-spec', 'clean-payments-spec');
  c.check(diff.modified.every((f) => f === 'spec/clean-spec.md'), `modified outside the spec: ${diff.modified.filter((f) => f !== 'spec/clean-spec.md').join(', ')}`);
  c.check(diff.removed.length === 0, `fixture files removed: ${diff.removed.join(', ')}`);
  c.check(diff.added.every((f) => f.startsWith('spec/')), `files created outside spec/: ${diff.added.filter((f) => !f.startsWith('spec/')).join(', ')}`);

  return c.verdict();
};
