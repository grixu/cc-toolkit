# Naming & module shape — rules for the naming-module lens

Full rule text for the `naming-module` scanner (part of the `code-review` plugin). Read
this whole file before judging; the `module` rules run under the one-hop cross-file
protocol below. When two rules touch the same code, the most-specific finding wins.

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

## Contents
- `naming` — intent-name, role-name, command-query
- `module` — style-mix, barrel, dependency-direction, misplaced-logic, canonical-helper,
  pass-through

Every rule below carries its **Flag** conditions, a **Suggested fix**, and a
**Calibration** paragraph naming the look-alike that is *not* a violation.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `naming`      | intent-name         | a name after mechanism/algorithm, not intent | medium |
| `naming`      | role-name           | a name carrying the type instead of the role | nit |
| `naming`      | command-query       | a query that mutates, or a command relied on only for its return | high |
| `module`      | style-mix           | OOP and functional mixed ad hoc (a misplaced free function or class) | high |
| `module`      | barrel              | a pointless re-export `index.*` that narrows nothing | medium |
| `module`      | dependency-direction | an added import that closes a cycle, or points from a shared/lower module into a feature/higher one | high |
| `module`      | misplaced-logic     | feature-specific branch/constant/type added to a module imported by ≥2 unrelated features | medium |
| `module`      | canonical-helper    | a new helper duplicating an exported helper elsewhere in the repo | high |
| `module`      | pass-through        | a function/class/wrapper the change adds that forwards unchanged, has one caller or one case, and removes no branch/mode/layer (absorbs middle-man, needless-indirection, relocate-not-reduce) | medium |

## One-hop cross-file protocol

The `module` rules judge relationships, so they look one hop beyond the files in
view — exactly one:

- For each changed module, Grep the repo for its import path (its importers). For
  each module the change newly imports, Grep that module's own imports.
- Open the matched files at the matched lines only.
- No transitive crawl, no repo listing, no `find`. A fact that needs a second hop is
  `(verify)`, never an assertion.
- `canonical-helper` bounds its Grep to the helper's name and its distinctive
  expression (the regex, the arithmetic, the format string).
- The protocol only reads; the scanner still writes nothing.

### `naming` family

#### `intent-name` — name after intent, not mechanism

Name a function or variable after **what** it accomplishes, never **how**. A reader
should grasp a call's purpose without opening its body. The test: imagine a second,
very different implementation of the same thing — would you give it the same name?
If not, the name has leaked the mechanism and should be generalized.

- **Flag** when:
  - a name describes the algorithm or implementation rather than the concept:
    `linearSearchFor(item)` (→ `includes`), `bubbleSorted` (→ `sorted`),
    `retryLoop`, `mapReduceUsers`, a boolean `usesRegexMatch`; any name that would
    have to change if you swapped in an equivalent implementation;
  - a name reveals nothing (`data`, `handle`, `process`, `result`, `temp` without
    context) — if no honest name comes, the design is murky.
- **Suggested fix**: rename to the concept — `includes`, `sortedUsers`,
  `activeUsers` — so callers read intent, not implementation.
- **Calibration → not a finding**: names where the mechanism *is* the intent — a
  `quickSortComparator` inside a sorting library, `debounce`, `LinkedList`, a
  `sha256` helper — and established domain/algorithm names that are the public
  contract. Flag leaking implementation, not a legitimately mechanism-named
  abstraction.

#### `role-name` — name by role, not type

Name a variable after the **role** it plays, not its type; the type is already known
from context, so a type suffix/prefix adds noise instead of meaning.

- **Flag** `employeeList`, `queryString`, `dataArray`, `userMap`, `strName`,
  `bFlag` — the name says what it *is*, not what it's *for*.
- **Suggested fix**: name by role — `employees`, `query`, `rows`, `usersById`,
  `name` — and let the type be inferred.
- **Calibration → not a finding**: a suffix that genuinely disambiguates two roles
  of one concept (`userId` vs `user`, `rawInput` vs `input`, `startDate`/`endDate`),
  or a naming convention the project mandates (Step 0). The target is redundant-type
  noise, not every suffix.

#### `command-query` — separate queries from commands

A query answers a question and returns a value **without** side effects; a command
changes state. When one function does both, the caller can't tell from the call site
that reading also mutated — a footgun, and the reason this rule is graded `high`.

- **Flag** when:
  - a query that reads like a question also mutates — `getUser()` that lazily
    creates and inserts, an `isValid()` that sets an error field, a `size()` that
    reorders;
  - a command returns internal state that callers then start depending on, so a
    later change to that return quietly breaks them.
- **Suggested fix**: split into a pure query (no side effects — name the boolean one
  `is`/`has`/`can` so it reads as the question it is) and a command (mutates, returns
  only what the caller uses); or rename so the side effect is honest.
- **Calibration → not a finding**: idiomatic mutate-and-return (`stack.pop()`,
  `map.set()` fluent chaining, `array.splice()`), builders returning `this`, and
  cache-on-read where the lazy write causes **no observable state change** — that's
  `lazy-init`, not a CQS break. A merely mis-named boolean predicate with no hidden
  mutation (`valid()` that should be `isValid()`) is at most a `naming` nit, **not** a
  `command-query` finding — this rule is the *surprising side effect*. Flag that, not
  every non-void mutator.

---

### `module` family

#### `style-mix` — don't mix OOP and functional ad hoc

A module has a chosen style. When it switches styles for no reason, the switch
itself becomes a thing the reader has to explain to themselves. The usual
offenders:

- **A non-exported free function inside an OOP module**, doing a helper job for a
  class in the same file. Ask: why is this not a **private method**? It has the
  class's context, it is not exported, nothing tests it directly. → make it a
  private method. The one real reason to keep a helper separate is that it needs
  its **own unit test** — but then it should not be an un-exported function
  squatting in the class file either: **extract it** to the project's `helpers/`
  or `utils/` location (per the project's own semantics), export it there, and
  give it that test.
- **A class appearing in functional code** with no strong reason — no state to
  carry, no lifecycle, no interface to implement. If the class is deliberate
  (it holds state, it is a real abstraction), the code is missing the **one
  comment that says why**; if it is not deliberate, it should be a function.
- **A function sharing a file with an unrelated class** and exported alongside it
  → move the function to its own file.
- **A grab-bag file** that exports several functions with nothing in common
  → split it by responsibility.

- **Suggested fix**: state the specific move (inline as private method / extract +
  test / split file / add the rationale comment), and *why* — keeping one style
  per module is what lets a reader predict where things live.
- **Calibration → not a finding**: a small, stateless, file-local pure helper at
  the bottom of an OOP file can be perfectly fine — not every function near a
  class is a misplaced method. Factory functions that return class instances,
  React function components, and idiomatic functional cores with a thin class
  adapter at the edge are normal, not violations. Flag the *unjustified* switch,
  not every mixed file.

#### `barrel` — pointless barrel exports

A barrel (`index.ts` / `index.js` that only re-exports its siblings) adds a layer
of indirection. Sometimes that layer earns its keep — it defines a package's
public surface. Often it is cargo-culted: it re-exports everything, hides nothing,
and just means every reader follows one more hop to find the real file.

- **Flag** a barrel that re-exports without narrowing or shaping a public API,
  when the project does not document barrels as its convention and no comment
  explains the decision.
- **Suggested fix**: import from the real modules and drop the barrel — or, if it
  is meant to be a package entry point, say so in a one-line comment so the next
  person knows it is load-bearing.
- **Calibration → not a finding**: a genuine package entry point (the file
  `package.json`'s `main`/`exports`/`types` points at), a barrel that deliberately
  narrows a large internal surface to a small external one, or a barrel the
  project's conventions mandate (Step 0). The test is whether the indirection
  *does* something.

#### `dependency-direction` — imports point one way

An import is an arrow. When the change adds one that closes a cycle, or points from a
shared/lower module (`shared/`, `core/`, `utils/`) into a feature/higher one, the
shared module now depends on the thing that depends on it — nothing can be reused,
tested, or moved alone.

- **Flag** an import the change adds that:
  - closes a cycle — the imported module already (one hop) imports the changed
    module;
  - points from a shared/lower module into a feature/higher module, per the layering
    the project's conventions (Step 2) or its existing imports establish.
- **Suggested fix**: name the inversion — move the needed piece down into the shared
  module, pass it in as a parameter/callback, or extract an interface the higher
  module implements.
- **Calibration → not a finding**: `import type` and other erased imports; a cycle
  that pre-exists and the change did not add; layering the project's conventions
  (Step 2) define differently, or a repo showing no layering discipline at all —
  never invent layers from directory names alone; framework-mandated back-references
  (ORM relations, DI registration). A hop beyond the one you Grepped is `(verify)`,
  never an assertion.

#### `misplaced-logic` — keep feature knowledge out of shared modules

A module imported by several unrelated features is shared by contract. A branch,
constant, or type added there for one feature's sake makes every other importer carry
it, and the next feature adds its own.

- **Flag** a feature-specific branch, constant, or type the change adds to a module
  that ≥2 unrelated features import (Grep the importers first).
- **Suggested fix**: move the piece into the feature that needs it, or generalize it
  into a parameter the shared module takes.
- **Calibration → not a finding**: a shared module whose *purpose* is per-feature
  registration (a router table, plugin manifest, registry); a generic parameter one
  feature happens to use first; a module that looks shared by directory name but has
  one importer — Grep first; with one consumer nothing is "leaking".

#### `canonical-helper` — one helper per job

When the repo already exports a helper for a job, a second one written in the change
drifts: two `slugify`s, two date formatters, two retry loops that disagree next
quarter.

- **Flag** a helper the change adds that duplicates an exported helper elsewhere in
  the repo — Grep the helper's name and its distinctive expression, open the matches,
  and confirm the contract is the same.
- **Suggested fix**: delete the new helper and import the existing one (name it and
  its path).
- **Calibration → not a finding**: a local variant with a genuinely different
  contract (rounding, locale, error behaviour) that says so; a test-only fake;
  same-file duplication, which is `over-complex` — most-specific wins. A Grep that
  finds nothing conclusive is `(verify)`, not a finding. On the same lines this
  deletion finding beats an extraction.

#### `pass-through` — indirection that forwards and removes nothing

A function, class, or wrapper that only forwards to something else, has one caller or
one case, and removes no branch, mode, or layer is a hop the reader takes for nothing.
This rule also covers the middle-man class and the refactor that relocates code
without reducing it.

- **Flag** a function/class/wrapper the change adds that forwards its arguments
  unchanged, has one caller or one case, and removes no branch, mode, or layer.
- **Suggested fix**: inline it at the caller and delete the wrapper.
- **Calibration → not a finding**: a wrapper that narrows, adapts, or renames a
  signature at a real boundary; a seam the project uses for DI or tests; an
  interface implementation; a facade decoupling from a dependency; a wrapper
  translating domain vocabulary (`chargeCustomer` → `stripe.charges.create`); a
  delegate adding a cross-cutting concern (logging, auth, retries); a marked
  deprecation shim; a documented public surface; an abstraction whose second use
  lands in the same change; framework-mandated indirection. An `index.*` that
  forwards is `barrel`, not this. Flag only what this change adds — never an
  existing seam the change merely calls. On the same lines a deletion finding
  (`pass-through`, `canonical-helper`) beats an extraction.
