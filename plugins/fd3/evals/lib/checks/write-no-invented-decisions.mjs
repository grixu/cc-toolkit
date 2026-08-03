import * as h from '../helpers.mjs';

export default () => {
  const c = h.checker();
  const spec = h.readSandboxFile('write-no-invented-decisions', 'spec/out.md');

  if (c.check(spec !== null, 'spec/out.md was not created')) {
    // The fixture summary names no environments, so any such ordering claim is invented.
    c.check(!/staging/i.test(spec), 'invented environment: "staging" appears in the spec');
    c.check(!/canary/i.test(spec), 'invented environment: "canary" appears in the spec');
    c.check(!/pre-?prod/i.test(spec), 'invented environment: "preprod" appears in the spec');
  }

  return c.verdict();
};
