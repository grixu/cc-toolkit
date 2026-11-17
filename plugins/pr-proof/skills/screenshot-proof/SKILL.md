---
name: screenshot-proof
description: Screenshot the screens a branch changed, at the project's breakpoints, from the URL of an app that is already running, have the user approve each shot, and record the approved shots in the branch's proof manifest for pr-open. Takes "before" shots from a base stack's URL on request. Use when asked for screenshots or screenshot proof of a UI change, whether the user asks directly or prepare-proof or another agent dispatches it.
---

`/pr-proof:screenshot-proof [urls] [credentials] [files] [base] [before]`

Read `${CLAUDE_SKILL_DIR}/../../references/rules.md` first. Its rules bind every step below; its manifest section, approval rule and agent-caller section are the ones this skill names.

## Inputs

Settle these from the arguments, or from what `prepare-proof` passes; ask the user for what is missing, and wait:

- **URLs**: the running app's URL. With `before`, also the URL of a stack running at the base.
- **Credentials**: where the test users' credentials live, as a path or a source, never a value.
- **`files`**: the diff's files this entry proves. Run by hand, assign them yourself from `git diff --name-only <base>...HEAD`: the files that change what a screen shows.
- **`base`**: the base branch. Default: the repository's default branch, `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.
- **`before`**: present only when the user or `prepare-proof` asks for before shots.

Never start, seed or stop a stack, not even when no URL answers: ask for the URL instead, or report that the app is not reachable.

Refuse on the default branch or a detached HEAD: the manifest path needs a branch.

Work dir: the manifest's directory, `~/.cache/pr-proof/<repo>/<branch>/`, computed as the rules' manifest section shows. Shots go to `<work dir>/screenshots/`.

## Steps

1. **Screens.** From `files` and their diff, list the screens the change makes look or behave differently, each with a short name and the URL path that shows it. Confirm `files` against the diff: drop a file no screen shows, add a changed file a screen shows, and note each correction for the report.
2. **Widths.** Take the first that applies:
   - `${user_config.screenshot_widths}`, comma-separated pixels, when that text is non-empty and does not still start with `${user_config.`: an unset option reaches this skill literally.
   - The project's breakpoints, read from its styling configuration (Tailwind `theme.screens`, CSS custom media or `@media` breakpoints, the design system's tokens).
   - 375, 768 and 1440.
3. **Tool.** Use `agent-browser` when `command -v agent-browser` succeeds: `set viewport <width> <height>`, `open <url>`, then `screenshot --full <path>`; log in through the page with the credentials as the rules' secrets rule says. Otherwise use Playwright through `pnpm dlx`, as the rules' ephemeral-tooling rule says, pinned to the `@playwright/test` version `${CLAUDE_SKILL_DIR}/../walkthrough-video/templates/pw.sh` names: one script in the work dir that reads the credentials file itself, logs in, and shoots each screen at each width with `page.setViewportSize` and `page.screenshot({ fullPage: true })`. Bound every run with `timeout`.
4. **Shoot.** One PNG per screen and width: `<work dir>/screenshots/<screen>-<width>.png`, with `<screen>` the screen's name in lowercase kebab case. With `before` and a base URL, shoot the same screens and widths against the base URL as `<screen>-before-<width>.png`. With `before` and no base URL, shoot only the after shots and note for the report that the before shots were skipped.
5. **Approve.** Show the user every shot, screen by screen, and ask which to keep, as the rules' approval rule says. A rejected shot enters nothing: delete it as the rules' **Deleting** rule says, ask whether to retake it, and retake it when the user says so. Under an agent caller, end your turn with a `Confirmation needed` block listing each shot's path, and continue when the caller resumes you with the answers.
6. **Write the entry.** When at least one shot is approved, write `<work dir>/entry.json` and add it with the rules' `jq` recipe, with `base` from the inputs:

   ```json
   {
     "kind": "screenshots",
     "claim": "One sentence: what these screens show the change doing.",
     "files": ["src/checkout/Summary.tsx"],
     "media": [
       { "path": "/abs/screenshots/checkout-375.png", "screen": "Checkout", "width": 375 },
       { "path": "/abs/screenshots/checkout-before-375.png", "screen": "Checkout (before)", "width": 375 }
     ]
   }
   ```

   Each approved shot is one `media` item with an absolute `path`. A before shot's `screen` is the after shot's name followed by ` (before)`. With no shot approved, write nothing: a failed or rejected proof stays out of the manifest.
7. **Report**: which tool ran, the widths and where they came from, the screens and their approved shots, the manifest path, each correction to `files`, before shots skipped and why, and any shot left out. Run by hand, add that `pr-open` puts the proof in the PR.
