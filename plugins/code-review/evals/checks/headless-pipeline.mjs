import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LENSES = ['comments', 'readability-tests', 'naming-module', 'objects-patterns', 'simplicity-types', 'security', 'performance', 'spec'];
const FINDING = /^- (high|medium|nit) · [\w-]+ · [\w-]+ · \S+:L\d+(?:-\d+)? · (safe|structural|report-only)\b.* — /m;

export default (output, context) => {
  const { checkout, context: dir } = context.vars;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const ctx = path.resolve(root, dir);
  const failures = [];
  const check = (ok, msg) => {
    if (!ok) failures.push(msg);
    return ok;
  };

  const asked = (context.providerResponse?.metadata?.toolCalls || []).filter((c) => c.name === 'AskUserQuestion');
  check(asked.length === 0, `a headless skill asked ${asked.length} question(s)`);

  const scopePath = path.join(ctx, 'scope.json');
  if (check(fs.existsSync(scopePath), 'cr-prepare wrote no scope.json')) {
    const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
    const active = scope.lenses.active.map((l) => l.lens);
    const named = [...active, ...scope.lenses.inactive.map((l) => l.lens)].sort();
    check(JSON.stringify(named) === JSON.stringify([...LENSES].sort()), `scope.json does not account for all eight lenses once: ${named.join(', ')}`);
    check(!active.includes('spec'), 'the spec lens is active with no spec named');
    check(scope.files.map((f) => f.path).sort().join() === 'src/quality-recall.ts,src/security-recall.ts', `judged files are not the committed change: ${scope.files.map((f) => f.path).join(', ')}`);
    for (const lens of active) {
      const p = path.join(ctx, `${lens}.md`);
      check(fs.existsSync(p) && /^Lens: /m.test(fs.readFileSync(p, 'utf8')), `cr-scan left no ${lens}.md with its Lens header`);
    }
  }

  const report = path.join(ctx, 'report.md');
  check(fs.existsSync(report) && /Reconciliation/.test(fs.readFileSync(report, 'utf8')), 'cr-merge wrote no report.md with a Reconciliation line');
  check(/status: merged/.test(output), 'cr-merge did not return status: merged');
  check(FINDING.test(output), 'no finding line in the fixed `severity · family · rule · path:L · class — fix` shape');
  check(/^- high · security · /m.test(output), 'the planted security finding did not come through the merge');

  const dirty = execFileSync('git', ['-C', path.resolve(root, checkout), 'status', '--porcelain'], { encoding: 'utf8' }).trim();
  check(dirty === '', `the review edited the checkout: ${dirty}`);

  return { pass: failures.length === 0, score: failures.length === 0 ? 1 : 0, reason: failures.join('; ') || 'all checks passed' };
};
