// promptfoo provider for the implement suite. A YAML provider config cannot carry a prompt
// rendered from the workflow script at run time, so this module renders it and hands the call to
// promptfoo's own anthropic:claude-agent-sdk provider, which keeps its cost, model-usage and
// tool-call metadata.
import { loadApiProvider } from 'promptfoo';
import { sandboxDir } from './helpers.mjs';
import { SCENARIOS } from './implement-scenarios.mjs';

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
    const { model, ...base } = this.config;
    const fd3 = { scenario: name };

    const agent = await scenario.render(sandboxDir(name));
    Object.assign(fd3, { label: agent.label, model: agent.model ?? model, effort: agent.effort ?? null, renderedPrompt: agent.prompt });
    const config = {
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

    const inner = await loadApiProvider('anthropic:claude-agent-sdk', { options: { config } });
    const response = await inner.callApi(agent.prompt, context);
    return { ...response, metadata: { ...(response.metadata ?? {}), fd3 } };
  }
}
