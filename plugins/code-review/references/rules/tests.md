# Tests — rules for the tests lens

Full rule text for the `tests` scanner (part of the `code-review` plugin). Read this whole file
before judging. When two rules touch the same code, the most-specific finding wins.

Report what you find; the filter runs after. Judge each site against the rules, then against that
rule's own calibration paragraph — the look-alike that is *not* a violation. A site the calibration
clears is a non-finding. A site you cannot settle either way belongs in `CANDIDATES`, not in the
bin: whoever merges the review decides it with everything in view, and a rejected candidate costs
one line in `Not flagged` — an unreported one costs the finding.

**A suggested fix is one clause, never a code block.** Name the test to delete, the case to add,
the assertion to replace — "delete `orders.service.spec.ts`; `checkout.e2e.ts:L40` already pins
the total", "assert the saved row, not `repo.save`'s arguments". The surface that renders your
findings has no room for a rewritten test.

Each finding gets one **family** (`tests`), one **rule**, and one **severity**, from the rows
below. Severity is exactly one of `high`, `medium`, or `nit` — never `low`, never a number. The
orchestrator re-grades centrally against the master table, so your severity is a first pass.

## What this lens asks

Two questions, in this order, for every test the change adds, edits or leaves behind:

1. **Should this test exist?** — `unwarranted-test`, `obsolete-test`, `redundant-test`.
2. **Does it guard behaviour, the way its name says?** — `implementation-mirror`,
   `mechanism-name`, `test-fidelity`, `mutation-gap`, `test-structure`.

And one question for the change's source: **is a guarantee it adds or changes reached by any
test?** — `untested-behaviour`.

**A test that fails question 1 gets no question-2 ask.** Never propose more cases, tighter
assertions or a new phase layout for a test you flag as one that should not exist: polishing it
is the opposite of the fix. Judge question 1 first; question-2 findings only on tests that pass
it or that sit in `CANDIDATES` for it.

| rule | what it catches | severity |
|------|-----------------|----------|
| unwarranted-test      | a test the change adds, at any level, that guards nothing worth its cost | medium |
| obsolete-test         | an existing test this change made pointless, left in place | medium |
| redundant-test        | a test whose behaviour another test, at the same or a higher level, already pins | medium |
| implementation-mirror | a test that asserts how the code works instead of what it does, so it passes broken code and fails refactors | medium |
| mechanism-name        | a scenario title that narrates calls or their order instead of the behaviour it guards | nit |
| untested-behaviour    | a security or contract guarantee, rollback/data-loss path, or spec criterion the change adds or changes that no test reaches | high |
| test-fidelity         | a test's name or fixture claims a boundary its assertions don't actually check | medium |
| mutation-gap          | a decision the change adds or modifies that the unit's tests exercise but would still pass if inverted, shifted by one, or deleted | medium |
| test-structure        | arrange/act/assert (given/when/then) interleaved or out of order | medium |

## The read protocol

This lens reads across files, bounded to what each rule needs. Use `Read`, the `Grep` tool, and
read-only `git` from `Bash` (`git show`, `git ls-tree`, `git log`, `git grep`) — never `checkout`,
never a test run, never a write.

- **The base.** `<diff_args>` names the base the change is measured against. With diff_args
  "none" there is no base: `unwarranted-test` (a) and `obsolete-test` are N/A — clear them in one
  line.
- **A new test's target.** For each test file the change adds, its target is the module it
  imports and exercises. Ask the base: did the target exist (`git show <base>:<path>`), and did any
  test reach it (`git ls-tree -r --name-only <base>`, then Grep those test files for the target's
  module name)? Count the target's public functions or methods at the base and how many the change
  added or modified.
- **Tests one level up.** The tests that already reach the changed code through a caller: Grep
  the target's importers, then the test files that import the target or one of those importers.
  One hop, no further. Read the matched tests at the cases that drive the changed path; a fact
  beyond the hop is `(verify)`.
- **Leftovers.** For every identifier on the diff's `-` lines (a function, route, flag, field,
  enum member, error code) that no `+` line restores, Grep the repo's `test` files — not only
  `<files>` — for it.
- **Project test-scope rules.** The `<conventions>` slot may quote an explicit rule about what the
  project tests and what it does not ("no unit specs for components", "controllers that only
  delegate are not tested", "prefer e2e for flows"). Such a rule is the one convention that
  **generates** findings here, for `unwarranted-test` only; quote it with its file. Every other
  convention only suppresses.

When a hook or permission refuses the repo-wide search and `git grep` is refused too, say so on
the header line (`· search blocked: <what>`) and send what the search would have settled to
`CANDIDATES`.

---

### Should this test exist?

#### `unwarranted-test` — a new test that guards nothing worth its cost

Every test costs: CI time, a file to keep green through every refactor, and a reader's trust that
green means working. A test the change adds earns that cost only when it guards behaviour no other
test guards, at a level that can see it. The question is the same for a unit, an integration and
an e2e test; what differs is what "already guarded" and "cost" mean at each level.

- **Flag** a test file, or a block of tests, the change adds when:
  - **(a) a new unit test for an untested target.** The target existed at the base and no test
    reached it, the change adds or modifies a minority of its public functions or methods, and the
    changed code is neither critical — authentication or authorization, money, data loss or
    deletion, a public contract (an API response, an event payload, a CLI's output) — nor complex
    (several interacting branches, concurrency, a non-trivial algorithm). The owner left the
    target untested on purpose; a small change does not reverse that decision. A white-box test
    (asserting on mocks, call arguments or private state) strengthens the finding; a black-box one
    weakens it, and on its own white-boxing never triggers it;
  - **(b) an integration or e2e test that adds no scenario.** An existing test at the same or a
    higher level already drives the same flow with inputs that exercise the change, or the new test
    boots the application, a database or a browser to pin a change that a cheaper test already
    pins or could pin;
  - **(c) a test of the framework, not the code.** It checks that validation decorators reject
    what they declare, that DI wiring resolves, that a controller passes its arguments to a service
    and returns the result, that a thin wrapper around a library hook (`useQuery`, `useMutation`)
    calls it — the library's own tests already guard that;
  - **(d) a test outside the project's test scope.** A rule quoted in `<conventions>` says the
    project does not test this kind of file, or tests it at another level. Quote the rule and its
    file in the finding.
- **Suggested fix**: delete the test, and say what already guards the behaviour, or that nothing
  needs to — "delete `invoice.repository.spec.ts`; the repository is untested by choice and the
  change adds one filter". For (b), name the existing test that covers the scenario.
- **Calibration → not a finding**:
  - an integration or e2e test of a user flow the suite does not reach yet, at any change size —
    that is what those levels are for;
  - for (a): a unit test for a new module the change creates (there was no owner's decision to
    honour), or one added to a target that already had tests — (b), (c) and (d) still apply;
  - a regression test that pins a bug the change fixes, written to fail before the fix;
  - a test the review's own previous round asked for (a fix round is judged as it stands).
  - **To `CANDIDATES`, never a finding**: (a) when the changed code is critical or complex, or you
    cannot tell; (b) when the existing test's inputs may not reach the changed path; any case where
    the value of the test is a judgment you cannot settle from the code. Say in the clause what the
    user should weigh — "new 80-line white-box spec for 2 of 12 methods; the methods compute refunds"
    — because the user decides whether the test stays.

#### `obsolete-test` — an existing test this change made pointless

A change that removes or replaces behaviour leaves its tests behind unless someone removes them.
Those tests stay green — often because a mock still stands in for the deleted code — and keep
asserting a behaviour the product no longer has, which reads as a guarantee nobody gives.

- **Flag** a test that existed at the base when this change made it pointless:
  - it drives a branch, route, flag, field, enum member or function the change deleted, and still
    passes because a mock, stub or fixture supplies what the code no longer does;
  - the change edited it only to keep it passing — renamed the call it makes, deleted the assertion
    that broke, loosened an expected value — so it no longer checks the behaviour its name states;
  - a `skip`, `todo` or `xit` placeholder for a feature the change removed;
  - a fixture, factory or test helper whose last user the change deleted.
  Cite the test `path:L` and the deleted code it still refers to.
- **Suggested fix**: delete the test (or the case, or the helper), or retarget it at the behaviour
  that replaced the old one — name which.
- **Calibration → not a finding**: a test that was already pointless at the base and that this
  change does not touch or depend on — one `Not flagged` line, never a finding: the review judges
  the change, not the suite's history. A test that fails now because the change broke behaviour is
  not obsolete; it is the suite doing its job — when the change is wrong, `HANDOFF` to
  `correctness`. Dead source code is `simplicity` · `dead-code`, never this rule.

#### `redundant-test` — the behaviour is already pinned elsewhere

Two tests that pin the same behaviour double the maintenance and fail together, telling the reader
nothing the first failure did not.

- **Flag** when a test the change adds or extends asserts the same input → outcome as:
  - another test in the change, in a different file or at a different level;
  - an existing test of the same unit, or a test one level up whose inputs drive the same path and
    whose assertions check the same outcome.
  Cite both `path:L`.
- **Suggested fix**: keep the test at the level that sees the behaviour best — usually the one
  closest to the boundary a user or caller crosses — and delete the other; name which.
- **Calibration → not a finding**: a unit test that pins edge cases the higher-level test does not
  feed (a boundary, an error branch) — that is layering, not redundancy; near-identical cases
  inside one file that a table or `it.each` would fold are `simplicity` · `shallow-duplication`;
  the same behaviour checked through two genuinely different entry points a user can take.

---

### Does it guard behaviour, the way its name says?

#### `implementation-mirror` — the test restates the code instead of checking its result

A test that asserts *how* the code does its work — which collaborator it called, with which
arguments, in which order — passes when the result is wrong and fails when a refactor keeps the
result right. It is a copy of the implementation, and it trains the next author to update both.

- **Flag** when:
  - the test's only assertions are on calls, call counts or arguments of a mock of a collaborator
    **the repo owns** (a repository, a service, a store), and the outcome those calls produce — the
    returned value, the persisted state, the response — is not asserted;
  - the test mocks the very function or method the change modified and then asserts on that mock,
    so the changed code never runs;
  - a stub of a repo-owned collaborator returns a value or state the real collaborator cannot
    produce (read its source), so the test exercises a path production never takes;
  - the expected value is built by calling the unit under test or the helper it uses, so the
    assertion compares the code with itself (when the test's *name* claims a boundary this way, it
    is `test-fidelity`);
  - the assertion pins an incidental shape of a query or call — the ORM `where`/`include`/`orderBy`
    object, a SQL string — where the behaviour is the rows the query returns.
- **Suggested fix**: assert the outcome instead — the returned value, the stored row, the response,
  the emitted event — and use the real collaborator or an in-memory fake where it is cheap; name
  the assertion to replace.
- **Calibration → not a finding**: the call **is** the observable effect — publishing to a queue,
  sending an email, calling a third-party API, writing a log line the product depends on — and its
  arguments are the contract; a mock of a third-party or network boundary (a double that diverges
  from the real dependency is `assumptions` · `mock-divergence`, never this rule); a test whose
  outcome assertions stand and which also checks one call as a side note.

#### `mechanism-name` — the title narrates the code

A scenario title is the line a reader sees when the test fails. "Calls `repository.save`" says what
the code did, not what broke; "keeps the draft when saving fails" says what the user lost.

- **Flag** an `it`/`test`/`describe` title the change adds or rewrites that names calls, methods or
  their order instead of a behaviour or rule — "invokes the save action", "calls X then Y", "sets
  the flag to true", "runs the update inside the lock".
- **Suggested fix**: retitle to the behaviour or rule the test guards, in the domain's words; name
  the new title.
- **Calibration → not a finding**: a title for a call that is itself the observable effect
  ("publishes `order.created` once"); a title in a test of a low-level utility whose behaviour *is*
  the mechanism ("pads to two digits"); a factual claim the assertions do not check is
  `test-fidelity`, and a symbol named after mechanism is `naming` · `intent-name` — most-specific
  wins.

#### `untested-behaviour` — a guarantee no test reaches

Most code a change adds does not need a test of its own. A guarantee does: when its removal would
let a user see the wrong thing or lose something, and no test would notice, the next edit can drop
it silently.

- **Flag** a guarantee the change adds or changes in `source` files, when no test reaches it —
  neither directly nor through a test one level up (the read protocol):
  - a security guarantee: an authorization or ownership check, input escaping, a redirect or
    request option that keeps a credential in place, a secret kept out of a response or log;
  - a contract guarantee: a route's status code or error body, an event or message payload's
    shape, a public function's documented error;
  - a rollback, compensation or data-loss path: a transaction's undo, a soft-delete instead of a
    hard one, a retry that must not duplicate;
  - an acceptance criterion of the active spec (`<spec>`), quoted verbatim.
  Cite the source `path:L`, what no test feeds it, and which tests you checked.
- **Suggested fix**: name the scenario to add and the level it belongs at — "add a request test
  that a non-owner gets 404 at `GET /orders/:id`".
- **Calibration → not a finding**: code the change only moved or renamed (this exempts asking
  for a test that does not exist, never a test the change adds or edits: that one is judged by
  `test-fidelity` and `mutation-gap` whatever its target); the untouched rest of a
  file the change edited (the review judges the change, not the file's history); behaviour outside
  the four kinds above — a missing test there is one `Not flagged` line, never a finding; a
  guarantee the type system enforces; a guarantee reached by a test one level up even if no unit
  test names it. A guarantee that is itself wrong is `correctness` or `security` — `HANDOFF` it,
  never ask for a test that pins the bug.

#### `test-fidelity` — the test must actually check what its name claims

A test is trusted for what its name and fixtures say it guards. When the `describe`/`it` title, or
a fixture chosen to sit at a boundary, names a value or condition the assertions don't actually
exercise, the test passes while guarding the wrong thing — and a regression that relaxes the real
boundary slips through green.

- **Flag** when:
  - an `it`/`describe` title states a concrete boundary or value (`"rejects titles over 250
    characters"`) the code under test or the assertion doesn't match (the schema caps at 200);
  - a fixture literal picked to represent a boundary no longer matches the boundary it probes, so
    the test would still pass if the boundary moved;
  - a test named for behaviour X asserts only behaviour Y;
  - the expected value is computed by the unit under test (or the same helper), so the assertion
    cannot fail, and the name claims the boundary it fails to check;
  - a title clause names a mechanism (`"so the update rolls back"`, `"in the same transaction"`)
    that a mock makes uncheckable — the clause is a factual claim, so tighten the double until it
    checks it, or drop the clause.
- **Suggested fix**: align the claim with the real behaviour — retitle to the actual boundary and
  adjust the fixture, or tighten the assertion so it genuinely guards the claimed boundary.
- **Calibration → not a finding**: a deliberately illustrative, round-number, or paraphrase name
  that asserts no exact value and stays on the correct side of the boundary (`"rejects an
  over-long title"`); property-based tests whose boundary is intentionally abstract. A test whose
  name and fixtures claim nothing about the boundary, but whose inputs would not notice it moving,
  is `mutation-gap`; a test that asserts calls instead of outcomes with no claim in its name is
  `implementation-mirror` — most-specific wins.

#### `mutation-gap` — the tests would not notice the decision changing

A test that runs a decision without pinning it is coverage, not protection: flip the comparison,
shift the bound by one or delete the guard, and the suite stays green. The change's new or modified
decisions — a comparison, a bound, a guard, an early return, an `&&`/`||` — are exactly where a
later edit will move the boundary, so their tests have to sit on it.

- **Flag** when the change adds or modifies a decision in source, or adds or edits a test of one
  (moved or not), and, after you Grep the unit's
  name in `test`-kind files (one hop, no further) and read those tests, they exercise it but would
  pass a mutant of it:
  - every input sits far from the boundary, so both `>=` and `>` pass;
  - no test feeds the rejecting input of a guard or early return the change adds;
  - no test hits 0, 1 or the exact limit of a bound;
  - no case tells `&&` from `||` (every input makes both operands agree).
  Cite the source `path:L`, the mutant that survives, and the test `path:L` with the inputs it
  uses; file the bullet under the **source** path.
- **Suggested fix**: name the case to add and its expected value — "add cases at `18` (adult) and
  `17` (minor)".
- **Calibration → not a finding**: a unit with no tests at all — whether it needs one is
  `untested-behaviour`'s question, so here one `Not flagged` line; a test this lens flags as
  `unwarranted-test` or `obsolete-test`, or sends to `CANDIDATES` for it — never ask to extend a
  test that may not belong; a test of framework configuration (validation decorators, DI wiring);
  an equivalent mutant (an integer domain where the boundary value cannot occur, a later clamp that
  hides the shift); a site already pinned by property, fuzz or snapshot tests whose output depends
  on it; exhaustiveness assertions, logging or telemetry conditions, and conditions inside test
  files. When the condition itself is wrong, never ask for a test that pins the bug — `HANDOFF` it
  to `correctness`. A test whose name or fixture claims the boundary, or whose expected value the
  unit under test computes, is `test-fidelity` — most-specific wins. Primary findings only, never
  boy-scout; never run mutation tests.
- **Example**: `` `tests` · mutation-gap · medium · `src/age/classify.ts:L14` — `age >= 18` survives a flip to `> 18`: `src/age/classify.test.ts:L8, L15` use only `25` and `10` → add cases at `18` (adult) and `17` (minor) ``

#### `test-structure` — group and order arrange / act / assert

A test communicates by its shape. When the *arrange*, *act*, and *assert* phases (given / when /
then) are visually separated and in order, the reader sees the scenario at a glance. When they
interleave, they have to mentally re-sort the test before they can trust it.

- **Flag** when:
  - the *assert* phase is interleaved with *act* — e.g. act, assert, act again, assert again, where
    it should be arrange → act → all asserts (unless the test is a genuine multi-step progression;
    see calibration);
  - a variable that extracts a value from a mock or a result is declared **right before the third
    assertion that finally uses it**, instead of with the rest of the arrange/extraction up top.
  - the three phases run together with no blank line between them.
- **Suggested fix**: hoist all mock/extraction variables into the arrange block, separate the three
  phases with a blank line, and put the asserts together at the end. Never propose phase-label
  comments (`// given`, `// arrange`): many projects forbid them, and the blank lines carry the
  grouping.
- **Calibration → not a finding**: some tests are legitimately a *progression* — drive a state
  machine through steps, asserting after each. There the act/assert alternation is the scenario,
  not a smell; keep it, but still group within each step. Also: Clean Code's "declare variables
  near their use" is a real principle, but in tests the AAA grouping wins because it communicates
  intent — that is the deliberate trade-off, not a contradiction to point out. Existing phase-label
  comments are the project's style; leave them, unless a convention or hookify rule forbids them.
