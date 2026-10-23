# Correctness — rules for the correctness lens

Full rule text for the `correctness` scanner (part of the `code-review` plugin). Read
this whole file before judging. When two rules touch the same code, the
most-specific finding wins.

This lens asks one question of the change: **does the code do what it evidently
means to do?** The craft lenses judge how the code reads; this one judges whether it
behaves — the wrong comparison, the case nothing handles, the error that vanishes.
What the code *means to do* comes from the code itself: its names, its callers, its
tests, its types, and the `<spec>` slot when a spec was given. A finding names the
input or state that takes the wrong path and what happens on it.

Report what you find; the filter runs after. Judge each site against the rules,
then against that rule's own calibration paragraph — the look-alike that is *not* a
violation. A site the calibration clears is a non-finding. A site you cannot settle
either way belongs in `CANDIDATES`, not in the bin: whoever merges the review
decides it with everything in view, and a rejected candidate costs one line in
`Not flagged` — an unreported one costs the finding.

**A suggested fix is one clause, never a code block.** Name the symbol, the
condition, or the case — "compare with `>=` so the last page is fetched", "add the
`'refunded'` arm to the `switch`", "rethrow after logging in `syncOrders`". The
surface that renders your findings has no room for a rewritten body or a
before/after block.

Each finding gets one **family**, one **rule**, and one **severity**. Grade severity
from the rows below (a finding's severity is the property of its rule, never the
file's overall impression). Severity here is exactly one of `high` or `medium` —
never `nit`, never `low`, never a number: code that does the wrong thing is never a
cosmetic matter. The orchestrator re-grades centrally against the master table, so
your severity is a first pass.

## Contents
- `correctness` — wrong-condition, unhandled-case, off-by-one, swallowed-error,
  state-race, contract-mismatch

Every rule below carries its **Flag** conditions, a **Suggested fix**, and a
**Calibration** paragraph naming the look-alike that is *not* a violation.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `correctness` | wrong-condition   | a comparison, boolean or null check that selects the wrong branch for an input the code must handle | high |
| `correctness` | unhandled-case    | a value the input can take — an enum member, an empty/absent value, an error result — that no branch handles, so it falls into a wrong default | high |
| `correctness` | off-by-one        | a bound, index, slice or loop limit one step off, dropping or repeating the first or last element | high |
| `correctness` | swallowed-error   | an error caught, ignored or turned into a success value, so the caller proceeds on a failure it never sees | medium |
| `correctness` | state-race        | shared state read and written across an `await`, callback or concurrent caller with no ordering, so a second caller sees or overwrites a half-done update | high |
| `correctness` | contract-mismatch | a call that breaks what the callee declares — argument order or unit, a nullable return used as present, a promise not awaited, a mutated input the caller still uses | high |

### Prove the wrong path — the discipline for the whole lens

- **A finding names the input and the outcome.** "`page === total` skips the last
  page", "a `'refunded'` order reaches the `default:` and ships" — never "this looks
  fragile" or "might not handle edge cases". A finding you cannot state as *this input
  → this wrong result* is not a finding yet.
- **Read before you claim.** You have `Read` and `Grep`: open the callee's signature,
  the type's members, the caller that feeds the value. A fact that still needs a run,
  a database or the network to settle is `(verify)`; you never run the code.
- **Intent comes from the code and the spec, not from taste.** A behaviour the spec,
  a test, or a documented convention asks for is the intended one even if you would
  have chosen otherwise. When the `<spec>` slot is filled and the code's behaviour
  differs from a spec line, that is a `spec` · wrong-implementation — `HANDOFF` it,
  not a correctness finding.
- **A spec focus says which part of the spec is intent.** When the `<spec>` slot carries
  focus codes (element codes like `DB-1`, decision ids), read those elements and decisions
  first and judge the change's intended behaviour against them; read the rest of the spec
  only for material they reference or that the diff clearly touches.
- **Readability is not correctness.** A tangled but correct condition belongs to the
  craft lenses; send it as a `HANDOFF` if you notice it, and judge only whether it is
  right.

#### How to state a finding

```
`correctness` · rule · severity · `path:L<lines>` — <the input or state, and the wrong result it gets> → <the fix, as a clause>
```

- `` `correctness` · off-by-one · high · `src/export/pager.ts:L31` — with `total` pages the loop stops at `page < total - 1`, so the last page is never fetched → loop while `page < total` ``
- `` `correctness` · swallowed-error · medium · `src/sync/orders.ts:L58` — a rejected `pushOrder` is caught and logged, then `syncOrders` returns `{ ok: true }` and the job is marked done → rethrow after logging, or return the failure to the caller ``

### `correctness` family

#### `wrong-condition` — the branch picks the wrong path

- **Flag** when, for an input the code must handle, the condition selects the
  other branch: an inverted comparison (`<` for `<=`, `!==` for `===`), `&&` where the
  meaning needs `||`, a truthiness check that treats a valid `0`/`''`/`false` as
  absent, a negation applied to the wrong operand, a check against the wrong field.
- **Suggested fix**: name the corrected condition and the input it now handles.
- **Calibration → not a finding**: a condition whose "wrong" input cannot reach it
  (the type, an earlier guard or the caller's contract excludes it — read it before
  deciding); a truthiness check on a value whose falsy members are all invalid; a
  condition a test pins with the exact input you suspect.

#### `unhandled-case` — a value no branch handles

- **Flag** when the input can take a value no branch handles and the fallthrough is
  wrong: a `switch`/`match` over an enum or union missing a member and defaulting to
  a behaviour that member must not get; an empty list, `null`/`undefined`, or missing
  key that the code dereferences or treats as a hit; a result type's error arm never
  checked.
- **Suggested fix**: name the missing case and what it should do — its own arm, an
  early return, or an explicit error.
- **Calibration → not a finding**: an exhaustive `default:` that throws or asserts
  (the defensive assertion is the handling); a member the type system already forces
  every `switch` to cover; a value the caller's contract rules out, read and confirmed.

#### `off-by-one` — a bound one step off

- **Flag** when a loop limit, slice end, index, range or pagination bound drops or
  repeats the first or last element: `<` vs `<=` against a length or count,
  `length` used as an index, an inclusive/exclusive mix-up between two APIs, a page
  counter starting at 1 against a 0-based offset.
- **Suggested fix**: name the corrected bound.
- **Calibration → not a finding**: a bound that matches the API it feeds (read the
  callee's convention); an intentional skip a name or test states, like a header row.

#### `swallowed-error` — a failure the caller never sees

- **Flag** when an error is caught and dropped, logged and then reported as success,
  replaced with a default the caller cannot tell from real data, or a promise is left
  floating so its rejection goes nowhere — and the caller goes on to act on the
  failed step.
- **Suggested fix**: rethrow, return the failure in the result type, or name the
  caller that must check it.
- **Calibration → not a finding**: a best-effort side task whose failure must not
  stop the main path (telemetry, a cache warm-up, a cleanup) where a comment or name
  says so; a catch that converts to the project's own error type and rethrows; an
  error the function's contract documents as returned as a value.

#### `state-race` — a half-done update another caller can see

- **Flag** when the change reads shared state, awaits or yields, then writes it back
  on the stale read (a check-then-act across an `await`, a read-modify-write on a
  module-level map or a database row with no transaction, lock or conditional
  write), or two concurrent callers can interleave on the same key with no ordering.
- **Suggested fix**: name the atomic form — a transaction, a conditional update, a
  lock, or moving the read after the await.
- **Calibration → not a finding**: state owned by one request or one call;
  a single-threaded section with no `await` or callback between the read and the
  write; an update the store makes atomic itself (an `UPDATE … SET n = n + 1`, an
  upsert). Concurrency you cannot establish from the code is `(verify)`.

#### `contract-mismatch` — a call that breaks the callee's promise

- **Flag** when a call site contradicts what the callee declares: arguments swapped
  or in the wrong unit (seconds for milliseconds), a nullable or optional return used
  as always present, an async call not awaited where its result or failure matters,
  an input the callee mutates still used by the caller as if untouched, a return
  value whose meaning (index vs count, inclusive vs exclusive) is read the other way.
- **Suggested fix**: name the corrected call, the await, or the check on the return.
- **Calibration → not a finding**: a type the checker already proves (a non-null
  return, a sync function); a fire-and-forget call that is the documented intent;
  a mismatch only in a test double. A signature outside the scope you could not read
  is `(verify)`.
