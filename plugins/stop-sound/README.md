# stop-sound

A sound when Claude needs you, and silence when it doesn't.

A plain `Stop` hook with `afplay` chimes far too often. The main session ends its turn every time it
waits for background subagents, then wakes up and ends it again as each one reports back, so you
hear a chime for every subagent that finishes. This plugin chimes only when you are the one Claude
is waiting for:

| Moment | Sound |
|---|---|
| The main session ends its turn and nothing in the background will wake it | `done`: two falling notes |
| Claude asks you a question (`AskUserQuestion`) or presents a plan (`ExitPlanMode`) | `question`: three rising notes |
| The session ends its turn while a subagent or teammate is still running | none |
| A subagent finishes | none |
| You interrupt the turn yourself | none |

## Requirements

- Claude Code with mods turned on; tested on 2.1.322. On a Team or Enterprise plan, an admin
  setting such as `allowManagedModsOnly` can turn off mods you install, and then nothing plays.
- macOS. Claude Code plays the clips with `afplay`; a Linux or Windows terminal has no player, so
  nothing plays.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install stop-sound@cc-toolkit
```

Run `/reload-plugins` if the install summary asks for it.

If you already have your own `Stop` hook that plays a sound, remove it from `settings.json`, or you
will hear both.

## Configuration

Both sounds can be replaced with your own file in `/plugin` → stop-sound → configure, or under
`pluginConfigs` in `settings.json`:

| Option | What it does |
|---|---|
| `stop_sound` | Sound file played when the session ends its turn |
| `question_sound` | Sound file played when Claude asks a question or presents a plan |

Files may be `.wav`, `.mp3`, `.aiff`, `.m4a` or `.ogg`, up to 4 MiB. Leave an option empty to keep
the bundled sound. If a file is missing or has another extension, the bundled sound plays instead.

## How it decides

The plugin is a mod. At the end of every turn it checks three things:

1. The turn ran in the main session, not inside a subagent.
2. You did not interrupt it.
3. No subagent or teammate in `$.agent.list()` is still `running`, `pending` or `waiting`. Claude Code wakes
   the session again when such an agent reports back, so this stop is only a pause.

It uses the end of the turn rather than the `Stop` hook event. On Team and Enterprise plans, Claude
Code's built-in guard skips the `Stop` hooks of mods you install, but it lets the end of a turn
through.

Two kinds of background work do not keep it silent, so you still hear a chime when Claude ends its
turn to wait for them:

- **Workflows.** Their agents are not listed by `$.agent.list()`. You hear one chime when Claude
  starts waiting for a workflow and another when it finishes.
- **Background shell commands**, such as a build or `gh run watch`.

## Development

```
claude plugin validate plugins/stop-sound
claude plugin test plugins/stop-sound
```

The bundled sounds in `sounds/` are original sine-tone chimes generated with `ffmpeg`, released
under the repository's MIT license.
