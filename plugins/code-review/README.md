# code-review

code-review is a Claude Code plugin that reviews a code change with up to twelve focused reviewers
running in parallel, then merges what they find into one report grouped by file. After the report,
a short menu asks which fixes to apply. Nothing is edited until you choose.

## Why not just ask Claude to review?

A single "review this" prompt reads the change once, from one angle, and decides on the fly what
counts as a problem. This plugin instead:

- runs one reviewer per lens in parallel, each with its own written rule set (69 named rules plus
  14 comment rules), so every finding names its rule and runs are comparable;
- merges the findings centrally: duplicates collapse, and severities follow one fixed table;
- reads your project's conventions first, so a documented house style is not reported as a
  problem, and turns explicit rules in `CODING_STANDARDS.md` into findings;
- ends with an apply menu sorted by risk, and edits only what you select.

It reviews how code reads and is structured, whether it does what it evidently means to do,
whether the change agrees with its own docs, contracts and config, and whether it relies on
behaviour its dependencies or platform do not have, plus narrow security, performance and spec
checks, and, in a project that uses [hookify](../hookify/README.md), a check against its rules. Claude Code's bundled `/code-review` skill shares
this plugin's name; it is a single bug-hunting pass, where this plugin grades every finding
against a fixed rule.

## Install

```
/plugin marketplace add grixu/cc-toolkit
/plugin install code-review@cc-toolkit
```

## Requirements

- `git`. The change under review is read from git.
- `python3`. A bundled script finds the changed files and the base branch.
- The `Agent` tool in your session. `/code-review:start-cr` runs its reviewers as sub-agents. Where
  that tool is missing, such as inside another agent or a workflow step, it says so first instead
  of passing off a single read as a full review.

## Quick start

Plugin commands carry the plugin's name as a prefix:

```
/code-review:start-cr                          # review the current branch's changes
/code-review:start-cr src/auth.ts src/billing/ # review these files or directories in full
/code-review:start-cr --base develop           # measure the change against develop
/code-review:start-cr --spec docs/feature.md   # also check the change against a local spec
/code-review:start-cr --pr 42                   # review GitHub pull request #42 against its base
```

With no paths, it reviews your branch's changes. It finds the base branch in this order: the
upstream branch, `origin/main`, `origin/master`, `main`, `master`, unless you pass `--base`. It sees
committed, uncommitted and untracked files. When you have both committed and uncommitted changes, it
asks whether to review the uncommitted ones, the committed ones, or both. When it finds nothing but
another base would show commits, as with a branch pushed to its own remote counterpart, it offers to
run again against that base.

With `--pr <number>` it reviews a GitHub pull request's head against the PR's base, using `gh`.
When your checkout is not at the PR's head, it reviews and applies fixes in a detached worktree
next to the repository, and your checkout is never switched. When someone else authored the pull
request, it applies nothing: every finding is anchored to a line of the diff, a draft review in
English labels each one with a [Conventional Comments](https://conventionalcomments.org/) label
(`issue:`, `suggestion:`, `nitpick:`), and one question asks whether to post the draft as a single
comment review or keep it.

## The lenses

You do not pick lenses; the change decides. Nine run on any change of code, three depend on the
input or the project, and the report's tally lists any lens that did not run and why. A change of documents,
changesets or config data alone runs coherence only, which reads the code each claim describes
from the repository.

| Lens | Runs | Looks for |
|---|---|---|
| comments | always | Comments that narrate the code, cite tickets or other files, contradict or outlive the code, excuse a shortcut, hold a decision that belongs in an ADR, or are missing where a decision needs explaining. |
| readability & tests | always | Nesting a guard clause would flatten, unnamed magic values, functions doing several jobs, tests that do not check what their name claims. |
| naming & module | always | Names that hide intent, queries that change state, imports pointing the wrong way, helpers that duplicate one the repository already has, wrappers that only forward a call. |
| objects & patterns | always, except on a change of infrastructure code only | Half-built objects, exposed internal collections, methods living on the wrong object, repeated type switches. |
| simplicity & types | always | Duplication that collapses into one shape, code longer than its idea, needless casts, dead code. |
| correctness | always | Conditions that pick the wrong branch, cases nothing handles, off-by-one bounds, swallowed errors, races on shared state, calls that break their callee's contract. |
| security | always | Secrets in source, injection, missing access checks, unvalidated input, insecure settings, exposed infrastructure, widened access, including in access policies, RBAC, `CODEOWNERS` and CI workflows. |
| coherence | always | Two artifacts that describe the same thing differently: docs or a changeset stating what the code does not do (including docs the change never touched that still name what it removed or renamed), an API contract, a committed generated client or a migration out of step with the code, a behaviour change with no changeset in a repo that uses Changesets, a config key the code reads that compose, Helm or a workflow does not set, one of several parallel paths skipping a shared step, a new enum member a sibling listing misses, code breaking a rule an accepted ADR or `CONTEXT.md` states. |
| assumptions | always | Code that relies on a library, runtime, CI or platform behaving in a way it does not: an option's real scope or default, an API the locked version lacks, a job reading a secret its environment does not grant, a test double the real dependency would not match. |
| performance | the change includes executable source (not tests, test helpers, `*.config.*`, infrastructure code or `.sh`) | N+1 calls, unbounded fetches, blocking calls on async paths, wasted React renders, queries on unindexed columns. |
| spec | you name a spec with `--spec`, or accept the one the change carries | Spec lines nothing implements, implemented wrongly or only partly, behaviour the spec never asked for, and spec lines still describing what an approved departure replaced. |
| hookify | the checkout has hookify rule files (`.claude/hookify.*.local.md` or `.claude/hookify.*.rule.md`) with an enabled `file` or `all` rule | Added lines that the project's hookify rules would have warned about or blocked, had every edit gone through the hooks. |

A security finding names where untrusted data enters and where it lands; a performance finding
names the loop, the call inside it, and the batch or limit API that exists; a correctness finding
names the input that takes the wrong path and what happens to it. A coherence finding quotes both
artifacts, each with its `path:line`, and what breaks between them. An assumptions finding names
the belief, the fact that contradicts it with its source (the dependency's installed code at the
version the lockfile pins, its own docs, or the platform's documented behaviour), and the input
and outcome on the changed path. A pattern alone is not a finding.

When the change itself contains a spec-shaped Markdown file (under `specs/`, `spec/`, `docs/adr/`
or `tasks/`, or named `*SPEC*.md`, `*ADR*.md`, `*.spec.md` or `*-plan.md`) and you passed no
`--spec`, the review offers to check the change against it, preferring a spec over an ADR. When the
change carries none, it looks for a `SPEC.md` already in the repository that matches the branch's
name, then in the main worktree for a `SPEC.split.md` or task file that names the branch, and
offers the `SPEC.md` beside it. `--spec` takes a local file only. For a URL or a
ticket id, the review asks for a local path; it never fetches one.

## What you get

A report grouped by file. Code findings read `` `family` · rule · severity ``, where severity is
`high`, `medium` or `nit`. Comment findings read `` `comments` · R1–R14 · verdict ``, where the
verdict is one of:

- KEEP: the comment stays.
- REMOVE: delete it.
- REWRITE: replace it; the report gives the exact text. A comment that excuses a shortcut
  ("hacky but works") is reported only: fix the code, or state the constraint behind it.
- MOVE: move it to where the behaviour it explains lives, or into a new ADR when it records a
  decision other code must follow and the repository keeps ADRs.
- ADD: a missing comment that explains a decision.

An example report:

```markdown
## Code review — committed (base → HEAD), 3 files

**Conventions:** repo `CLAUDE.md` documents barrel exports as the public-API style, so `module` · barrel is not flagged here.
**Headline:** `checkout/total.ts` concatenates the request's coupon code into a raw SQL string at L72.

### src/checkout/total.ts
- `security` · injection-sink · high · L70, L72 — `couponCode` read from `req.query` at L70 reaches the raw `WHERE` string at L72 by concatenation → bind it as a query parameter
- `simplicity` · over-complex · high · L18, L34, L51 — three copies of the tier-discount branch drift independently → collapse into `discountFor(tier)` and call it at each site
- `readability` · magic-literal · medium · L22 — `0.1` carries the gold-tier rate with nothing naming it → name `GOLD_DISCOUNT_RATE`
- `comments` · R1 · REMOVE · L17 — "// multiply by the rate" restates the line beneath it → delete these lines

### src/checkout/receipt.ts
- `naming` · role-name · nit · L9 — `receiptArray` names the type instead of the role → `receipts`
- `comments` · R2 · ADD · L44 — the 250 ms retry gap is a gateway constraint no reader can infer → "// 250 ms — the gateway rejects retries closer than its own debounce window"

### docs/checkout-spec.md
- `spec` · missing-requirement · high · L14 — "A receipt lists the discount applied per line item" has no implementation in the diff → add the per-line discount to `Receipt`

**Not flagged:** `JSON.parse(raw) as Config` at L7 (boundary narrowing, not `needless-cast`); the exhaustive `default:` throw at L61 (defensive assertion, not `dead-code`).

**Tally:** 5 quality findings (3 high · 1 medium · 1 nit) · 8 comments (1 remove · 0 rewrite · 0 move · 1 add · 6 keep) · 3 files. Lenses: 11 of 12 (skipped: hookify — no hookify rule files). Spec: 4 of 5 requirements met. Skipped: pnpm-lock.yaml (lockfile).
```

A report may also carry a `Boy-scout` block, with optional fixes in code the change did not touch,
and a `Reconciliation` line above it that counts how the reviewers' notes to each other were
resolved. A clean change gets a one-line verdict and the tally.

Right after the report, one menu asks what to apply:

- Safe fixes: mechanical edits such as blank lines, named constants, renames, guard clauses, and
  comment removals and rewrites.
- Walk the structural ones: one at a time, each with its own yes. Extractions, moves, splits, and
  every correctness, security, coherence, assumptions and performance fix that is not
  report-only.
- Boy-scout extras: fixes outside the change.
- Report only: change nothing.

The menu offers only the options that have findings, plus Report only. Security fixes are never in the safe batch.
Spec findings describe work to do, so they are report-only, with one exception: a verified
`wrong-implementation` that one edit fixes can be offered as a fix. After the edits, the project's build
and tests run once, and the wrap-up lists any approved fix that was skipped or could not be applied
as approved. When a fix removes a secret from the source, rotating that secret is still your job.

The same menu asks how to commit what lands: one commit per finding family, made as each family
lands (each security fix in a commit of its own); fixup commits onto the branch commits that
introduced the edited lines, when the branch has commits of its own; one commit for everything; or
nothing. With `--pr` it then offers to push the commits to the pull request's branch, when that
branch is writable from here.

Before applying anything, the review saves the report and your selection to the session's scratch
directory, so a long apply walk survives a context compaction.

## Customize with your project's rules

The review reads your conventions before it judges anything. Two kinds of files matter.

Files that create findings: `CODING_STANDARDS.md` at the repository root (committed) and
`CODING_STANDARDS.local.md` beside it (personal; add it to `.gitignore`). Both apply; where they
disagree, the `.local` file wins for that statement. Only the pair at the root counts. An explicit
rule such as "Domain services MUST NOT import from `infra/`" becomes a `standards` finding that
quotes it. Severity follows the rule's keyword:

| Keyword | Severity |
|---|---|
| MUST, MUST NOT, NEVER, ALWAYS | high |
| SHOULD, or no keyword | medium |
| MAY, prefer, consider | nit |

Vague prose such as "write clean code" creates nothing. Rules about formatting, whitespace, import
order and quotes are skipped when a formatter or linter config sits at the repository root
(`.prettierrc*`, `biome.json`, `eslint.config.*`, `.eslintrc*`, `.editorconfig`, `ruff.toml` or a
`[tool.ruff]` table in `pyproject.toml`, `.golangci.yml`, `rustfmt.toml`, `phpcs.xml`,
`.php-cs-fixer*`), because the tool enforces them.

Hookify rules create findings too. When the checkout keeps hookify rule files in its `.claude/`
directory, the hookify lens replays every enabled `file` and `all` rule over the diff, the way
hookify's hooks check each edit, and quotes the rule's message in the finding. A `block` rule's
finding is high and a `warn` rule's medium. A `.local.md` rule with `enabled: false` switches off
the team rule of the same name, as it does at runtime. `bash`, `prompt` and `stop` rules, rules in
`~/.claude/`, and conditions on anything but the file path, the added text and the removed text
are left out, because a diff cannot show them. A rule whose only condition is the file path is
raised only when the added lines do what its message warns against.

Decision records create findings too: the coherence lens flags code that breaks a rule stated by
an accepted ADR, `CONTEXT.md`, or a decision document in the change, and quotes the rule. Other
design notes and plans only raise it as a candidate the merge decides.

Files that only silence findings: `CLAUDE.md` and `AGENTS.md` (at the root and in every directory
down to the reviewed file), `CONTRIBUTING.md`, `.cursor/rules`, and `.claude/rules/*.md`. When one
of them documents a style, the review stops flagging it. When two project files disagree, the more
specific one wins, and the report names the conflict on its `Conventions` line. One exception: a
`CLAUDE.md` or `AGENTS.md` sentence about how the code beside it behaves at runtime, such as "fails
open", that the change breaks reaches the merge as a candidate, never as a graded finding on its own.

## Fewer questions in the structural walk

When you pick **Walk the structural ones**, `/start-cr` asks about each fix before it applies it.
A decision model can answer the questions you would only wave through. Set the plugin option
**Walk decision backend** (`/plugin` → code-review → configure):

| Value | What happens |
|---|---|
| `off` (default) | Every fix gets its own question. Nothing is sent anywhere. |
| `typesafe` | TypeSafe Jev decides. Needs `TYPESAFE_API_KEY` or the plugin's key option. |
| `gemini` | Gemini Decision decides. Needs `GEMINI_DECISIONS_API_KEY`, `GEMINI_API_KEY` or the plugin's key option. |
| `auto` | Uses whichever key is set, and asks you to pick Jev or Gemini when both are. |

For each fix the model is sent the report bullet, the finding's lines with 12 more on
either side, their diff hunk, the list of changed file paths and the report's scope and
conventions lines. It answers two
questions: does the fix need a fact the review cannot know (a migration's state, a business
rule), and is there another remedy that would behave differently. When both answers are no,
the fix is applied without a question; otherwise you are asked as before. `security`, `spec`
and boy-scout fixes are always asked, and so is any fix the model could not decide. The
wrap-up lists the fixes applied this way, with the backend that decided them.

The thresholds come from 209 recorded walk decisions. Gemini settled about a third of them
without applying a fix its owner had declined; Jev settled a similar share but applied two
declined fixes. The eval that measures this is in `evals/apply-decision/`.

## Codex review (external)

With the [collegium](../collegium/README.md) plugin installed and Codex enabled in it, a review
can add a second, outside reader: OpenAI Codex reviews the same change beside the Claude lenses.
It sends the change to OpenAI. Set the plugin option **Codex review through Collegium**
(`/plugin` → code-review → configure):

| Value | What happens |
|---|---|
| `ask` (default, also when never saved) | When the Collegium tools are present, `/start-cr` asks once per review whether to add the Codex review. Without them it asks nothing and runs no Codex review. |
| `always` | Every review adds the Codex review without asking. When the Collegium tools are missing, the report says why it did not run. |
| `never` | No Codex review, no question. |

The Codex review starts together with the lens scanners, runs read-only in the checkout under
review (the pull request's worktree with `--pr`), and the merge waits for it, up to 60 minutes.
Codex gets the same scope, conventions and standards as the lenses and the plugin's family and
rule table, and answers in a fixed schema. A Codex finding that names a row of that table is
merged and re-graded like any lens finding, and one that lands on the same code as a Claude lens
counts as independent agreement; anything else is a candidate the merge decides.

It is an external review, not a lens: it is not counted in `Lenses: L of A`. A delivered run adds
`External review: codex` to the report's tally. A run that fails, times out or cannot start reads
`External review: skipped: codex — <reason>` there, and the review goes on without it: it never
triggers the menu a missing lens does.

Automated workflows turn it on with `cr-prepare --codex`. Under the Codex CLI the Codex review
does not exist and is never offered.

## What it reviews and what it skips

Reviewed: source files with the extensions `.ts .tsx .mts .cts .js .jsx .mjs .cjs .py .go .rs .java
.kt .swift .c .cpp .h .rb .php .vue .scala .cs .sh`, plus Terraform, Dockerfiles, Helm charts,
compose files and other infrastructure-as-code. Tests get every lens except performance;
infrastructure code also skips objects & patterns. Access policies (`*.rego`,
`*.cedar`, Cerbos and Kubernetes RBAC manifests, IAM policy files), `CODEOWNERS` and CI workflow
files are reviewed by the security, assumptions and coherence lenses only, plus hookify when it
runs.

Skipped, and listed on the report's `Skipped` line: JSON, lockfiles, generated or minified files,
Markdown and other docs, `.txt`, other static config (`.yaml`, `.toml`, `.ini`, `.env`), and
license headers. Two lenses read them anyway, three in a project with hookify rules. Coherence judges every skipped file except
lockfiles, generated output and real `.env` files, because a README, a migration or a compose file
is one side of the disagreements it looks for; a real `.env` it only Greps for key names, never
reading a value. The spec lens, with a spec given, maps the spec against every changed
file, skipped and policy files included, because a workflow or a manifest is often what a spec
line describes; a real `.env` it too only Greps for key names. The hookify lens, when it runs,
checks the same files coherence reads against your hookify rules, since a rule can target any
path.

Limits:

- It is not a security audit. The security lens reads source, policy and CI workflow files for
  the problems listed above. It does not scan dependencies, `.env` files, lockfiles or action
  pinning; run Claude Code's `/security-review` for those.
- The correctness, coherence and assumptions lenses read; they never run the code. A claim that
  needs a run to settle comes back marked `(verify)`.
- The assumptions lens reads the installed dependencies. In a checkout with none it uses the main
  worktree's install when the lockfile pins the same version, and otherwise marks the claim
  `(verify)`.
- The rules are written for imperative and object-oriented code, mostly JavaScript and TypeScript.
  A rule with no counterpart in a language is cleared, not forced: wasted-render applies only to
  `.tsx` and `.jsx`, blocking-in-async only to Node and Python asyncio, and infrastructure code
  skips the module, object, pattern, test and cast rules.

## Internal parts

Three skills split `/code-review:start-cr` into steps for automated workflows, which cannot answer
questions or start sub-agents of their own. They are internal: hidden from the `/` menu, called by
the `fd3` plugin's implementation workflows, and not meant for you to run. `/code-review:start-cr`
uses `cr-scan` too: it writes the same context directory itself and runs each lens as the
`code-review:scanner` agent, which has only the tools a lens needs and loads no `CLAUDE.md`.

| Skill | Arguments | Writes |
|---|---|---|
| `code-review:cr-prepare` | `--base <ref> --out <dir> [-C <checkout>] [--spec <path> [--spec-focus <codes>]] [--codex]` | `scope.json`, `conventions.md`, `standards.md` |
| `code-review:cr-scan` | `--lens <lens>[,<lens>…] --context <dir>`: one agent per active lens, or one agent judging a comma-separated list in turn; `--lens codex` runs the Codex review in an agent of its own, never inside a list, even though `cr-prepare` lists `codex` on its `active:` line | `<lens>.md` per lens, `codex.md` for the Codex review |
| `code-review:cr-merge` | `--context <dir>` | `cr-report.md`, and returns each finding with its fix risk: `safe`, `structural` or `report-only`, plus the real problems no rule names and the files left to `/security-review` |

`--spec-focus "DB-1,D3"` names, by element code or decision id, the part of the spec a change
implements; it needs `--spec`. The spec and correctness lenses then judge the change against those
elements first and read the rest of the spec only where those elements point or the diff reaches,
and the spec lens counts only the focused requirements and calls any other behaviour unasked.

A cr-scan list trades isolation for cost. Every cr-scan agent pays the same start-up reading
before it judges a line, which is most of the cost on a change of a few files; one agent judging
a list pays it once, but its later lenses read the change with the earlier lenses' work in context,
and the lenses run in turn rather than in parallel. The caller decides: a list for a small change,
one agent per lens for a large one. Each lens in a list still writes its own `<lens>.md` and gets
its own closing block, in the listed order, so `cr-merge` works the same either way.

They review committed changes only, never edit the checkout, and never ask anything. An empty
change or a lens that did not report comes back as a status (`empty`, `incomplete`), never as a
clean review.

## Codex

The plugin also installs in the [OpenAI Codex CLI](https://github.com/openai/codex), tested on
codex-cli 0.165.0. It needs the same `git` and `python3`. From your shell:

```
codex plugin marketplace add grixu/cc-toolkit   # --ref <branch> installs from a branch
codex plugin add code-review@cc-toolkit
codex plugin list                               # check that it is installed
```

To work on a local checkout, add its path as the marketplace instead. After an edit, run
`codex plugin add code-review@cc-toolkit` again, which refreshes the installed copy, and start a
new session.

In Codex, a skill is mentioned with `$`:

```
$code-review:start-cr [--base <ref>] [--pr <n>] [--spec <path>]   # --pr needs network, see limits
```

`start-cr` runs only when you mention it. The headless `$code-review:cr-prepare`, `cr-scan` and
`cr-merge` are mention-only too, for workflows that drive them.

Codex reads the same `.claude-plugin/marketplace.json`, and this plugin's
`.codex-plugin/plugin.json` points it at `codex/skills/` instead of the Claude Code skills. Each
skill there is a thin adapter: it loads `codex/host.md`, which maps Claude Code's mechanics
(plugin root, `$ARGUMENTS`, tool names, questions, sub-agents, the `.env` key-names-only rule,
commits under the sandbox) to Codex's, then follows the Claude Code command or skill unchanged, so
the lens rules have one source.

Limits under Codex:

- Scanners run as Codex sub-agents, so the lenses run in waves. How many run at a time depends on
  which multi-agent version Codex selects for the model: six under v1, or the session's slots
  minus one under v2, three by default. Raise the cap with
  `agents.max_concurrent_threads_per_session` in `config.toml`.
- `request_user_input` is unavailable in Default mode, so questions and the apply menu come as
  numbered chat messages. Answer in your next message.
- Under `codex exec`, every question, the apply menu included, stops the run and nothing it gates
  is applied. Answer with `codex exec resume <id> "<answer>"`. `resume` takes no `-C` or `-s`; set
  the sandbox with `-c sandbox_mode=...`.
- The `workspace-write` sandbox keeps `.git` read-only and blocks the gpg-agent socket, so a commit
  mode stops and asks instead of committing. Adding `<repo>/.git` to
  `sandbox_workspace_write.writable_roots` fixes only the read-only `.git`; signed commits still
  fail. Approve running the commit outside the sandbox when Codex asks (interactive runs only), or
  choose "Leave uncommitted". The plugin never turns off commit signing or hooks.
- `--pr` and the check for someone else's pull request need network access for `gh` and
  `git fetch`, a writable `.git`, and, for `--pr`, a writable directory beside the repository for
  the PR worktree. `workspace-write` gives none of them, and this path is untested under Codex.
  When the check cannot run, the review says so in one line, and an interactive run asks to
  escalate first.
- Scanner sub-agents get Codex's full toolset, since Codex has no per-agent tool list like
  `agents/scanner.md`'s, so a Scanner editing nothing rests on its prompt alone. This is an
  accepted difference.
- Claude Code's `/security-review` and `/code-review` do not exist in Codex and are never offered.
- The Walk decision backend is a Claude Code mod setting, so under Codex every structural fix in the
  walk is asked one at a time.
- Cost, as an indicative figure from one measurement (2026-10): a full review of a one-file change
  with ten lenses took 3.5–4 minutes, about 5M input tokens (about 95% cached) and 20k output
  tokens.

## Development

- `evals/`: a promptfoo eval suite, used for development. See `evals/README.md`.
- `CONTEXT.md`: the plugin's glossary.
- `docs/adr/`: the design decisions behind the lens split, the active lens set, the coherence
  and assumptions lenses, and the hookify lens.
