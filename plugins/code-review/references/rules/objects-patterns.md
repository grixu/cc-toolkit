# Objects & patterns — rules for the objects-patterns lens

Full rule text for the `objects-patterns` scanner (part of the `code-review` plugin). Read
this whole file before judging. When two rules touch the same code, the
most-specific finding wins; when genuinely unsure whether something is a problem,
leave it out.

Each finding gets one **family**, one **rule**, and one **severity**. Grade severity
from the rows below (a finding's severity is the property of its rule, never the
file's overall impression). The orchestrator re-grades centrally against the master
table, so your severity is a first pass.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `objects`     | full-construction   | a half-initialized object, or leaked representation callers couple to | high |
| `objects`     | lazy-init           | an expensive-and-maybe-unneeded value computed eagerly | medium |
| `objects`     | leaky-collection    | a getter returning the raw internal mutable collection | high |
| `patterns`    | composition         | inheritance that already causes duplication/coupling delegation would remove | medium |
| `patterns`    | polymorphism        | the same type-discriminant `if`/`switch` repeated in ≥2 places | medium |
| `patterns`    | execute-around      | a paired setup/teardown left to callers, already duplicated or forgotten | medium |

### `objects` family

#### `full-construction` — construct fully-formed objects, hide the representation

Provide constructors/factories that return **well-formed instances**: all required
parameters upfront, defaults set inside the constructor, so callers never receive a
half-initialized object to finish wiring. And get the public interface right *before*
the representation — keep the data layout hidden so it can change without touching
callers.

- **Flag** when:
  - a constructor/factory returns an object the caller must finish (call `.init()`,
    set fields in a required order) before it is usable;
  - telescoping `setX`/`setY` stand in for parameters that should be constructor
    arguments;
  - a public mutable field or a getter exposes the internal layout, so callers
    couple to the representation and it can't change freely.
- **Suggested fix**: pass all required params upfront, set defaults in the
  constructor, return a complete instance; hide the data layout behind a small
  intention-revealing interface.
- **Calibration → not a finding**: a legitimate builder/step-builder that ends in a
  `build()` producing a complete object; optional configuration via setters *after* a
  valid default construction; framework-mandated lifecycle (`ngOnInit`, a React
  effect) where deferred setup is the platform contract. Flag the object that is a
  footgun before it is finished, not deliberate staged construction.

#### `lazy-init` — defer the expensive-and-maybe-unneeded

When computing or fetching a value is expensive **and** may not be needed on every
path, defer it to first access and cache the result. Paying that cost eagerly in the
constructor burns it even when the value is never read.

- **Flag** a field/property eagerly computed or fetched at construction that is
  expensive (I/O, heavy compute) and not used on all of the object's lifetime paths.
- **Suggested fix**: defer to first access and cache in a field (compute-once on
  read).
- **Calibration → not a finding**: cheap values (a small derived string, a length) —
  eager is simpler there; values needed on every path anyway; and cases where lazy
  init would introduce a race in concurrent code. This is a *state-initialization*
  pattern, **not** a performance pass — flag only the clear expensive-and-often-unused
  case, and never turn the review into perf tuning (performance is out of scope).

#### `leaky-collection` — never return a raw mutable collection

A getter that hands back the object's actual internal collection lets any caller
mutate its state from the outside, behind its back. Return something the caller can't
use to corrupt you.

- **Flag** a getter/property that returns the real internal mutable array/map/set
  (not a copy or read-only view) — `getItems() { return this.items }` where `items`
  is the object's own mutable field.
- **Suggested fix**: return a copy, an immutable/read-only view, or expose
  domain-specific `add`/`remove`/iterate methods so all mutation goes through the
  object.
- **Calibration → not a finding**: returning a freshly-built collection the object
  does not retain; an already-immutable/readonly type (`ReadonlyArray`, a frozen
  object); a deliberate, documented shared buffer for performance; value-type
  collections in languages that copy on assignment. Flag the *aliased internal
  mutable* collection, not every collection return.

---

### `patterns` family

*Reach for these under friction, not upfront (Step 2 note). Flag only when the
friction already exists — never because a pattern could apply.*

#### `composition` — delegate, don't inherit

Prefer sharing implementation by delegating to a collaborator over subclassing:
delegation keeps both sides independently replaceable and avoids deep, brittle
hierarchies.

- **Flag** **only when the inheritance is already hurting**: a subclass that
  overrides most of its parent or fights the base contract; a deep hierarchy where a
  change ripples through layers; subclassing purely to reuse a few methods
  (implementation inheritance) so the two can no longer vary independently.
- **Suggested fix**: hold the collaborator as a field and forward the calls
  (delegate) instead of subclassing.
- **Calibration → not a finding**: a genuine is-a with a small, stable base and real
  polymorphic dispatch; framework base classes you are required to extend; a
  one-level, well-fitting subclass. Do **not** flag inheritance just because
  composition is *possible* — only when the hierarchy already causes duplication or
  coupling you can point at.

#### `polymorphism` — replace a repeated conditional with polymorphism

When the **same** `if`/`switch` over a type discriminant appears in several places,
each new variant means editing every copy. Replace it with polymorphic objects /
strategies — one per case implementing a shared interface — so a new variant is a new
object, not an edit to N conditionals.

- **Flag** **only when the same type-tag conditional is duplicated in ≥2 places**:
  `switch (shape.kind)` (or `if (type === 'pdf') … else if (type === 'csv') …`)
  repeated across render, export, and validate.
- **Suggested fix**: introduce one object/strategy per case behind a shared
  interface; each absorbs its branch.
- **Calibration → not a finding**: a single, localized switch that lives in exactly
  one place — a factory/dispatcher is the *right* home for one switch; conditionals
  over values that aren't a type discriminant; small, stable enums unlikely to grow.
  One switch is fine — flag the *duplicated* discriminant.

#### `execute-around` — bracket paired actions behind one function

When two actions must always happen together (open/close, lock/unlock,
begin/commit), expose a single function that takes a callback and brackets the pair,
so a caller can't forget the second action.

- **Flag** **only when the pairing is already a problem**: the same acquire/release
  boilerplate copy-pasted across ≥2 call sites, or a path where the second half
  (close/unlock/rollback) is missing so a resource leaks.
- **Suggested fix**: expose one callback-taking function that brackets the pair
  (`withLock(fn)`, `withTransaction(fn)`).
- **Calibration → not a finding**: a language construct that already brackets it
  (`using`/`with`/`defer`/try-with-resources/RAII) — that *is* execute-around; a
  single call site where inline open/close is perfectly clear. Don't wrap one
  straightforward pair in a callback — flag the duplicated or leaking one.
