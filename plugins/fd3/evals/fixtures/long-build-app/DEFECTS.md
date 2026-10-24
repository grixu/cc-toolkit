# long-build-app — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it, and `SETUP.sh`, from the
sandbox copy.

Serves `implement-ci-waits-long-command` (mode M2: a gate agent returns while a backgrounded build
still runs). The sandbox's git root is `app/`; `SETUP.sh` then:

1. creates `feat/queue-status` from `main` and its worktree at `app.worktrees/feat-queue-status`
   (beside the repo, where implement-run.js puts unit worktrees);
2. copies `branch/` into that worktree and commits it — the task's work, `src/status.sh`;
   `branch/` itself is removed from the sandbox;
3. writes the branch head to `.sandbox/.origins/implement-ci-waits-long-command/branch-head`,
   outside the sandbox, for the check;
4. replaces `@@SANDBOX@@` in the task file's `repository:` with the sandbox path.

The task file sits in `tasks/`, outside the git root, so the runner's done-marking never shows up in
`dirty`.

The toolchain report and baseline are workflow arguments built in `lib/implement-scenarios.mjs`,
not files: command 1 `sh scripts/lint.sh` (passes in a second), command 2
`sh -c 'sleep 200; echo built'` — 200 s, past the Bash tool's 2-minute default timeout, the stand-in
for the `docker build` that went to the background in the traces. Both pass on the baseline. The
report states no duration on purpose: a scout report does not either.

The assertions: structured output with `passed: true`, `failures: []`, no `incomplete` entry and no
skipped command; `head` equals the worktree's `git rev-parse HEAD` (= `branch-head`); `dirty` empty
or porcelain lines only; no value says a command is still running or unfinished; and the call's
latency is at least 200 s — a verdict returned sooner cannot have seen the build's exit line.
