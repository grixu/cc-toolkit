import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIPPED = ['README.md', 'docs/notes.txt', 'package.json'];

export default (output, context) => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const ctx = path.resolve(root, context.vars.context);
  const failures = [];
  const check = (ok, msg) => {
    if (!ok) failures.push(msg);
    return ok;
  };

  check(/status: ready/.test(output), 'cr-prepare did not return status: ready for a docs-only change coherence reads');
  check(/files: 0 judged/.test(output), 'the closing block does not report 0 judged files');
  check(/^active: coherence\s*$/m.test(output), 'the closing block does not name coherence as the only active lens');

  const scopePath = path.join(ctx, 'scope.json');
  if (check(fs.existsSync(scopePath), 'cr-prepare wrote no scope.json')) {
    const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
    const active = scope.lenses.active;
    check(scope.files.length === 0, `scope.json judges files: ${scope.files.map((f) => f.path).join(', ')}`);
    check(scope.skipped.length === 3, `scope.json skips ${scope.skipped.length} files, not the commit's 3`);
    check(active.length === 1 && active[0].lens === 'coherence', `active lenses are not coherence alone: ${active.map((l) => l.lens).join(', ')}`);
    const files = (active.find((l) => l.lens === 'coherence')?.files ?? []).map((f) => (typeof f === 'string' ? f : f.path)).sort();
    check(JSON.stringify(files) === JSON.stringify(SKIPPED), `coherence does not read the three skipped files: ${files.join(', ')}`);
  }

  return { pass: failures.length === 0, score: failures.length === 0 ? 1 : 0, reason: failures.join('; ') || 'all checks passed' };
};
