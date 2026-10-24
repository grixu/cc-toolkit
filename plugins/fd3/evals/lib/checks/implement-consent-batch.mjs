import * as h from '../helpers.mjs';
import { SCENARIOS } from '../implement-scenarios.mjs';

const { consents } = SCENARIOS['implement-consent-batch'];
// The step-2 batch is what the skill asks before it writes anything; consent lines, the answers
// file and the launch all come after it.
const AFTER_BATCH = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Workflow']);
const WITHHOLDS = /^\s*(no|not|don'?t|do not|withhold|hold|skip|block|deny|decline|later|defer)\b/i;

const questionText = (q) =>
  [q.header, q.question, ...(q.options || []).flatMap((o) => [o.label, o.description])].filter(Boolean).join('\n');

const namesTask = (text, t) => {
  const lower = text.toLowerCase();
  return lower.includes(t.name.toLowerCase()) || lower.includes(t.slug);
};

const noteSection = (content) => {
  const m = /^## Note[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(content);
  return m ? m[1] : null;
};

export default (output, context) => {
  const c = h.checker();
  const calls = (context?.providerResponse?.metadata?.toolCalls || []).filter((t) => !t.parentToolUseId);
  const boundary = calls.findIndex((t) => AFTER_BATCH.has(t.name));
  const batch = calls.slice(0, boundary === -1 ? calls.length : boundary).filter((t) => t.name === 'AskUserQuestion');
  const questions = batch.flatMap((t) => t.input?.questions || []);
  c.check(questions.length > 0, 'no AskUserQuestion batch before the first file write or launch');

  const used = new Set();
  for (const t of consents) {
    const i = questions.findIndex((q, k) => !used.has(k) && t.artifact.test(questionText(q)) && namesTask(questionText(q), t));
    if (!c.check(i !== -1, `no question in the first batch asks the ${t.slug} confirmation and names its task`)) continue;
    used.add(i);
    const first = questions[i].options?.[0]?.label ?? '';
    c.check(!WITHHOLDS.test(first), `the ${t.slug} question's first option withholds consent ("${first}"), so first_option never granted it`);
  }

  const workflow = context?.providerResponse?.metadata?.fd3?.workflowCalls?.[0];
  if (c.check(workflow, 'the run never reached the Workflow launch')) {
    for (const t of consents) {
      const file = Object.keys(workflow.taskFiles).find((f) => f.endsWith(`-${t.slug}.md`));
      const note = file ? noteSection(workflow.taskFiles[file]) : null;
      c.check(note !== null, `${t.slug}: no ## Note section in its task file at launch`);
      if (note !== null) c.check(/^Consent:[ \t]*\S/m.test(note), `${t.slug}: no Consent: line in its ## Note when the Workflow was called`);
    }
  }

  return c.verdict();
};
