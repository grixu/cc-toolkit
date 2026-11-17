# Leg 1c: repo profile

Write `repo-profile.md` in the repo dir (the work dir's parent, `~/.cache/walkthrough-video/<repo>/`): how this repository's app runs, logs in and looks on screen, so every later walkthrough here starts from it instead of rediscovering it. The orchestrator dispatches you only when the file does not exist yet; the recorder corrects it after each good take. Never write a secret's value into it: credential files, env files and tokens are named by path and key only.

## Project skills first

Before reading docs or scripts, list the skills the project defines: every `SKILL.md` under `.claude/skills/` in the checkout, and the skills in your session's skill list that come from plugins the project enables in its `.claude/settings.json` (`enabledPlugins`). Read each one's description.

For each job below, when one of those skills does it, record the skill's name and how to invoke it with what arguments, and stop searching for that job: the project's own skill is how its owners do it, and beats anything you could reconstruct from scripts. Search the usual way only for the jobs no skill covers.

- start the stack, and stop it;
- pull the environment;
- seed or reset local data;
- log a test user in;
- run the e2e tests.

## Find the rest

For each job without a skill, read the checkout's `CLAUDE.md` files, its README and docs, `package.json` scripts, compose files and the e2e setup. Cite where each answer came from (`file:line`). When a stack for this checkout is already up (your dispatch gives its URLs), confirm what you can against it: the login request succeeds, the toast selectors match a real toast. Otherwise record what the code says and mark it `from code`.

## Record

- **Checked**: date, the checkout's commit, and whether answers were confirmed live or read from code.
- **Project skills**: one row per job above: the skill and how to invoke it, or `none`.
- **Stack**: the start command in its detached form, where to read the URLs and ports it actually took (an env file, an output line) and why the defaults cannot be assumed, the health URLs, the stop command.
- **Environment**: the env-pull script, and which variables it fills, by name.
- **Seed**: the init or seed script, what state it leaves, how to tell the state is there (users log in, key data exists), roughly how long it takes.
- **Credentials**: the file's path, and which key names belong to which persona.
- **Login**: the API endpoint and request shape, and what proves a session (a cookie, a token in storage), so the `setup` project can write `storageState`.
- **On screen**: the selectors for a success toast and an error toast (a selector that matches nothing makes the no-error check pass on every take), the overlays to dismiss in `prepare` (consent banner, release notes, dev-tools pills) with their selectors, and anything collapsed by default.
- **Shared services**: local actions whose writes reach a shared or external service, and the endpoint globs to block.
- **Feature flags**: how a flag is turned on locally.
- **E2E**: page objects and tests worth mirroring for selectors (they are a source, never imported).
- **Unconfirmed**: everything above you could not confirm, with what would confirm it.

## Finish line

Every section holds an answer with its source, or `none found` with where you looked, and every job names a project skill or the method you found. Return at most 10 lines: the project skills found and the jobs they cover, how the stack starts, what was confirmed live, and what stays unconfirmed.
