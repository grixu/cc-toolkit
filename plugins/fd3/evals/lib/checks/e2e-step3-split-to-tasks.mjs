import * as h from '../helpers.mjs';
import * as s from './split-shared.mjs';
import { ELEMENT_CODE } from './spec-shape.mjs';

export default (output) => {
  const c = h.checker();
  const tasks = h.readTasks('e2e-chain');

  // The precondition must be satisfied by the validation rows step 2 wrote to disk —
  // task files existing at all proves no precondition stop happened.
  c.check(tasks.length >= 1, 'no task files — the split stopped (the on-disk validation evidence did not satisfy the precondition?)');
  s.checkTaskStructure(c, tasks);

  // Coverage against the REAL spec: every element code defined in out.md is in some task.
  const spec = h.readSandboxFile('e2e-chain', 'spec/out.md') || '';
  const specCodes = [...new Set(spec.match(new RegExp(ELEMENT_CODE.source, 'g')) || [])];
  const taskCodes = new Set(tasks.flatMap((t) => s.elementsOf(t)));
  c.check(specCodes.length > 0, 'no element codes found in spec/out.md to check coverage against');
  for (const code of specCodes) {
    c.check(taskCodes.has(code), `element ${code} from the spec is in no task's elements list`);
  }

  c.check(/coverage|every element|all element/i.test(output), 'closing report lacks a coverage statement');

  return c.verdict();
};
