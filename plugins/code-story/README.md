# code-story

code-story turns a branch, a pull request or a stack of pull requests into a **code story**: a chaptered page that teaches how and why the change works, for a reader who has never seen the codebase. The change is re-cut into the steps it could have been reviewed in. Each chapter answers one question with the lines it is about, and notes are pinned to those lines.

Adapted from [`will-ness-ai/skills` code-story](https://github.com/will-ness-ai/skills/tree/main/skills/code-story) (MIT). This version adds:
- English plus an optional second language in one page;
- built-in dark diagrams instead of mermaid;
- facts that git can answer filled in and checked by scripts rather than typed by the model;
- updates published under the same link;
- stories of whole PR stacks;
- a result line that `dev-kit:pr-open` reads.

## Install

```
/plugin marketplace add grixu/cc-toolkit
/plugin install code-story@cc-toolkit
```

This also installs `anti-slop`, which cleans the prose of every chapter before the page is assembled.

If you used `code-story` as a personal skill before, delete `~/.claude/skills/code-story` after installing, or two skills with the same name compete.

## Requirements

- Node.js 22 or later, for the assemble and check scripts.
- `git`, and the GitHub CLI `gh` logged in, to find the base, the PR and its stack.
- The Artifact tool (claude.ai) to publish. Without it, the story opens as a local HTML file.
- Claude Code 2.1.271 or later, which the settings' option pickers need.

## Usage

```
/code-story:code-story
/code-story:code-story base feature/fup-and-contracts
/code-story:code-story stack @docs/domains/flags/SPEC.md PL-5955 "why the lock in findUserRoles"
```

What happens:

1. The skill measures the branch against the base of its open PR, the nearest stacked PR or the default branch.
2. It reads the diff, the PR and its reviews, the tickets and specs it is given, and the code around the change.
3. It writes one chapter per mechanism, assembles the page, checks it and publishes it.
4. When the branch already has a story, either published earlier in the session or linked in the PR body under `## Code story`, it updates the changed chapters and publishes a new version under the same link.

A new story is private. Share it on claude.ai before its link goes into a PR. With `dev-kit` installed, `/dev-kit:pr-open` asks for a story in a subagent and puts the link into the PR body.

## Settings

Set them in `/plugin` → code-story → configure. The plugin's mod hands them to the skill through the `config` tool.

| Setting | Default | Meaning |
|---|---|---|
| `second_language` | empty | A language tag such as `pl`. Empty means English only. Code names and programming terms stay in English in every language. |
| `gloss_first_use` | `true` | In the second language, a term's first use gets its translation in parentheses. |
| `diagram_skill` | empty | An installed diagram skill, such as `fireworks-tech-graph`. Empty means the built-in diagrams. |
| `uncommitted` | `ignore` | `ignore`: tell the committed change without asking. `include`: add uncommitted changes without asking. `ask`: ask each time. |
| `stack` | `ask` | For a branch in a stack of open PRs: `ask` whether to tell the whole stack, `always`, or `never`. |

A request overrides a setting for one run: "po polsku", `stack`, `no stack`, `uncommitted`. Run as a subagent, where no one can be asked, `ask` means "this branch only" and "leave uncommitted changes out".

## What is in the page

- A chapter rail, back/next buttons and arrow-key navigation.
- An EN / second-language switch that also swaps the diagram labels.
- Diff blocks whose line numbers and line ranges are computed. Every quoted line is checked against the real file at the story's commit.
- Notes that light up the line they explain.
- Built-in diagrams drawn as inline SVG in one dark style, adapted from [fireworks-tech-graph](https://github.com/yizhiyanhua-ai/fireworks-tech-graph) (MIT).
- `<meta name="code-story:*">` with the repository, branch, base and head SHA. This is how an update finds its story.
