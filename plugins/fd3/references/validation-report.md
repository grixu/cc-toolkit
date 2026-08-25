# Validation report

The shape `validate-spec` returns its verdict and its status in.

```markdown
## Run
spec: <path relative to the repository root>
pass: <n>
repositories:
- <remote name> — <branch> @ <commit> — fetched <date>

## Verdict
<ready | not ready> — <one sentence on what decides it>

| Phase | Ready | What holds it |
|---|---|---|

## Checks
| # | Check | Result |
|---|---|---|
| 1 | decisions do not contradict | pass (unchanged) |
| 2 | scope covers every decision | fail — section 10, <the finding> |

## Still open
- <finding or claim> — <section> — <what would close it> — blocking | non-blocking

## Deferred
- <claim> — <section> — owner: <who> — placement: <gate, ticket or substitute>

## Blocked
- <claim> — <section> — <what nobody could settle> — no further pass closes this

## Not validated
- <repository> — unavailable locally, so its references went unchecked

## Spec edits applied
- <section> — <what changed, and which finding forced it>
```

A finding about an element cites the element's code; a finding about the document anchors to a
section, on the terms `spec-rules.md` sets.

A `Result` cell reads `pass (unchanged)`, `pass (was fail — <what closed it>)`, or `fail —
<section>, <the finding>`. It is the only thing by which the caller can tell that an iteration
moved, so a check whose answer changed says so where it changed.

What the next pass needs from this one is what is still open; what is blocked is not — no later
pass closes it. The durable record of what a pass found and closed is the spec's own dated
evidence block, not this return.

For an unphased spec, replace the phase table with one word — `ready` or `not ready`. A `deferred`
claim bounds the phase it gates; it never makes the document not ready. Drop any section that
would be empty, and keep the return to the length its contents need — it travels through the
caller's context, and every line of it costs there.
