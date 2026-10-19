import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default (output, context) => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const ctx = path.resolve(root, context.vars.context);
  const failures = [];
  const check = (ok, msg) => {
    if (!ok) failures.push(msg);
    return ok;
  };

  check(/status: empty/.test(output), 'cr-prepare did not return status: empty for an all-skipped change');
  check(!/status: ready/.test(output), 'cr-prepare returned status: ready with nothing judged');
  check(/files: 0 judged/.test(output), 'the closing block does not report 0 judged files');

  const scopePath = path.join(ctx, 'scope.json');
  if (check(fs.existsSync(scopePath), 'cr-prepare wrote no scope.json')) {
    const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
    check(scope.files.length === 0, `scope.json judges files: ${scope.files.map((f) => f.path).join(', ')}`);
    check(scope.skipped.length === 3, `scope.json skips ${scope.skipped.length} files, not the commit's 3`);
    check(scope.lenses.active.length === 0, `lenses active over nothing: ${scope.lenses.active.map((l) => l.lens).join(', ')}`);
  }

  return { pass: failures.length === 0, score: failures.length === 0 ? 1 : 0, reason: failures.join('; ') || 'all checks passed' };
};
