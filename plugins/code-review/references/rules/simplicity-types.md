# Simplicity & types — rules for the simplicity-types lens

Full rule text for the `simplicity-types` scanner (part of the `code-review` plugin). Read
this whole file before judging. When two rules touch the same code, the
most-specific finding wins.

Report what you find; the filter runs after. Judge each site against the rules,
then against that rule's own calibration paragraph — the look-alike that is *not* a
violation. A site the calibration clears is a non-finding. A site you cannot settle
either way belongs in `CANDIDATES`, not in the bin: whoever merges the review
decides it with everything in view, and a rejected candidate costs one line in
`Not flagged` — an unreported one costs the finding.

**A suggested fix is one clause, never a code block.** Name the symbol, the move, or
the constant — "name `SECONDS_PER_DAY`", "collapse into `discountFor(tier)` and call
it at each site", "drop the `as User` cast". The surface that renders your findings
has no room for a rewritten body, a merged function, or a before/after block.

Each finding gets one **family**, one **rule**, and one **severity**. Grade severity
from the rows below (a finding's severity is the property of its rule, never the
file's overall impression). Severity is exactly one of `high`, `medium`, or `nit` —
never `low`, never a number, even when the rows below happen to show only one of the
three. The orchestrator re-grades centrally against the master table, so your severity
is a first pass.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `simplicity`  | over-complex        | duplicated logic that collapses into one shape (near-identical functions → one parameter, a copy-pasted block → one extraction) | high |
| `simplicity`  | shallow-duplication | duplication with no logic to drift (near-identical test cases or fixtures, a repeated one-line expression, a restated declaration) | medium |
| `simplicity`  | verbose             | a single piece of code, nothing repeated, longer or more nested than its idea needs (an `if/else` chain that is a lookup, a loop that is a `map`) | nit |
| `simplicity`  | needless-cast       | a type cast the value's type already guarantees | high |
| `simplicity`  | dead-code           | code that can never run or whose result is never used (an unreachable branch, an unread binding, a function nothing calls) | high |
| `simplicity`  | dead-code-surface   | surface nothing consumes (an unused export or return field, a redundant fallback or conjunct) | medium |

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
  - a hand-maintained list or union of domain values restates one kept elsewhere, so
    a value added to one copy silently misses the other.

  The copies carry logic — a branch, a computation, a sequence of steps — that can
  drift into a behaviour bug. Near-identical functions and blocks stay here however
  short they are. Repetition with no logic to drift is `shallow-duplication`; code that
  is merely longer than it needs to be, with nothing duplicated, is `verbose`.
- **Suggested fix**: name the unified version precisely — the merged function and
  the parameter that absorbs the difference ("collapse into
  `renderLine(invoice, label)` and pass the label at each site"), or the shorter
  expression it becomes. Treat this as a real defect, not a nicety: duplication that
  drifts out of sync is a future bug. A collapse keeps what every caller and every
  implementation of the same port or contract receives — a merged function that passes
  a different shape to one of them is a behaviour change, not this fix.
- **Calibration → the flag-argument trade-off**: Clean Code also warns that a
  **boolean/flag argument is a smell** — it usually means the function does two
  things. So weigh it: unify when the two bodies are *the same shape* and the
  difference is genuinely *data* (a threshold, a key, a label). Keep them separate
  when collapsing would force a flag that makes one function secretly do two jobs,
  or when the two are *conceptually distinct and likely to diverge* — premature
  DRY that couples unrelated things is its own defect. The goal is the simplest
  code that still reads clearly, not the fewest functions at any cost. Copies a
  dependency bot visibly keeps in sync — a `# renovate:` marker on each, an image tag in
  `FROM` — carry no drift risk: not a finding here or under `shallow-duplication`.

#### `shallow-duplication` — copies with no logic to drift

Some repetition costs the reader a second glance but cannot drift into a behaviour bug:
there is no branch or computation in it to fall out of step.

- **Flag** when the repeated code carries no logic of its own:
  - near-identical test cases or fixtures that differ only by their data — one table
    (`it.each`) or one builder would carry them;
  - the same one-line expression at several sites (`roles.map(({ role }) => role)`,
    `[...OPTIONS, OTHER_OPTION]`);
  - a declaration restated by hand — a type shape, an object literal — that a reference
    to the original or a derived type (`Pick<…>`, `Omit<…>`) would replace.
- **Suggested fix**: name the one shape — the `it.each` table, the helper, the derived
  type — and use it at each site.
- **Calibration → not a finding**: a restated type shape whose copies meet at a call
  site, where the compiler already catches a drift; test cases whose shared shape is the
  scenario (each one reads alone, and a table would hide what differs); two copies that
  are conceptually distinct and likely to diverge. A copy of a helper exported elsewhere
  is `canonical-helper`; repeated logic is `over-complex` — most-specific wins.

#### `verbose` — one piece of code longer than its idea

- **Flag** when a single site, with nothing duplicated, says in many lines what a
  shorter form says plainly: a chain of `if/else` that is a lookup table, a manual
  loop that is a `map`/`filter`/`find`, an intermediate variable used once with no
  clarifying value, nesting an early return would remove.
- **Suggested fix**: name the shorter form ("a `STATUS_LABEL` lookup", "`items.filter(isActive)`").
- **Calibration → not a finding**: a longer form that a step-by-step debugger, a
  performance constraint or the project's conventions ask for; a once-used variable
  whose name explains an opaque expression (that is the `explaining-variable` the
  readability lens asks for). Severity stays `nit`: it costs a reader seconds, not a
  drifting copy — never raise it to `high` because there are several. The same short form
  repeated at several sites is `shallow-duplication`, one finding listing them all.

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

  Flag too a cast that exists only because a predicate the code already calls returns
  `boolean` instead of a type guard (`isMultiple(x)` followed by `x as Multiple`): the
  fix is the guard (`x is Multiple`), which removes every such cast.
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
  - an entry in a list or map that an earlier filter or match already removes, so it
    never takes effect;
  - a function or method introduced by the change has no caller in scope;
  - speculative generality — an interface with a single implementer, a parameter
    always passed the same value, a hook/extension point nothing calls.
- **Suggested fix**: delete the unreachable arm or the unused binding; or, if the code
  was meant to run, name what makes it dead so the real bug (the guard that never fires)
  is fixed rather than the symptom deleted.
- **Calibration → not a finding**: an intentionally exhaustive `default:`/`else` kept as
  a defensive assertion; a public API, route handler, exported hook, or test helper
  whose caller is out of the reviewed scope; a parameter required by an interface or
  signature it must match; an export, field or branch that a spec or task file in the
  same change names as consumed by a later step — the caller simply does not exist yet,
  and deleting it removes what the next stage builds on. Speculative generality is never flagged on an abstraction a
  `patterns` rule would itself ask for under friction, nor on a public API/extension
  point whose consumer is out of scope — the exported-consumer clearance above holds.
  Reachability you cannot settle from the change alone is a **(verify)**, not an
  assertion — a wrong "this is dead" deletes live code.
  An unused export or return field and a redundant fallback are `dead-code-surface`.

#### `dead-code-surface` — surface nothing consumes

Code that runs but whose output nobody uses widens what a reader must keep in mind
without marking a live bug: the export nobody imports, the return field no caller reads,
the fallback for a value that is never absent.

- **Flag** when the change adds:
  - an export, or a field in a returned object, with no consumer in scope;
  - a fallback or default for a value the types and callers guarantee is present
    (`reply.chunks ?? []` where `chunks` is never absent);
  - a conjunct the rest of the condition or the types already guarantee
    (`items && items.length > 0` where `items` is never null).
- **Suggested fix**: drop the export, the field, the fallback or the conjunct. When the
  removal takes away a public signature or an overload, say so: the fix is structural.
- **Calibration → not a finding**: everything `dead-code`'s calibration clears — a public
  API or test helper whose consumer is out of the reviewed scope, an export a spec or task
  file in the same change names for a later step, a field an interface or a serializer
  requires — and a fallback at a real boundary (parsed input, a third-party response),
  where the type is a promise the data may break. An unreachable branch or an unread
  binding is `dead-code`, however small.
