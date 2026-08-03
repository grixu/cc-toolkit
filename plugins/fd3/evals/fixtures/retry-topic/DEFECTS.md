# retry-topic — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
The fixture is shared by grill-round-shape and grill-numbered-questions (same sandbox shape,
different asserts), grill-no-topic (topic ignored) and build-spec-gate (the command smoke).

## The planted contradiction

`notes/topic.md` claims "The helper currently caps at 3 attempts". The code says otherwise:
`src/retry.ts:1` — `MAX_ATTEMPTS = 5`. This is what the pre-round fact check must find; the
contradiction lives in code so Explore settles it without network. Round 1 is expected to open
with that correction.

## Deliberately open decisions (grilling material)

The topic leaves genuinely open: backoff base delay, multiplier, jitter, a maximum total delay,
and hardcoded-vs-configurable parameters. These feed the numbered questions; each should arrive
with named options and exactly one marked recommendation.

## build-spec-gate

With `ask_user_question: first_option` the run may progress a round or two, but the user never
confirms a closing summary, so the write-spec half must not start: the build-spec-gate assert diffs the
sandbox against this fixture and requires no new `.md` outside `notes/` (and no new files
elsewhere, `.git/` excluded).
