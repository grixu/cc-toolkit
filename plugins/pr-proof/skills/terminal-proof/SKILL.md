---
name: terminal-proof
description: Capture a masked, reviewed transcript of what a change does when run, a CLI command's output in terminal mode or HTTP requests and responses in api mode, and record it as the branch's terminal or API proof for pr-open. Use when asked for terminal or API proof of a change, or when prepare-proof dispatches it. It never starts, seeds or stops a stack.
---

`/pr-proof:terminal-proof terminal|api [urls] [credentials] [files] [base]`

A **terminal proof** is a transcript of the changed thing behaving as the change says it should, observed by running it: a CLI command and its output (`terminal`), or HTTP requests against the running app and their responses (`api`). Test-runner output is not a proof; test results belong in pr-open's Testing line. The two modes share capture, masking and review. They write separate manifest entries, kind `terminal` or kind `api`, and pr-open shows them as separate proofs.

Read `${CLAUDE_SKILL_DIR}/../../references/rules.md` first. Its rules bind every step below, and it holds the manifest path, the schema, the `jq` write recipe and the agent-caller block.

## Inputs

They come from `prepare-proof` or, run by hand, from the arguments and the conversation. Ask for what is missing; under an agent caller, ask in a `Confirmation needed` block.

- **Mode**: `terminal` or `api`. The kind written is the mode's name.
- **URLs**: the running app's base URL, required when the captured behaviour needs the app (always in `api` mode). You never start, seed or stop a stack. When the URL is missing, ask for it. Do not bring the app up yourself, even when the project's `CLAUDE.md` says how.
- **Credentials**: where they live, as a path or a source, never a value. Read them only inside the script that uses them (rules: **Secrets stay in scripts**).
- **Files**: the diff's files this proof covers. `prepare-proof` passes them. Confirm they match what the transcript exercises, and state any correction in your report. Run by hand, assign them yourself from `git diff --name-only "origin/$base...HEAD"` (or `"$base...HEAD"` when origin has no such branch), keeping only the files the transcript exercises.
- **Base**: `prepare-proof` passes it. Run by hand, use the repository's default branch, `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`. It sets the manifest's `base` only when this run creates the manifest.

Refuse on the default branch or a detached HEAD: the manifest path needs a branch.

The work dir is the manifest's directory, `~/.cache/pr-proof/<repo>/<branch>/`, computed as `references/rules.md` shows. Create it with `mkdir -p`.

## Steps

1. **Plan the capture.** Read the diff and name the behaviour the change makes different: a command, flag, output format or exit code (`terminal`), or an endpoint, status, response shape or error (`api`). Write one sentence that states what the transcript will show; it becomes the entry's `claim`. Do not include behaviour the change left alone. When no behaviour can be observed by running it, write no entry and say so in the report.
2. **Capture** into `<work dir>/<kind>.raw.txt`. Write down each command or request exactly as run (`$ ` before each command; method and URL before each request), followed by its output or its status, the headers the claim needs and the body. Make the run non-interactive and bound it with `timeout <seconds>`. When a request needs credentials, a script in the work dir reads them and sends the request, and the transcript records the request without the credential. Leave out unrelated noise, but never edit what the changed thing printed. A run that fails, or shows behaviour other than the claim, is a finding for the report, not a proof: write no entry.
3. **Mask**: `${CLAUDE_SKILL_DIR}/scripts/mask.sh <work dir>/<kind>.raw.txt <work dir>/<kind>.txt`. A non-zero exit drops the entry.
4. **Review.** Dispatch a fresh subagent, not yourself, to read `<work dir>/<kind>.txt`. Give it the claim and where the credentials live, never their values. It answers two questions: does the transcript hold anything that could be a secret or a personal value the mask missed (a token, key, password, cookie, session id, a credential's value, an email or name of a real person), and does it show the claim? Any doubt drops the entry, and you do not hand-edit the transcript to pass the review.
5. **Clean up** the raw transcript and any credential-reading script. Write each `rm` path literally and absolutely (rules: **Deleting**). When the entry is dropped, delete `<work dir>/<kind>.txt` too.
6. **Write the entry.** Put `{"kind": "<kind>", "claim": "<claim>", "files": [...], "transcript": "<absolute path of <work dir>/<kind>.txt>"}` in `<work dir>/entry.json` and run the `jq` write recipe from `references/rules.md`, with `$base` set from the input above. It replaces only the entry of your kind.
7. **Report**: the mode and kind, the claim, the transcript path, the manifest path, the `files` written and any correction to the ones passed in, and every dropped entry with the reason (the capture failed, the mask exited non-zero, the review had a doubt). Run by hand, add that `pr-open` must run for the proof to appear in the PR.

Only a produced proof enters the manifest. A failure goes to this report and nowhere else.
