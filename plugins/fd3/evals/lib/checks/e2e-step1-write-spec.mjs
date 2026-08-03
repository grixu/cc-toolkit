import * as h from '../helpers.mjs';
import { checkSpecShape } from './spec-shape.mjs';

export default (output) => {
  const c = h.checker();
  const spec = h.readSandboxFile('e2e-chain', 'spec/out.md');

  if (c.check(spec !== null, 'spec/out.md was not created')) {
    checkSpecShape(c, spec);
    c.check(/platform team/i.test(spec), 'declared gap 1 (owner: platform team) did not survive into the spec');
    c.check(/OPS-77/.test(spec), 'declared gap 2 (ticket OPS-77) did not survive into the spec');
  }
  c.check(/out\.md/.test(output), 'the closing message does not name the path');

  return c.verdict();
};
