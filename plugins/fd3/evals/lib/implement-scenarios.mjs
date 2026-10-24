import fs from 'node:fs';
import path from 'node:path';
import { runWorkflow } from '../../tests/workflows/harness.mjs';
import { implementDefaults, task } from '../../tests/workflows/fixtures.mjs';
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
  const { prompt, model, effort, label, opts } = call[0];
  return { prompt, model, effort, label, schema: opts.schema, cwd: repo };
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

// The commit SETUP.sh left the task branch on — written outside the sandbox, so no agent reads it.
export function branchHead(scenario) {
  const file = path.join(path.dirname(sandboxDir(scenario)), '.origins', scenario, 'branch-head');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;
}

export const worktreeOf = (scenario) => {
  const { branch } = SCENARIOS[scenario];
  return path.join(sandboxDir(scenario), `app.worktrees/${branch.replace(/\//g, '-')}`);
};
