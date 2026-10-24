import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strayHandoffFamilies } from './handoff-families.mjs';

const LENSES = ['comments', 'readability-tests', 'naming-module', 'objects-patterns', 'simplicity-types', 'correctness', 'security', 'performance', 'spec'];
const FINDING = /^- (high|medium|nit) · [\w-]+ · [\w-]+ · \S+:L\d+(?:-\d+)? · (safe|structural|report-only)\b.* — /m;
const RECONCILIATION = /^Reconciliation: (\d+) handoffs \+ (\d+) candidates → (\d+) merged · (\d+) own bullet · (\d+) boy-scout · (\d+) Not flagged; (\d+) primary dropped · (\d+) passed on\s*$/m;

// The one-line form separates entries with `;`, the long form gives each a bullet.
const notFlaggedEntries = (report) => {
  const m = report.match(/^\*\*Not flagged:\*\*(.*)$/m);
  if (!m) return 0;
  if (m[1].trim()) return m[1].split(';').filter((e) => e.trim()).length;
  const after = report.slice(m.index + m[0].length).split('\n').slice(1);
  let n = 0;
  for (const line of after) {
    if (/^- /.test(line)) n++;
    else if (line.trim() && !/^\s/.test(line)) break;
  }
  return n;
};

const reconciliationFailures = (report) => {
  const m = report.match(RECONCILIATION);
  if (!m) return ['the Reconciliation line does not have the template shape'];
  const [n, mc, a, b, c, d, p, l] = m.slice(1).map(Number);
  const out = [];
  if (a + b + c + d !== n + mc) out.push(`Reconciliation routes ${a + b + c + d} of ${n + mc} channel entries`);
  const entries = notFlaggedEntries(report);
  if (d + p + l !== entries) out.push(`Reconciliation counts ${d + p + l} Not flagged entries, the block holds ${entries}`);
  return out;
};

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
    check(JSON.stringify(named) === JSON.stringify([...LENSES].sort()), `scope.json does not account for all nine lenses once: ${named.join(', ')}`);
    check(!active.includes('spec'), 'the spec lens is active with no spec named');
    check(scope.files.map((f) => f.path).sort().join() === 'src/quality-recall.ts,src/security-recall.ts', `judged files are not the committed change: ${scope.files.map((f) => f.path).join(', ')}`);
    for (const lens of active) {
      const p = path.join(ctx, `${lens}.md`);
      if (!check(fs.existsSync(p), `cr-scan left no ${lens}.md`)) continue;
      const text = fs.readFileSync(p, 'utf8');
      check(/^Lens: .* · files judged: [1-9]\d* of \d+/m.test(text), `${lens}.md has no Lens header with a non-zero files-judged count`);
      const shared = /^Lens: .* · shared run: \S+/m.test(text);
      check(shared === Boolean(context.vars.list), `${lens}.md ${shared ? 'claims' : 'lacks'} a shared-run header suffix`);
      const stray = strayHandoffFamilies(text);
      check(stray.length === 0, `${lens}.md hands off to families outside severity.md: ${stray.join(', ')}`);
    }
    if (context.vars.list) {
      const blocks = [...output.matchAll(/^lens: (\S+)\s*$/gm)].map((m) => m[1]);
      for (const lens of active) {
        const n = blocks.filter((b) => b === lens).length;
        check(n === 1, `the lens-list cr-scan printed ${n} closing blocks for ${lens}, not one`);
      }
    }
  }

  const report = path.join(ctx, 'cr-report.md');
  if (check(fs.existsSync(report), 'cr-merge wrote no cr-report.md')) {
    for (const f of reconciliationFailures(fs.readFileSync(report, 'utf8'))) check(false, f);
  }
  check(/status: merged/.test(output), 'cr-merge did not return status: merged');
  check(FINDING.test(output), 'no finding line in the fixed `severity · family · rule · path:L · class — fix` shape');
  check(/^- high · security · /m.test(output), 'the planted security finding did not come through the merge');

  const dirty = execFileSync('git', ['-C', path.resolve(root, checkout), 'status', '--porcelain'], { encoding: 'utf8' }).trim();
  check(dirty === '', `the review edited the checkout: ${dirty}`);

  return { pass: failures.length === 0, score: failures.length === 0 ? 1 : 0, reason: failures.join('; ') || 'all checks passed' };
};
