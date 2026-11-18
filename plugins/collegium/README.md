# collegium

Hands a piece of work to another coding agent and model, such as OpenAI Codex, and brings its result back to Claude Code. Codex stays off until you turn it on.

## Requirements

- Claude Code 2.1.327 or later, with mods turned on. Collegium reads its data folder through
  `$.process.hookEnv()`, which older versions lack. On a Team or Enterprise plan, an admin setting
  such as `allowManagedModsOnly` can turn off mods that you install.
- The [OpenAI Codex CLI](https://github.com/openai/codex) on your `PATH`; tested with 0.169.0.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install collegium@cc-toolkit
```

## Enabling Codex

Codex is off by default. Turn it on with `/plugin configure collegium`. Turning it on sends the task and the code Codex reads to OpenAI.

## Usage

<!-- Configuration file, tools contract and the run skill: filled in with the full README. -->
