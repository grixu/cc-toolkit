import * as h from '../helpers.mjs';

// Shape only: findings against the real write-spec output are ALLOWED here — a finding is
// signal about write-spec, read from the exported results JSON, not a reason to fail.
export default (output) => {
  const c = h.checker();

  c.check(h.checksTableComplete(output), 'Checks table is missing rows (needs all 12)');
  c.check(/## Verdict/i.test(output), 'no ## Verdict section');

  const spec = h.readSandboxFile('e2e-chain', 'spec/out.md');
  if (c.check(spec !== null, 'spec/out.md is gone from the e2e sandbox')) {
    const dated = (spec.match(/^#{2,6}\s.*20\d\d.*$/gm) || []);
    c.check(dated.length > 0, 'no dated evidence sub-heading was appended to spec/out.md');
  }

  return c.verdict();
};
