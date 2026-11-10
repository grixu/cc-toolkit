---
title: code-review
description: Reviews a code change with parallel reviewers, one per lens, and merges their findings into one report grouped by file.
---

code-review reviews a code change with up to eleven focused reviewers running in parallel. It merges what they find into one report grouped by file. A short menu then asks which fixes to apply, and nothing is edited until you choose.

## Install

```
/plugin install code-review@cc-toolkit
```

code-review needs Python 3 and git.

## What it does

| Command or skill | What it does |
|---|---|
| `/code-review:start-cr` | Runs one reviewer per active lens over your change, merges the findings into one per-file report, and offers an apply menu sorted by risk. You start it yourself. |
| `/code-review:comment-review` | Reviews comments only, with a single reviewer. Each comment gets a verdict: `KEEP`, `REMOVE`, `REWRITE`, `MOVE`, or `ADD`. |
| `/code-review:quality-review` | Reviews code craft only, with a single reviewer: readability, structure, naming, object design, and needless complexity. |

`comment-review` and `quality-review` also start on their own when you ask for a comment review or a quality review in plain words.

You don't pick lenses; the change decides. Comments, readability and tests, naming and module, objects and patterns, simplicity and types, correctness, security, coherence, and assumptions run on any code change. Performance runs when the change includes executable source. Spec runs when you name a spec or accept the one the change carries.

The internal skills `cr-prepare`, `cr-scan`, and `cr-merge`, and the `scanner` agent, split the review into steps for automated workflows such as fd3's; you don't run them.

## Usage

- Review the current branch's changes:

  ```
  /code-review:start-cr
  ```

- Review specific files or directories in full:

  ```
  /code-review:start-cr src/auth.ts src/billing/
  ```

- Measure the change against another base branch, or also check it against a local spec:

  ```
  /code-review:start-cr --base develop
  /code-review:start-cr --spec docs/feature.md
  ```

- Review a GitHub pull request against its base:

  ```
  /code-review:start-cr --pr 42
  ```

  On someone else's pull request, it applies nothing and drafts review comments instead.

## Options

| Option | What it does |
|---|---|
| `--base <branch>` | Sets the base branch. Without it, the review tries the upstream branch, `origin/main`, `origin/master`, `main`, then `master`. |
| `--spec <path>` | Adds the spec lens for a local spec file. URLs and ticket IDs aren't accepted. |
| `--pr <number>` | Reviews a GitHub pull request's head against its base, using `gh`. |
| `CODING_STANDARDS.md` | Explicit rules in this file at the repository root become `standards` findings. A gitignored `CODING_STANDARDS.local.md` beside it overrides it. |

The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/code-review/README.md) has every option, the full lens table, and an example report.
