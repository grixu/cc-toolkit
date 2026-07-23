# Simplicity & types — rules for the simplicity-types lens

Full rule text for the `simplicity-types` scanner (part of the `code-review` plugin). Read
this whole file before judging. When two rules touch the same code, the
most-specific finding wins; when genuinely unsure whether something is a problem,
leave it out.

Each finding gets one **family**, one **rule**, and one **severity**. Grade severity
from the rows below (a finding's severity is the property of its rule, never the
file's overall impression). Severity is exactly one of `high`, `medium`, or `nit` —
never `low`, never a number, even when the rows below happen to show only one of the
three. The orchestrator re-grades centrally against the master table, so your severity
is a first pass.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `simplicity`  | over-complex        | code that collapses into something smaller (duplication → one parameter) | high |
| `simplicity`  | needless-cast       | a type cast the value's type already guarantees | high |
| `simplicity`  | dead-code           | code that can never run or whose result is never used (an unreachable branch, an unread binding) | high |

### `simplicity` family

#### `over-complex` — code that collapses into something smaller (priority)

This is the most valuable finding, so spend the most effort here. Strong models
tend to *expand*: they write function A and function B that do almost the same
thing, differing by a line or two, when one parameterized function would do.
They write five lines where two read better. Hunt for the smaller version.

- **Flag** when:
  - two (or more) functions are near-identical and differ only by a value or a
    single branch — they collapse into one function that takes that difference as
    an **argument**;
  - a block is copy-pasted with small edits — extract the shared shape;
  - code is simply longer or more nested than the idea needs (a chain of
    `if/else` that is a lookup table, a manual loop that is a `map`/`filter`, an
    intermediate variable used once with no clarifying value).
- **Suggested fix**: show the unified version concretely — the merged signature
  with its new parameter and the conditional that absorbs the difference, or the
  shorter expression. Treat this as a real defect, not a nicety: duplication that
  drifts out of sync is a future bug.
- **Calibration → the flag-argument trade-off**: Clean Code also warns that a
  **boolean/flag argument is a smell** — it usually means the function does two
  things. So weigh it: unify when the two bodies are *the same shape* and the
  difference is genuinely *data* (a threshold, a key, a label). Keep them separate
  when collapsing would force a flag that makes one function secretly do two jobs,
  or when the two are *conceptually distinct and likely to diverge* — premature
  DRY that couples unrelated things is its own defect. The goal is the simplest
  code that still reads clearly, not the fewest functions at any cost.

#### `needless-cast` — unnecessary type casts

A cast (`as X`, `<X>`, `x!`, an explicit assertion) says "trust me, the compiler
is wrong." Each one is a place the type system stopped helping. Many casts in
generated or AI-written code are simply unnecessary — the value already has the
type — and a stale one actively hides a bug.

- **Flag** a cast where the value's static type already satisfies the target:
  - in tests, casting a mock/factory result that already returns the right type
    (`createUser() as User` when `createUser` returns `User`);
  - a cast that was needed only because some generated types were stale when the
    code was written, but **are regenerated now** — re-check against the current
    types before deciding.
- **Verify before flagging**: this is a static-type claim. If type diagnostics or
  an LSP are available, use them to confirm the cast is redundant. If you cannot
  verify, mark the finding **(verify)** rather than asserting it — a wrong "remove
  this cast" can break compilation.
- **Suggested fix**: drop the cast; if a narrowing is genuinely needed, prefer a
  type guard or fixing the source type over an assertion.
- **Calibration → not a finding**: `as const`; narrowing `unknown`/`any` at a real
  boundary (`JSON.parse`, an external API, `document.querySelector`); a deliberate
  `as unknown as T` test double where structural typing truly cannot be satisfied
  otherwise; casts that silence a *correct* compiler complaint about a real type
  gap. Casts at genuine boundaries are the type system working as intended.

#### `dead-code` — code that can never run or is never used

Dead code is waste that also misleads: a reader reasons about a branch that can never
execute, or trusts a value nothing consumes. It often marks a real mistake — a guard
meant to fire, a rename that orphaned the old path — so the dead branch is the visible
end of a live bug.

- **Flag** when:
  - a branch is unreachable — a condition always true or always false given the
    surrounding code (nothing sets the field it tests, an earlier `return`/`throw`
    precedes it), so one arm never runs;
  - a binding is computed but never read — a variable, parameter, or import with no use;
  - a function, method, or export introduced by the change has no caller in scope.
- **Suggested fix**: delete the unreachable arm or the unused binding; or, if the code
  was meant to run, name what makes it dead so the real bug (the guard that never fires)
  is fixed rather than the symptom deleted.
- **Calibration → not a finding**: an intentionally exhaustive `default:`/`else` kept as
  a defensive assertion; a public API, route handler, exported hook, or test helper
  whose caller is out of the reviewed scope; a parameter required by an interface or
  signature it must match. Reachability you cannot settle from the change alone is a
  **(verify)**, not an assertion — a wrong "this is dead" deletes live code.
