import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sandbox = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.sandbox');

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const branchKey = (branch) => branch.replaceAll('/', '-');
const created = (branch) => ({
  body: read(path.join(sandbox, `gh-posted-pr-create-${branchKey(branch)}.md`)),
  meta: JSON.parse(read(path.join(sandbox, `gh-posted-pr-create-${branchKey(branch)}.json`)) ?? 'null'),
});
const git = (repo, ...args) => {
  try {
    return execFileSync('git', ['-C', path.join(sandbox, repo), ...args], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

const TEMPLATE_SECTIONS = ['Issue', 'Description', 'Dependencies'];

function parse(body) {
  const text = (body ?? '').trim();
  const section = (name) => {
    const m = text.match(new RegExp(`(?:^|\\n)#+\\s*${name}[ \\t]*\\n([\\s\\S]*?)(?=\\n#+\\s|\\n\\[[^\\]]+\\]:\\s|$)`, 'i'));
    return m ? m[1].trim() : null;
  };
  const risk = text.search(/^## Risk\b/m);
  return {
    body: text,
    issue: section('Issue'),
    description: section('Description'),
    dependencies: section('Dependencies'),
    // The Risk section has its own shape and is outside the length budget.
    withoutRisk: risk < 0 ? text : text.slice(0, risk) + text.slice(risk).replace(/^## Risk\b[\s\S]*?(?=\n#+\s|\n\[[^\]]+\]:\s|$)/, ''),
  };
}

// Prose outside code spans and fences, minus the HTML that MDX accepts as JSX.
const prose = (text) =>
  text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/<\/?(sub|details|summary|br)\s*\/?>/gi, '');

const MAX_BODY_LINES = 40;
const hasBeforeAfterTable = (text) => /^\|[^\n]*\|\s*Before\s*\|\s*After\s*\|\s*$/im.test(text ?? '');
const conventional = (title, suffix) => new RegExp(`^[a-z]+(\\([^)]+\\))?!?: \\S.*${suffix}$`).test(title ?? '');

function bodyChecks(parsed) {
  const { body, description } = parsed;
  return [
    ...TEMPLATE_SECTIONS.map((name) => [parsed[name.toLowerCase()] !== null, `no ${name} section`]),
    [
      (() => {
        const at = TEMPLATE_SECTIONS.map((name) => body.search(new RegExp(`^#+\\s*${name}\\b`, 'im')));
        return at.every((i) => i >= 0) && at[0] < at[1] && at[1] < at[2];
      })(),
      'template sections out of order',
    ],
    [!/<!--/.test(body), 'an HTML comment is left in the body (not MDX-safe)'],
    [!/[<{]/.test(prose(body)), 'a bare < or { in prose (not MDX-safe)'],
    [
      parsed.withoutRisk.split('\n').filter((l) => l.trim()).length <= MAX_BODY_LINES,
      `body over ${MAX_BODY_LINES} non-blank lines`,
    ],
    [!/^#+\s*(Summary|Changes)\b/im.test(description ?? ''), 'Summary/Changes sub-heading in Description'],
    [!/why it matters/i.test(body), 'the old "Why it matters" label is still used'],
    [/\*\*Testing:?\*\*/.test(description ?? ''), 'no bold **Testing:** line in Description'],
    [
      !body
        .split(/[.\n]/)
        .some((s) => /\b(tested|verified|checked|clicked through)\b[^.]{0,20}\bbrowser/i.test(s) && !/\b(not|nothing|nobody|no one|never|yet)\b|n't\b/i.test(s)),
      'claims a browser check that never happened',
    ],
  ];
}

function score(checks) {
  const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
  return {
    pass: failed.length === 0,
    score: (checks.length - failed.length) / checks.length,
    reason: failed.length ? `${checks.length - failed.length}/${checks.length}; failed: ${failed.join('; ')}` : `all ${checks.length} checks passed`,
  };
}

export function feature() {
  const { body, meta } = created('feat/PL-5880-admin-notes');
  if (body === null) return { pass: false, score: 0, reason: 'no PR was created for feat/PL-5880-admin-notes' };
  const parsed = parse(body);
  const deps = parsed.dependencies ?? '';
  return score([
    ...bodyChecks(parsed),
    [hasBeforeAfterTable(parsed.description), 'Description has no Before/After table'],
    [(parsed.issue ?? '').includes('PL-5880'), 'Issue does not name PL-5880'],
    [/20261013140557_add_admin_note|migration/i.test(deps), 'Dependencies does not name the migration'],
    [/cerbos|admin:note|polic|permission/i.test(deps), 'Dependencies does not name the Cerbos policy'],
    [/ci:test/.test(parsed.description ?? ''), 'Testing does not name the ci:test run the user reported'],
    [
      (parsed.description ?? '').split(/[.\n]/).some((s) => /browser/i.test(s) && /\b(not|never|no|nobody|nothing|no one|untested|yet)\b|n't\b/i.test(s)),
      'Testing does not say it was not checked in a browser',
    ],
    [conventional(meta?.title, ' \\(PL-5880\\)'), `title "${meta?.title}" is not Conventional Commits with a (PL-5880) suffix`],
    [meta?.base === 'main', `PR based on ${meta?.base}, expected main`],
  ]);
}

export function noTicket() {
  const { body, meta } = created('fix/popover-click-close');
  if (body === null) return { pass: false, score: 0, reason: 'no PR was created for fix/popover-click-close' };
  const parsed = parse(body);
  return score([
    ...bodyChecks(parsed),
    [!/PL-\d+/.test(parsed.body), 'a PL-#### key was invented in the body'],
    [!/\bPL-/.test(parsed.issue ?? ''), 'Issue keeps the PL- placeholder'],
    [/^none\b/i.test(parsed.issue ?? ''), 'Issue is not None'],
    [/^-\s*none\b/im.test(parsed.dependencies ?? ''), 'Dependencies is not "- None"'],
    [/vitest/i.test(parsed.description ?? ''), 'Testing does not name the Vitest run the user reported'],
    [conventional(meta?.title, '') && !/PL-/.test(meta?.title ?? ''), `title "${meta?.title}" is not Conventional Commits or carries a ticket`],
  ]);
}

const JIRA_REF_LINE = '[PL-5820]: https://alokai.atlassian.net/browse/PL-5820?atlOrigin=eyJpIjoiNWRkNTljNzYifQ';
const CODE_STORY_URL = 'https://claude.ai/artifact/Md1YuWXvdm9yFyyEkSrMYH';

export function updateBody() {
  const body = read(path.join(sandbox, 'gh-posted-pr-edit-4288.md'));
  if (body === null) return { pass: false, score: 0, reason: 'the body of PR #4288 was never rewritten with --body-file' };
  const parsed = parse(body);
  const description = parsed.description ?? '';
  const local = git('pr-open-update-body', 'rev-parse', 'HEAD');
  const remote = git('pr-open-update-body-origin.git', 'rev-parse', 'refs/heads/feat/PL-5820');
  return score([
    ...bodyChecks(parsed),
    [hasBeforeAfterTable(description), 'Description has no Before/After table'],
    [(parsed.issue ?? '').includes('PL-5820'), 'Issue does not name PL-5820'],
    [parsed.body.includes(JIRA_REF_LINE), 'the Jira reference line was dropped or changed'],
    [parsed.body.trimEnd().endsWith(JIRA_REF_LINE), 'the Jira reference line is no longer the last line'],
    [/^#+\s*Code story\b/im.test(parsed.body) && parsed.body.includes(CODE_STORY_URL), 'the Code story section was dropped'],
    [/elasticsearch/i.test(description), 'the Elasticsearch logs commit is not described'],
    [/unavailable/i.test(description.replace(/farmer (is )?unavailable/gi, '')), 'the Farmer-unavailable fix is not described'],
    [!/\|\s*counted as zero\s*\|\s*$/im.test(description), 'the stale "counted as zero" After cell is still in the table'],
    [!/wizard|status cron/i.test(description), "the base feature branch's work (wizard, status cron) is described as this PR's"],
    [local !== null && local === remote, 'the two local commits were not pushed'],
    [!fs.existsSync(path.join(sandbox, 'gh-posted-pr-create-feat-PL-5820.md')), 'a second PR was created for the branch'],
  ]);
}
