# Naming & module shape — rules for the naming-module lens

Full rule text for the `naming-module` scanner (part of the `code-review` plugin). Read
this whole file before judging. When two rules touch the same code, the
most-specific finding wins; when genuinely unsure whether something is a problem,
leave it out.

Each finding gets one **family**, one **rule**, and one **severity**. Grade severity
from the rows below (a finding's severity is the property of its rule, never the
file's overall impression). The orchestrator re-grades centrally against the master
table, so your severity is a first pass.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `naming`      | intent-name         | a name after mechanism/algorithm, not intent | medium |
| `naming`      | role-name           | a name carrying the type instead of the role | nit |
| `naming`      | command-query       | a query that mutates, or a command relied on only for its return | high |
| `module`      | style-mix           | OOP and functional mixed ad hoc (a misplaced free function or class) | high |
| `module`      | barrel              | a pointless re-export `index.*` that narrows nothing | medium |

### `naming` family

#### `intent-name` — name after intent, not mechanism

Name a function or variable after **what** it accomplishes, never **how**. A reader
should grasp a call's purpose without opening its body. The test: imagine a second,
very different implementation of the same thing — would you give it the same name?
If not, the name has leaked the mechanism and should be generalized.

- **Flag** a name that describes the algorithm or implementation rather than the
  concept: `linearSearchFor(item)` (→ `includes`), `bubbleSorted` (→ `sorted`),
  `retryLoop`, `mapReduceUsers`, a boolean `usesRegexMatch`; any name that would have
  to change if you swapped in an equivalent implementation.
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
