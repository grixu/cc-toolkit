import * as h from '../helpers.mjs';

export default (output) => {
  const c = h.checker();
  const spec = h.readSandboxFile('validate-defective-spec', 'spec/payments-spec.md');
  const fixture = h.readFixtureFile('defective-payments-spec', 'spec/payments-spec.md');

  c.check(h.checksTableComplete(output), 'Checks table is missing rows (needs all 12)');
  c.check(/## Checks/i.test(output), 'no "## Checks" section in the report');

  // The five planted defects, each anchored to its "section N"
  c.check(/D2[\s\S]{0,400}D5|D5[\s\S]{0,400}D2/.test(output), 'D2/D5 contradiction not surfaced');
  c.check(/redis/i.test(output) && /postgres/i.test(output), 'undecided Redis-or-Postgres either/or not surfaced');
  c.check(/invoice pdf/i.test(output), 'ownerless out-of-scope item (invoice PDF rendering) not surfaced');
  c.check(/retry[-\s]worker/i.test(output) && /element[-\s]code/i.test(output), 'uncoded "Delivery retry worker" element not surfaced');
  c.check(/section 3/i.test(output), 'no finding anchored to section 3');
  c.check(/section 10/i.test(output), 'no finding anchored to section 10');
  c.check(/section 4/i.test(output), 'no finding anchored to section 4');
  c.check(!/§/.test(output), 'report uses the § symbol (must write "section N")');

  // Stale citation corrected in the spec file itself
  if (c.check(spec !== null, 'spec/payments-spec.md missing from sandbox')) {
    // A dated evidence sub-heading appended for this run
    const fixtureHeadings = new Set(h.headings(fixture));
    const newHeadings = h.headings(spec).filter((x) => !fixtureHeadings.has(x));
    c.check(newHeadings.some((x) => /20\d\d/.test(x)), 'no dated evidence sub-heading appended to the spec');

    // Citation checks apply to the pre-existing body only: the appended evidence
    // narration legitimately quotes the old value ("cited charge.ts:42 — corrected to :27").
    const firstNewIdx = newHeadings.length ? spec.indexOf(newHeadings[0]) : -1;
    const body = firstNewIdx === -1 ? spec : spec.slice(0, firstNewIdx);
    c.check(!/charge\.ts:42\b/.test(body), 'stale citation charge.ts:42 still in the spec body (must be corrected, not just reported)');
    const cites = [...body.matchAll(/src\/billing\/charge\.ts:(\d+)/g)].map((m) => Number(m[1]));
    c.check(cites.length > 0 && cites.every((n) => n <= 30), 'a charge.ts citation in the spec body points past the end of the 30-line file');
  }

  // No file outside the spec file is modified; new files only under spec/
  const diff = h.diffSandbox('validate-defective-spec', 'defective-payments-spec');
  c.check(diff.modified.every((f) => f === 'spec/payments-spec.md'), `modified outside the spec: ${diff.modified.filter((f) => f !== 'spec/payments-spec.md').join(', ')}`);
  c.check(diff.removed.length === 0, `fixture files removed: ${diff.removed.join(', ')}`);
  c.check(diff.added.every((f) => f.startsWith('spec/')), `files created outside spec/: ${diff.added.filter((f) => !f.startsWith('spec/')).join(', ')}`);

  return c.verdict();
};
