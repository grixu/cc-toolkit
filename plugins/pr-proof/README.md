# pr-proof

pr-proof shows that a pull request's change works, in a form a reviewer can check without running the branch.

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

## Skills

Run a skill with `/pr-proof:<skill>`, or describe the task ("record a demo of this PR") and Claude picks the matching skill.

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
