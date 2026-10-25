import fs from 'node:fs';
import path from 'node:path';
import { runWorkflow } from '../../tests/workflows/harness.mjs';
import { implementDefaults, crMerged, task } from '../../tests/workflows/fixtures.mjs';
import { sandboxDir } from './helpers.mjs';

const passedBaseline = (commands) => ({ commands: commands.map((command) => ({ command, passed: true })), dirty: [] });

// Every agent scenario launches the real implement-run.js through the model-free harness and keeps
// the prompt, model, effort and schema of the one call it names, so the live agent gets exactly
// what the workflow would send it.
async function renderAgent({ sandbox, branch, slug, toolchain, commands, review, rules, capture }) {
  const repo = path.join(sandbox, 'app');
  const args = {
    specPath: path.join(repo, 'docs/spec.md'),
    tasks: [task(slug, { file: path.join(sandbox, 'tasks', `0001-${slug}.md`), repository: repo, branch, baseBranch: null })],
    repos: { [repo]: { startRef: 'main', diffBase: 'main' } },
    review,
    toolchain: { [repo]: toolchain },
    baseline: { [repo]: passedBaseline(commands) },
    maxFixRounds: 1,
  };
  const run = await runWorkflow('implement-run.js', args, [...rules, ...implementDefaults()]);
  const call = run.callsMatching(capture);
  if (call.length !== 1) throw new Error(`expected one ${capture} call, got ${run.labels.join(', ')}`);
  const { prompt, model, effort, agentType, label, opts } = call[0];
  return { prompt, model, effort, agentType, label, schema: opts.schema, cwd: repo };
}

const LONG_BUILD = "sh -c 'sleep 200; echo built'";

export const SCENARIOS = {
  'implement-ci-waits-long-command': {
    kind: 'agent',
    fixture: 'long-build-app',
    branch: 'feat/queue-status',
    longCommand: LONG_BUILD,
    render(sandbox) {
      const commands = ['sh scripts/lint.sh', LONG_BUILD];
      return renderAgent({
        sandbox,
        branch: this.branch,
        slug: 'queue-status-script',
        commands,
        review: false,
        toolchain: ['## Commands', `1. ${commands[0]} — lint (not scopeable)`, `2. ${commands[1]} — build (not scopeable)`].join('\n'),
        rules: [],
        capture: /^ci:/,
      });
    },
  },

  'implement-fix-cr-spec-bound': {
    kind: 'agent',
    fixture: 'strict-slug-branch',
    branch: 'feat/product-groups',
    finding: {
      severity: 'medium',
      family: 'patterns',
      rule: 'duplicate-literal',
      location: 'src/config.ts:L3',
      risk: 'safe',
      fix: "replace the local PRODUCT_GROUP_SLUG regex with the contract's PRODUCT_GROUP_PATTERN from src/contract.ts, so one pattern has one source",
    },
    // The finding asks to loosen a pattern the spec states, so no line may change.
    allowedLine: null,
    skipReason: /\bD3\b|spec/i,
    render(sandbox) {
      return renderFixer(sandbox, this, 'product-groups-config');
    },
  },

  'implement-fix-cr-stays-in-consent': {
    kind: 'agent',
    fixture: 'tf-consent-branch',
    branch: 'feat/queue-chart-bump',
    finding: {
      severity: 'comment',
      family: 'comments',
      rule: 'R1 rewrite',
      location: 'infra/main.tf:L9',
      risk: 'safe',
      fix: 'the comment restates the replica count; rewrite it to say why the worker runs two replicas',
    },
    // The task Note's Consent covers these two lines of the protected file and nothing else.
    allowedLine: /\?ref=|chart_version/,
    skipReason: /consent|protect/i,
    render(sandbox) {
      return renderFixer(sandbox, this, 'queue-chart-bump');
    },
  },

  'implement-consent-batch': {
    kind: 'skill',
    fixture: 'consent-notes-tasks',
    tasksDir: 'app/docs/specs/queue-status/tasks',
    consents: [
      { slug: 'queue-status-table', name: 'Add the queue status table migration', artifact: /migration/i },
      { slug: 'queue-worker-compose', name: 'Run the queue worker in local compose', artifact: /docker-compose/i },
      { slug: 'redis-client-dependency', name: 'Add the Redis client dependency', artifact: /pnpm-lock|lockfile/i },
    ],
  },
};

// A review that found one fixable finding, so the fixer is the next agent the workflow dispatches.
function renderFixer(sandbox, scenario, slug) {
  const commands = ['sh scripts/check.sh'];
  return renderAgent({
    sandbox,
    branch: scenario.branch,
    slug,
    commands,
    review: true,
    toolchain: ['## Commands', `1. ${commands[0]} — static checks (not scopeable)`].join('\n'),
    rules: [
      [/^cr-merge:.*:review$/, crMerged([scenario.finding])],
      [/^fix-cr:/, { summary: 'scripted', fromSha: 'aaa111', toSha: 'bbb222', skipped: [] }],
    ],
    capture: /^fix-cr:/,
  });
}

// The commit SETUP.sh left the task branch on — written outside the sandbox, so no agent reads it.
export function branchHead(scenario) {
  const file = path.join(path.dirname(sandboxDir(scenario)), '.origins', scenario, 'branch-head');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;
}

export const worktreeOf = (scenario) => {
  const { branch } = SCENARIOS[scenario];
  return path.join(sandboxDir(scenario), `app.worktrees/${branch.replace(/\//g, '-')}`);
};
