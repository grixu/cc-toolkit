# CLAUDE.md — tester plugin conventions

Guidance for editing the `tester` plugin. The root `CLAUDE.md` still applies; this file covers
what is specific to tester's prompt layer. These conventions match `plugins/fd/CLAUDE.md` on
purpose — one marketplace should not carry two prompt dialects.

## What the prompt layer is

tester ships no skills. Its prompt surface is three directories with different rules:

- `commands/run.md` — the one executable prompt, `disable-model-invocation: true`. It runs in
  the user's main thread and owns every HIL, every consent gate, and the triage.
- `agents/` — the three suite executors (`api`, `ui`, `fault`). Each runs in a **fresh context
  that never sees the command or its references**, so a rule an executor must follow belongs in
  the agent definition even when `run.md` states it too. That duplication is correct and must
  survive any cleanup pass.
- `references/` — blocks loaded by name at their point of use. Both exceed 100 lines and
  therefore carry a Contents block at the top.

## Deduplication rule

Deduplicate only where both copies land in **one** context. `run.md` telling the main thread to
read `FAULT_INJECTION.md` and then restating that file's three-rung ladder was real waste, and
was collapsed to the decision rule plus the pointer. An agent definition restating a `run.md`
hard rule is not waste — see above.

## Vocabulary

Three verbs, defined at the top of `run.md`: **block** (a gate refuses), **halt** (the run
cannot proceed), **HIL** (a question to the human via `AskUserQuestion`). Not `refuse`,
`hard refuse`, or `STOP`.

A check's outcome is a separate axis and never one of those verbs: `PASS`, `FAIL`, `BLOCKED`,
`ERROR`, `SKIP`. Write it in backticks in prose — `block` the gate action and `` `BLOCKED` ``
the verdict collided constantly before this rule.

## Emphasis

Two legitimate uses of bold and nothing else: a **lead-in label** starting a bullet or step
(list structure, not emphasis), and a **binary gate or irreversible action** mid-sentence.
Everything else is plain prose — intensifiers (`only`, `never`, `fresh`, `one`), descriptive
noun phrases, and things merely being named do not get bold.

ALL-CAPS is for literal artifact values only: verdicts (`PASS`/`FAIL`/`BLOCKED`/`ERROR`/`SKIP`),
table section labels the executors emit (`SUITE`, `NOTES`, `TEARDOWN`, `LEDGER`), HTTP verbs.
Not `NEVER`, `ALWAYS`, `ONLY`, `PROVE`, `STRICT`.

Measured after the Opus 5 pass — check a file by counting bold spans per line, and check *what*
carries them, which matters more than the ratio:

| File | bold/line | mid-sentence bold |
|---|---|---|
| `commands/run.md` | 0.12 | `block`, `halt`, `HIL`, `Teardown is mandatory` |
| `agents/*.md` | 0.13–0.15 | only `Prove the fault is active` (fault) |
| `references/*.md` | 0.06–0.09 | only `Session isolation is mandatory` |

The pre-pass ratios were 0.19–0.23 — in line with `fd`, so density was never the defect. The
defect was that ~92 mid-sentence bolds were intensifiers rather than gates.

## Rationale in prompts

State the constraint that makes a rule true; leave out how it was discovered. A prompt's stated
rationale is load-bearing — the model acts on it. Step 5 used to assert that a backgrounded
subagent's table "never reaches the main thread"; it does, inside the completion notification's
`<result>` block. The run still finished, but it spent three `ScheduleWakeup` heartbeats waiting
for deliveries already in its context. A wrong *why* buys wasted work even when the *what*
survives.

## Where verification belongs

This plugin's product *is* verification, which makes the Opus 5 guidance about removing
verification instructions dangerous to apply naively here. The distinction, stated in `run.md`
under Working rules: gates over artifacts and over **other agents' output** — command proof per
row, proving a fault fired, independently confirming stack health after the fault suite,
cross-checking evidence against its stimulus window — are the product and are never softened.
Re-checking the command's **own** reasoning is the thing Opus 5 does natively and should not be
prompted for. Do not delete the former while trimming the latter.

## Model routing

`api` and `ui` run on `sonnet`; `fault` inherits the session model. The two downgraded surfaces
execute a brief that has already resolved every ambiguity — the checks, the personas, the
commands and the expected outcomes are decided before dispatch. `fault` is the one executor that
perturbs a shared stack and whose failure mode is leaving that stack broken, so it keeps the
session model.

The evidence is one run per variant, on `claude-opus-5`, against the same fixture:

| | recall | false positives | safety | opus output tokens | opus cache reads | wall clock |
|---|---|---|---|---|---|---|
| all `inherit` | 4/4 | 0 | clean | 86.3k | 2.96M | 19m 06s |
| `sonnet` on api + ui | 4/4 | 0 | clean | 42.0k | 1.41M | 12m 10s |

Tokens, not dollars: promptfoo logs `Using unknown model for Claude Agent SDK: claude-opus-5` and
then prices the run at Opus 4.5 rates, so its `costUSD` is a fallback estimate and reads about a
third of what the same usage costs at Opus rates. The token columns come from the API and are the
only spend figures here worth quoting.

Read that as no regression in a single run, not as confirmation. Both variants saturated the
metric at 1.0 — every defect then planted was one-line and source-visible, so the fixture could
only catch a downgrade bad enough to lose a defect or invent one. The sonnet executors returned
well-formed tables under the assertion contract, and both variants' standout extra findings came
from the main thread and the fault suite, which are the session model in both arms.

The fixture has since been hardened in both directions rather than re-run: D5 is a
recall-discriminating defect (a PDP-error misclassification that only shows when a run drives
both fault shapes on one route and compares — the shape real runs actually miss), and AC-10 is a
precision-discriminating correct behaviour (a documented audit read window whose convenient
API-only check looks like lost data; condemning it is a false positive). Recall is scored per
defect id against the enlarged key, so the runs in the table above now replay as 4/5. Whether
the new items separate model tiers is a hypothesis until a paid run lands on this fixture — no
run has been scored against D5 or the AC-10 trap yet. Replicates of a saturated metric still buy
nothing; if the next A/B saturates again, harden further before rerunning.

## Evals

`evals/` is a promptfoo suite that runs `/tester:run` against a purpose-built two-container app
with five planted defects and one oracle-trap correct behaviour; see `evals/README.md`. It is
dev tooling, not shipped runtime.

```bash
pnpm eval:tester            # full run (needs Docker; agent-browser optional)
pnpm eval:tester:fixture    # reset + verify the fixture only, no tokens
```

The answer key lives outside `evals/fixtures/target-app/` so the agent under test never reads it
while deriving suites, and `verify-fixture.mjs` fails the reset if the app drifts from the key.
Two scores come back: safety invariants (a gate) and verdict quality (recall on the planted
defects, false positives on correct behaviour).

Verdicts are read from the tables the executors return, not from the orchestrator's closing
report — the return contract in `agents/*.md` pins that format, so it parses deterministically,
while the report is prose and produced five distinct false-positive modes before being demoted to
a secondary signal. Changing the return contract's table therefore changes the eval: run
`pnpm eval:tester:replay` after touching it.

Runs cannot overlap — one stack on fixed ports, so `reset-sandbox.sh` refuses while another eval
is live. Do not work around this: two concurrent runs corrupt each other's store and each other's
fault injection, and neither result is worth reading.

When a run reports a defect the key does not carry, check the spec before assuming the run is
wrong. That has already happened once and the run was right both times over: it named the
criterion, quoted the line, and produced a discriminating experiment. A key that scores a correct
finding as a false positive is worse than no key.
