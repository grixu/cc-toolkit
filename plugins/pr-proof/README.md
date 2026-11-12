# pr-proof

pr-proof shows that a pull request's change works, in a form a reviewer can check without running the branch. It covers four kinds of proof: a narrated video, screenshots, a terminal transcript and an API transcript. `prepare-proof` decides which kinds a branch needs and produces them; dev-kit's `pr-open` puts them in the pull request.

## Install

pr-proof is a Claude Code plugin. Add the `cc-toolkit` marketplace once, then install the plugin:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install pr-proof@cc-toolkit
```

If you used walkthrough-video as a personal skill before, delete `~/.claude/skills/walkthrough-video` after installing, or two skills with the same description compete for the same requests.

## Requirements

- A web app that runs locally from the checkout, with test users whose credentials live in a file (an e2e credentials file, usually). The skill reads how to start, seed and stop the stack from the project's `CLAUDE.md` files.
- Node.js 22.18 or later and `pnpm`. playwright-recast and `@playwright/test` run through `pnpm dlx`; nothing is installed into the repository.
- `ffmpeg` and `ffprobe` on `PATH`, with libass for burned-in captions.
- `timeout` on `PATH` (on macOS, from coreutils).
- The GitHub CLI `gh` 2.103 or later, logged in, to attach the video to a pull request.
- Optional: the firecrawl MCP server, which the tool check uses to read playwright-recast's release notes; `gh` works for that too.
- Optional: `agent-browser` on `PATH` for screenshots. Without it, `screenshot-proof` uses Playwright through `pnpm dlx`.
- Optional: a TypeSafe API key, a Gemini Developer API key with access to `gemini-decision-1`, or both, for the `proof_signals` tool.

The video and screenshots need the running app; so do API transcripts, and terminal transcripts whose command talks to the app.

## Options

pr-proof asks for these when you enable it. Every one may stay empty.

| Option | Default | What it does |
|---|---|---|
| `typesafe_api_key` | none | TypeSafe API key for `proof_signals`, stored as a secret. Empty falls back to the `TYPESAFE_API_KEY` environment variable; with neither, the tool is not registered. |
| `typesafe_endpoint` | `https://api.typesafe.ai` | Base URL of the TypeSafe API. |
| `typesafe_model` | `jev-1.14.0` | Jev model name or alias, such as `jev-latest`. |
| `gemini_api_key` | none | Gemini Developer API key for Gemini Decision, stored as a secret. Empty falls back to `GEMINI_DECISIONS_API_KEY`, then `GEMINI_API_KEY`. |
| `decision_backend` | `auto` | `auto` uses the backend whose key is set, and with both keys `prepare-proof` asks which to use; `typesafe` or `gemini` uses that one; `both` asks both side by side. |
| `primary_backend` | `typesafe` | With both backends, whose signals `prepare-proof` plans from; the other's stand beside them. |
| `screenshot_widths` | none | Comma-separated viewport widths in pixels, such as `375,768,1440`. Empty uses the project's breakpoints from its styling configuration, or 375, 768 and 1440 when it has none. |

## The proof manifest

Every skill that produces proof records it in one JSON file per branch, `~/.cache/pr-proof/<repo>/<branch>/manifest.json`, where `<repo>` is the origin remote's name and `/` in the branch becomes `%2F`. Each entry holds a kind, a one-sentence claim, the commit it was produced at, the files it proves, and its images, video or transcript. A new entry replaces the earlier one of the same kind and keeps the others. An empty list means the branch needs no proof.

dev-kit's `pr-open` reads the manifest and writes a `## Proof` section into the pull request. The proof reaches the pull request only when `pr-open` runs.

## Tool: `proof_signals`

`mcp__pr-proof__proof_signals` asks a decision model, TypeSafe's Jev or Google's Gemini Decision, which kinds of proof a change needs. It takes `{ base, backend? }`: the branch the change merges into, and the backend the user chose (`typesafe`, `gemini` or `both`). It sends the diffstat and the diff of `<base>...HEAD`, and returns, for each of `screenshots`, `video`, `api` and `terminal`, a signal (`suggest`, `reject` or `uncertain`) with its probability. It also says whether the change affects behaviour at all, which backend and model answered, and how much of the diff it assessed. A failure returns `Proof signals unavailable: <reason>`.

With both keys set and `decision_backend` on `auto`, the tool returns `Backend choice needed: …` without sending anything, and `prepare-proof` asks you. With `both`, the two backends run side by side: the primary backend's signals come first, `comparison` holds each backend's signals (or its error, while the other still answers), and each pair is appended to `~/.cache/pr-proof/compare.jsonl` with the repository, branch, commit and base, never the diff.

The tool exists only when a TypeSafe or Gemini key is set. With neither it is not registered and nothing leaves the machine; `prepare-proof` then judges from the diff alone.

## Skills

Run a skill with `/pr-proof:<skill>`, or describe the task ("record a demo of this PR") and Claude picks the matching skill.

### prepare-proof: plan and produce the proof a branch needs

Use it on a feature branch before opening its pull request:

```
/pr-proof:prepare-proof
/pr-proof:prepare-proof main before
```

`base` defaults to the repository's default branch; `before` asks for "before" screenshots as well. The skill:

1. Refuses on the default branch or a detached HEAD.
2. Calls `proof_signals` when it exists, and otherwise judges from the diff alone.
3. Decides each kind (video, screenshots, terminal, API) or no proof, with a one-line reason. A decision against the backend's `suggest` or `reject` says why; with both backends, a kind they disagree on counts as uncertain.
4. Assigns the diff's files to each kind, then shows you the whole plan once and waits for a yes. With `before`, it also asks where the base comes from: a stack already running at the base, a second stack it starts from a temporary worktree, or neither.
5. Brings up the app's stack when a planned kind needs it, reusing one already up for this checkout. How the stack runs and where the test users' credentials live come from the project's `CLAUDE.md` files.
6. Runs `terminal-proof terminal`, `terminal-proof api`, `screenshot-proof` and `walkthrough-video record-only`, each only when planned. A kind that fails is reported, and the others go on.
7. Records the result in the manifest, reports what it produced and what failed, reminds you that `pr-open` must run for the proof to appear, and asks before stopping any stack it started.

### screenshot-proof: the changed screens at each breakpoint

```
/pr-proof:screenshot-proof
```

It screenshots the screens the branch changed from the URL of an app that is already running, at the widths the Options section describes. You approve each shot; a rejected shot is left out and the skill offers a retake. With `before` and the URL of a stack at the base, it also takes "before" shots, each its own image. It uses `agent-browser` when installed, otherwise Playwright, and says which. Shots go to `~/.cache/pr-proof/<repo>/<branch>/screenshots/`. It never starts, seeds or stops a stack.

### terminal-proof: a transcript of the change running

```
/pr-proof:terminal-proof terminal
/pr-proof:terminal-proof api
```

`terminal` captures a CLI command, script, migration or job and what it prints; `api` captures HTTP requests against the running app and their responses. Both are kept only when they show the changed behaviour, so test-runner output does not count. The transcript, `~/.cache/pr-proof/<repo>/<branch>/<kind>.txt`, is masked for secrets and then reviewed. When in doubt, the skill drops it and says so. It never starts, seeds or stops a stack.

Run by hand, `screenshot-proof` and `terminal-proof` ask for the URLs and where the credentials live (a path, never a value) when you do not pass them, and pick the files their proof covers themselves.

### walkthrough-video: a narrated video of the change

Use it when a reviewer should see a feature work, or to re-record the video after fixes. Pass a feature, a spec path or a pull request, and optionally who watches and what they asked to see:

```
/pr-proof:walkthrough-video 42
/pr-proof:walkthrough-video docs/specs/invites.md "product owner, the invite flow end to end"
```

With a pull request or branch, the video shows what that change made different for a user; without one, the whole feature. A relay of five subagents does the work, each from its own brief, handing over through files only:

1. **Requirements**: one requirement with acceptance criteria per user-visible change, from the spec, the ticket or the code, each marked `stated` or `derived`. In parallel, a **tool check** picks the playwright-recast and Playwright versions to run and checks the machine.
2. **Scenario**: the video's scenes, each mapped to a requirement.
3. **Validation**: a separate subagent checks the scenario against the requirements and the code, and fixes it.
4. **Recording**: starts the stack when nobody else has, records the Playwright test, renders an MP4 with burned-in captions, and reviews its own frames for readable captions, calm pacing and no error toasts. It retakes up to two times.
5. **Report**: the video, then the UX defects and bugs seen on camera, first.

Before the scenario is written, it asks you to confirm every derived requirement and open decision, such as real or staged data. A defect seen on camera is reported, never captioned as a success.

Once you accept the video, it copies it to `~/Downloads/<ticket-or-PR>-<slug>.mp4` and attaches it to the pull request under a `### Video walkthrough` section at the end of the description. A caller that names another place, or attaches the video itself, takes precedence.

The work files live in `~/.cache/walkthrough-video/<repo>/<feature-slug>/`, so a run survives a reboot and resumes after the last finished step. Session state and traces are deleted on delivery, since traces hold session cookies.

What it never does: install packages into the repository, change tracked files, touch another checkout's containers, or create, change or delete data on shared services unless you name the resource. It stages such data in the browser instead.

Another agent can dispatch it. Questions for you then go back to that agent as a `Confirmation needed` block, and the report includes the recorder's agent id for retakes.

With `record-only`, which `prepare-proof` passes, the skill records on the caller's stack and never starts or stops it. Once you accept the video it reports the MP4's path and the files it covers instead of copying it to `~/Downloads` and attaching it, and the video reaches the pull request through the manifest and `pr-open`.

Every pr-proof skill can be dispatched this way: its questions, including `prepare-proof`'s plan and each screenshot approval, go back to the calling agent as `Confirmation needed` blocks.
