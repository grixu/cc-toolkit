# fd3

Spec-driven delivery, end to end: grill a topic until its design tree is settled, write the
decisions up as a spec and validate it against the actual repositories, split that spec into
dependency-ordered task files, and implement them in isolated worktrees with batched validation.

Each stage hands the next a file, never a conversation — closing notes, then a spec, then a
directory of task files. Any stage can be run on its own, and a run interrupted halfway resumes
from those files alone.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install fd3@cc-toolkit
```

## Commands

| Invocation | Description |
|---|---|
| `/fd3:build-spec <topic>` | The three stages that produce a validated spec: grill the topic, write it up, then validate the result — up to three validation passes |
| `/fd3:implement <tasks dir>` | Mass-implement a directory of split tasks and propose the pull requests |

## Skills

| Invocation | Description |
|---|---|
| `/fd3:grill-topic <topic>` | Grill a topic, plan, decision or idea round by round until the design tree is settled |
| `/fd3:split-to-tasks <spec>` | Split a validated spec into task files — one task per worktree, grouped onto shared branches by the spec's rollout gates |
| `/fd3:implement-tasks <dir>` | Dependency-ordered implementation waves, batched per-repository validation, human-in-the-loop only where a task demands it |

`write-spec` and `validate-spec` are model-invocable only: `/fd3:build-spec` dispatches them, each
in its own context, so their reading never fills the conversation the grilling happens in.

## Sub-agents

| Agent | Purpose |
|---|---|
| `fd3:researcher` | Answers a research question from documentation and external sources |
| `fd3:toolchain-scout` | Detects how a repository is validated — build, typecheck, lint, test — and returns a runnable command list |

Both are dispatched by the skills, never by the user.

## Workflows

`implement-tasks` drives two dynamic-workflow scripts: `implement-run.js` (waves, merges, then CI
and code review per target branch) and `repair-run.js` (applies human decisions to existing
branches and re-validates with CI only). The skill owns the conversation; the workflows own
everything between launch and report.

## Usage

```
/fd3:build-spec our retry strategy for the payment webhook
/fd3:split-to-tasks docs/specs/retry-strategy.md
/fd3:implement docs/specs/tasks
```

Grilling asks the whole current frontier of the design tree at once, with a recommended answer per
question, then waits for your answers before recomputing the frontier. Facts are looked up by
sub-agents — the decisions stay yours. Nothing is pushed without your explicit consent.

## Relationship to `feature-delivery`

fd3 is a third take on the ground the `feature-delivery` plugin covers, rebuilt around skills and
dynamic workflows rather than commands and shell scripts. The two share no code, no commands and no
file formats, so their artefacts are not interchangeable — run a given project through one or the
other, not both.
