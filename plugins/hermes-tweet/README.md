# hermes-tweet

Claude Code operator guidance for
[Hermes Tweet](https://github.com/Xquik-dev/hermes-tweet), the native
[Hermes Agent](https://github.com/NousResearch/hermes-agent) X/Twitter plugin
for Xquik workflows.

## What it does

This plugin helps Claude Code users install, configure, and operate Hermes
Tweet in Hermes Agent without pasting secrets into chat. Hermes Tweet provides
read-first X/Twitter workflows through `tweet_explore` and `tweet_read`, with
account-changing actions gated behind `HERMES_TWEET_ENABLE_ACTIONS=true`.

## Installation

Install this Claude Code guide from cc-toolkit:

```text
/plugin marketplace add grixu/cc-toolkit
/plugin install hermes-tweet@cc-toolkit
```

Install the Hermes Agent plugin itself:

```bash
hermes plugins install Xquik-dev/hermes-tweet --enable
```

Hermes will prompt for `XQUIK_API_KEY` during an interactive install. For
non-interactive installs, set the key in the Hermes runtime environment or in
`~/.hermes/.env` before calling `tweet_read`.

## Usage

Use the bundled `hermes-tweet` skill when a session needs X/Twitter search,
account reads, trend checks, social listening, launch monitoring, support
triage, creator research, brand research, giveaway audits, community audits, or
controlled publishing from Hermes Agent.

Keep actions disabled unless the workflow explicitly requires posting, DMs,
follows, monitors, webhooks, media changes, extraction jobs, or giveaway draws.

## Links

- Repository: <https://github.com/Xquik-dev/hermes-tweet>
- PyPI: <https://pypi.org/project/hermes-tweet/>
- Hermes Agent: <https://github.com/NousResearch/hermes-agent>
