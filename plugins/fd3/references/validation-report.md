# Validation report

The shape `validate-spec` reports its verdict in.

```markdown
## Verdict

<one sentence on what decides it>

| Phase | Ready | What holds it |
|---|---|---|
| 1 | yes | — |
| 4 | no | <the finding, or the gate it waits on> |

## Checks
| # | Check | Result |
|---|---|---|
| 1 | decisions do not contradict | pass |
| 2 | scope covers every decision | section 10 — <the finding> |

## Blocking findings
- <finding> — <spec section> — <what would close it>

## Closed during this run
- <finding> — <spec section> — closed by: <the answer or fact that settled it>

## Non-blocking findings
- <finding> — <spec section>

## Deferred
- <claim> — <spec section> — owner: <who> — placement: <gate, ticket or substitute>

## Blocked
- <claim> — <spec section> — <what nobody could settle>

## Not validated
- <repository> — unavailable locally, so its references went unchecked

## Claim status
| Section | Verified | Deferred | Open | Blocked |
|---|---|---|---|---|
| 5.1 | 11 | 0 | 0 | 0 |

## Spec edits applied
- <section> — <what changed, and which finding forced it>
```

A finding about an element cites the element's code; a finding about the document anchors to a
section written as "section N" — never the `§` symbol.

A finding you found and closed in this same run belongs under **Closed during this run**, not
deleted: the phase table then reads `yes`, and the record still shows the spec was not
implementable as written. Only then may the blocking section be dropped as empty. Mechanical
corrections — citation fixes and their kin, each already enumerated under **Spec edits applied** —
aggregate into one **Non-blocking findings** bullet instead; **Closed during this run** is for
findings that would have blocked.

For an unphased spec, replace the phase table with one word — `ready` or `not ready`. A `deferred`
claim bounds the phase it gates; it never makes the document not ready. Drop any section that
would be empty, and keep the report to the length its findings need.
