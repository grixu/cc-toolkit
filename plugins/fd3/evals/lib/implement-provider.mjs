// promptfoo provider for the implement suite. A YAML provider config cannot carry the two things
// these scenarios need — a prompt rendered from the workflow script at run time, and a hook
// callback — so this module builds both and hands the call to promptfoo's own
// anthropic:claude-agent-sdk provider, which keeps its cost, model-usage and tool-call metadata.
import fs from 'node:fs';
import path from 'node:path';
import { loadApiProvider } from 'promptfoo';
import { EVALS_DIR, sandboxDir } from './helpers.mjs';
import { SCENARIOS } from './implement-scenarios.mjs';

const PLUGIN_ROOT = path.resolve(EVALS_DIR, '..');

const readTaskFiles = (dir) =>
  Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
  );

function agentConfig(agent, base, model) {
  return {
    ...base,
    model: agent.model ?? model,
    ...(agent.effort ? { effort: agent.effort } : {}),
    working_dir: agent.cwd,
    // A workflow agent answers through its schema and has no human to ask or workflow to start.
    output_format: { type: 'json_schema', schema: agent.schema },
    disallowed_tools: ['AskUserQuestion', 'Workflow'],
    // The runner disables background tasks for every headless eval, but the workflow's agents
    // run with them: the Bash tool's run_in_background and Monitor are how the long build got
    // abandoned in the traces this suite reproduces.
    env: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '0' },
  };
}

// The skill runs headless up to its launch; the launch itself is denied, after the task files are
// read as the workflow's agents would have received them.
function skillConfig(scenario, sandbox, base, model, fd3) {
  const tasksDir = path.join(sandbox, scenario.tasksDir);
  fd3.workflowCalls = [];
  const stopAtLaunch = async () => {
    fd3.workflowCalls.push({ taskFiles: readTaskFiles(tasksDir) });
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'This evaluation ends at the launch: the workflow does not run here. Do not launch it another way and do not implement anything; end your turn.',
      },
    };
  };
  return {
    ...base,
    model,
    working_dir: path.join(sandbox, 'app'),
    ask_user_question: { behavior: 'first_option' },
    plugins: [{ type: 'local', path: PLUGIN_ROOT }],
    hooks: { PreToolUse: [{ matcher: 'Workflow', hooks: [stopAtLaunch] }] },
  };
}

export default class ImplementProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
  }

  id() {
    return 'fd3-implement';
  }

  async callApi(prompt, context) {
    const name = context?.vars?.scenario;
    const scenario = SCENARIOS[name];
    if (!scenario) return { error: `unknown implement scenario: ${name}` };
    const sandbox = sandboxDir(name);
    const { model, ...base } = this.config;
    // promptfoo resolves a relative `settings` path only for its own YAML-declared providers; passed
    // through here, the CLI would resolve it against the agent's working directory.
    if (base.settings && !path.isAbsolute(base.settings)) base.settings = path.resolve(EVALS_DIR, base.settings);
    const fd3 = { scenario: name };
    let config;
    let text = prompt;

    if (scenario.kind === 'agent') {
      const agent = await scenario.render(sandbox);
      text = agent.prompt;
      Object.assign(fd3, { label: agent.label, model: agent.model ?? model, effort: agent.effort ?? null, renderedPrompt: agent.prompt });
      config = agentConfig(agent, base, model);
    } else {
      config = skillConfig(scenario, sandbox, base, model, fd3);
    }

    const inner = await loadApiProvider('anthropic:claude-agent-sdk', { options: { config } });
    const response = await inner.callApi(text, context);
    return { ...response, metadata: { ...(response.metadata ?? {}), fd3 } };
  }
}
