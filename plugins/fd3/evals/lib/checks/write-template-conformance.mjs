import * as h from '../helpers.mjs';
import { checkSpecShape } from './spec-shape.mjs';
import { sessionFolderFailures } from './session-folder.mjs';

export const statesUnsettled = (output) =>
  /gap|unconfirmed|not.*settled|unsettled|still open|unverified|not verified|aren['’]t verified/i.test(String(output || ''));

export default (output) => {
  const c = h.checker();
  const spec = h.readSandboxFile('write-template-conformance', 'spec/out.md');

  if (c.check(spec !== null, 'spec/out.md was not created')) {
    checkSpecShape(c, spec);
    c.check(/platform team/i.test(spec), 'declared gap 1 (provider ceiling — owner: platform team) did not survive into the spec');
    c.check(/OPS-77/.test(spec), 'declared gap 2 (dispatch_log retention — ticket OPS-77) did not survive into the spec');
  }

  for (const failure of sessionFolderFailures(h.sandboxDir('write-template-conformance'), 'spec/out.md')) c.check(false, failure);

  c.check(/out\.md/.test(output), 'the closing message does not name the path');
  c.check(statesUnsettled(output), 'the closing message does not state what is not yet settled');

  return c.verdict();
};
