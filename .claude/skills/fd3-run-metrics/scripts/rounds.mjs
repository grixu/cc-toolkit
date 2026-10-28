#!/usr/bin/env node
// For every branch of a snapshot's runs that went through a CI fix round, print each CI verdict's
// failures and each fixer's summary and caveats in order — to read why a loop stalled.
//
//   node rounds.mjs <snapshot> [<runId>]
import fs from 'node:fs';
import path from 'node:path';

const [snapDir, onlyRun] = process.argv.slice(2);
if (!snapDir) {
  console.error('usage: node rounds.mjs <snapshot> [<runId>]');
  process.exit(2);
}

const structured = (file) => {
  if (!fs.existsSync(file)) return null;
  let last = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r.type !== 'assistant') continue;
    for (const c of r.message.content || []) if (c.type === 'tool_use' && c.name === 'StructuredOutput') last = c.input;
  }
  return last;
};
const clip = (s, n) => (s || '').replace(/\s+/g, ' ').slice(0, n);

const runs = fs
  .readFileSync(path.join(snapDir, 'runs.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((r) => !onlyRun || r.run === onlyRun);

for (const r of runs) {
  if (!r.file || !fs.existsSync(r.file)) {
    console.log(`\n### ${r.proj} ${r.wf} ${r.run}: run file gone (transcript retention)`);
    continue;
  }
  const run = JSON.parse(fs.readFileSync(r.file, 'utf8'));
  const dir = path.join(path.dirname(path.dirname(r.file)), 'subagents', 'workflows', run.runId);
  const agents = (run.workflowProgress || []).filter((a) => a.type === 'workflow_agent');
  const tags = new Set(agents.filter((a) => /^fix-(ci|final):/.test(a.label)).map((a) => a.label.replace(/^fix-(ci|final):/, '').replace(/#\d+(:retry)?$/, '')));
  for (const tag of tags) {
    console.log(`\n### ${r.proj} ${r.wf} ${r.run} ${tag}`);
    for (const a of agents.filter((a) => /^(ci|fix-ci|fix-final):/.test(a.label) && a.label.includes(tag))) {
      const o = structured(path.join(dir, `agent-${a.agentId}.jsonl`)) || {};
      if (a.label.startsWith('ci:')) {
        console.log(`- ${a.label} passed=${o.passed} head=${(o.head || '').slice(0, 8)}`);
        for (const x of o.failures || []) console.log(`    FAIL: ${clip(x, 400)}`);
      } else {
        const commit = o.fromSha && o.toSha ? (o.fromSha === o.toSha ? 'NO-COMMIT' : 'committed') : 'commit unknown';
        console.log(`- ${a.label} ${commit}: ${clip(o.summary, 300)}`);
        for (const x of o.caveats || []) console.log(`    CAVEAT: ${clip(x, 300)}`);
      }
    }
  }
}
