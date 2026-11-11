---
title: Reference
description: The arguments of /code-review:start-cr, the project files it reads, the report's vocabulary, and the headless steps workflows drive.
group: reference
sidebar:
  order: 4
---

## Arguments of start-cr

`/code-review:start-cr [paths...] [--base <branch>] [--spec <path>] [--pr <number>]`

| Argument | What it does |
|---|---|
| `paths...` | Reviews these files or directories in full instead of the branch diff. |
| `--base <branch>` | Measures the change against this branch. Without it: the upstream branch, `origin/main`, `origin/master`, `main`, then `master`. |
| `--spec <path>` | Adds the spec lens for a local spec file. A URL or a ticket ID is not accepted; the review asks for a local path. |
| `--pr <number>` | Reviews a GitHub pull request's head against its base, using `gh`. Takes no paths and no `--base`. |

Table 1. Arguments of `/code-review:start-cr`

There is no argument to pick lenses.
The change and the spec decide which run; see [How it works](/plugins/code-review/how-it-works/#the-lenses).

## Requirements

| Requirement | Why |
|---|---|
| `git` | The change is read from git. |
| `python3` | The bundled `get_changes.py` script finds the changed files and resolves the base. |
| `Agent` tool | Each lens runs as its own sub-agent. Without it, `start-cr` says so before doing anything. |
| `gh` | Only for `--pr`, and to detect that the current branch is someone else's open pull request. |

Table 2. What the review needs

## Project files the review reads

### Files that create findings

`CODING_STANDARDS.md` at the repository root, and `CODING_STANDARDS.local.md` beside it, apply together.
Where they disagree, the `.local` file wins for that statement.
Keep the `.local` file out of git; a tracked one is named on the report's `Conventions` line.
Only the pair at the root counts.

An explicit rule, such as "Domain services MUST NOT import from `infra/`", becomes a `standards` finding that quotes it.
Its severity follows the rule's keyword:

| Keyword | Severity |
|---|---|
| MUST, MUST NOT, NEVER, ALWAYS | `high` |
| SHOULD, or no keyword | `medium` |
| MAY, prefer, consider | `nit` |

Table 3. Severity of a `standards` finding

Vague prose, such as "write clean code", creates nothing.
Rules about formatting, whitespace, import order and quotes are skipped when a formatter or linter config sits at the repository root, because the tool enforces them.
The review checks for `.prettierrc*`, `biome.json`, `eslint.config.*`, `.eslintrc*`, `.editorconfig`, `ruff.toml` or a `[tool.ruff]` table in `pyproject.toml`, `.golangci.yml`, `rustfmt.toml`, `phpcs.xml` and `.php-cs-fixer*`.

An accepted ADR, `CONTEXT.md` or a decision document in the change also creates findings: the coherence lens flags code that breaks a rule it states.

### Files that only remove findings

`CLAUDE.md` and `AGENTS.md` (at the root and in every directory down to the reviewed file), `CONTRIBUTING.md`, `.cursor/rules` and `.claude/rules/*.md`.
When one of them documents a style, the review stops flagging it.
When two project files disagree, the more specific one wins, and the report names the conflict on its `Conventions` line.

## Report vocabulary

| Shape | Example |
|---|---|
| Code finding: `` `family` · rule · severity · lines — problem → fix `` | `` `readability` · magic-literal · medium · L22 `` |
| Comment verdict: `` `comments` · R1–R12 · verdict · line — problem → fix `` | `` `comments` · R2 · ADD · L44 `` |

Table 4. The two finding shapes

- **Families:** `readability`, `tests`, `naming`, `module`, `objects`, `patterns`, `simplicity`, `correctness`, `security`, `coherence`, `assumptions`, `performance`, `spec`, and the repository-defined `standards`.
- **Severities:** `high`, `medium`, `nit`. A `security`, `correctness`, `spec`, `coherence` or `assumptions` finding is `high` or `medium` only.
- **Comment verdicts:** `KEEP` (the comment stays), `REMOVE`, `REWRITE` (with the exact text), `MOVE` (to where the behavior it explains lives) and `ADD` (a missing comment that explains a decision).
- **`(verify)`:** a fact the scanner can't confirm from what it can read, such as runtime behavior or a file outside the review. The scanners read code; the correctness, security, performance and spec lenses never run it.
- **Report blocks:** `Conventions`, `Headline`, one section per file, `Not flagged`, `Boy-scout`, `Tally`, with a `Reconciliation` line above them.

## Headless steps

Three skills split `start-cr` into steps for workflows, which can't answer questions or start sub-agents of their own.
They are hidden from the `/` menu and not meant to be run by hand.
`/fd3:implement` drives them to review each branch it builds: `cr-prepare` once, `cr-scan` once per active lens, then `cr-merge`.
`start-cr` uses `cr-scan` too, through the `scanner` agent.

| Skill | Arguments | Writes |
|---|---|---|
| `code-review:cr-prepare` | `--base <ref> --out <dir> [-C <checkout>] [--spec <path> [--spec-focus <codes>]]` | `scope.json`, `conventions.md`, `standards.md` |
| `code-review:cr-scan` | `--lens <lens>[,<lens>…] --context <dir>` | `<lens>.md` per lens |
| `code-review:cr-merge` | `--context <dir>` | `cr-report.md` |

Table 5. The headless steps

- **Scope:** committed changes only, against `--base`. Uncommitted work belongs to whoever has the checkout open.
- **Asks nothing, edits nothing.** Each skill writes only into the context directory and returns a closing block with a status.
- **Lens names** are the rules files' basenames: `comments`, `readability-tests`, `naming-module`, `objects-patterns`, `simplicity-types`, `correctness`, `security`, `coherence`, `assumptions`, `performance`, `spec`.
- **`--spec-focus "DB-1,D3"`** names, by element code or decision ID, the part of the spec the change implements. It needs `--spec`. The spec and correctness lenses judge the change against those elements first.
- **A lens list** (`--lens comments,security`) runs the lenses one after another in one agent. It pays the start-up reading once, but later lenses read with the earlier ones in context, and their agreement doesn't count as convergence. Coherence and assumptions run as their own agents on a large change. `/fd3:implement` uses one agent for all lenses on a change of three judged files or fewer.

| Skill | Statuses |
|---|---|
| `cr-prepare` | `ready`, `empty` (with an alternate base when the script found one), `error` |
| `cr-scan` | `scanned`, `inactive`, `error`, one block per listed lens |
| `cr-merge` | `merged`, `incomplete` (names the lenses that didn't report), `error` |

Table 6. Closing statuses

An empty change or a lens that didn't report comes back as a status, never as a clean review.
`cr-merge` returns one line per finding with its fix class, `safe`, `structural` or `report-only`, plus an `unowned` list of real problems no rule names and a `security-review` line naming the files left to Claude Code's `/security-review`.

## Files written

| File | Written by | Where |
|---|---|---|
| `scope.json`, `conventions.md`, `standards.md` | `start-cr` or `cr-prepare` | context directory |
| `<lens>.md` | each scanner, through `cr-scan` | context directory |
| `cr-report.md` | `cr-merge` | context directory |
| report and selection file | `start-cr`, before the apply phase | session scratch directory |
| draft review file | `start-cr` in reviewer mode | session scratch directory |
| `<repo>.worktrees/cr-pr-<number>` | `start-cr --pr`, when the checkout isn't at the head | next to the repository |

Table 7. Files a review writes

## Limits

- **It isn't a security audit.** The security lens doesn't scan dependencies, `.env` files, lockfiles or action pinning. Run Claude Code's `/security-review` for those.
- **The rules are written mostly for JavaScript and TypeScript**, and for imperative and object-oriented code. A rule with no counterpart in a language is cleared, not forced.
- **The assumptions lens reads installed dependencies.** In a checkout without them, it uses the main worktree's install when the lockfile pins the same version. Otherwise it falls back to the package's own types, README or changelog, and marks the claim `(verify)` when none of them settles it.
