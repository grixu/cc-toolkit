// promptfoo provider for the dev-kit suite. The YAML ask_user_question option only picks the first
// or a random option, and the model orders the escalation choices itself, so a scenario that needs
// a particular answer names it in `vars.answer` and this callback picks the matching option before
// handing the call to promptfoo's own anthropic:claude-agent-sdk provider.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApiProvider } from 'promptfoo';

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));

// promptfoo resolves these paths against the config file only for its own YAML-declared providers;
// passed through here, the CLI would resolve them against the agent's working directory.
const absolute = (p) => (p && !path.isAbsolute(p) ? path.resolve(EVALS_DIR, p) : p);

export default class DevKitProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
  }

  id() {
    return 'dev-kit';
  }

  async callApi(prompt, context) {
    const wanted = context?.vars?.answer ? new RegExp(context.vars.answer, 'i') : null;
    const answers = [];
    const can_use_tool = async (toolName, input) => {
      // Matches promptfoo's ask_user_question callback, which fails closed for anything else.
      if (toolName !== 'AskUserQuestion') {
        return { behavior: 'deny', message: 'Tool permission request is not handled by the dev-kit eval provider' };
      }
      const picked = Object.create(null);
      for (const question of input?.questions ?? []) {
        const options = question.options ?? [];
        const match = wanted ? options.find((o) => wanted.test(o.label)) : undefined;
        const option = match ?? options[0];
        if (!option) continue;
        picked[question.question] = option.label;
        answers.push({ question: question.question, options: options.map((o) => o.label), answer: option.label, matched: wanted ? Boolean(match) : null });
      }
      return { behavior: 'allow', updatedInput: { questions: input.questions, answers: picked } };
    };

    const base = this.config;
    const config = {
      ...base,
      // The repo's eval CI runs under GitHub Actions, and GITHUB_ACTIONS=true switches the skill to
      // unattended; an empty value keeps every case attended unless its vars.env says otherwise.
      // promptfoo skips undefined values, so an empty string is the only way to mask the variable.
      env: { ...base.env, GITHUB_ACTIONS: '', ...context?.vars?.env },
      working_dir: absolute(base.working_dir),
      settings: absolute(base.settings),
      plugins: base.plugins?.map((p) => (p.type === 'local' ? { ...p, path: absolute(p.path) } : p)),
      can_use_tool,
    };
    const inner = await loadApiProvider('anthropic:claude-agent-sdk', { options: { config } });
    const response = await inner.callApi(prompt, context);
    return { ...response, metadata: { ...(response.metadata ?? {}), devKit: { answers } } };
  }
}
