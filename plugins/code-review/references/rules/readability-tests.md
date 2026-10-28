# Readability & tests — rules for the readability-tests lens

Full rule text for the `readability-tests` scanner (part of the `code-review` plugin). Read
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

## Contents
- `readability` — openness, guard-clause, explaining-variable, magic-literal,
  composed-method, ordering
- `tests` — test-structure, test-fidelity, mutation-gap

Every rule below carries its **Flag** conditions, a **Suggested fix**, and a
**Calibration** paragraph naming the look-alike that is *not* a violation.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `readability` | openness            | logical blocks jammed together with no blank line | nit |
| `readability` | guard-clause        | happy path buried in nesting an early return would flatten | medium |
| `readability` | explaining-variable | an opaque inline expression a named local would explain | nit |
| `readability` | magic-literal       | an unexplained literal carrying domain meaning | medium |
| `readability` | composed-method     | a function doing many tasks or mixing abstraction levels | high |
| `readability` | ordering            | helpers not in stepdown / newspaper order under their caller | medium |
| `tests`       | test-structure      | arrange/act/assert (given/when/then) interleaved or out of order | medium |
| `tests`       | test-fidelity       | a test's name or fixture claims a boundary its assertions don't actually check | medium |
| `tests`       | mutation-gap        | a decision the change adds or modifies that the unit's tests exercise but would still pass if inverted, shifted by one, or deleted | medium |

### `readability` family

#### `openness` — separate logical blocks with a blank line

Clean Code: *"Each blank line is a visual cue that identifies a new and separate
concept."* Code with no vertical openness reads as one undifferentiated wall; the
reader has to re-derive the block boundaries the author already knew. Add a blank
line between concepts so the eye can group.

- **Flag** when distinct concepts are jammed together with no separation:
  - several small functions stacked with no blank line between them;
  - an `if`/`for`/`while` block immediately followed by the next statement with no
    blank line after the closing brace;
  - a run of statements that is really three phases (fetch → transform → return)
    with nothing separating them;
  - a chain of array/object operations or a sequence of related calls packed
    against unrelated code above and below.
- **Suggested fix**: insert blank lines at the concept boundaries — typically
  before a `return`, between setup and the work, around loops and conditionals,
  and between adjacent function declarations.
- **Calibration → not a finding**: *Vertical density* is the opposite and equally
  valid — lines that form one tight thought should stay packed (a guard clause and
  its `return`, a two-line variable-then-use pair, a small cohesive object
  literal). Do not demand blank lines *inside* a cohesive block, and do not ask
  for openness in trivially short functions. The goal is grouping, not double-
  spacing everything. Moving code is never an openness fix: a local declared far from
  its only use is not this rule.

#### `guard-clause` — handle edge cases up top, return early

Handle preconditions and error cases at the top of a function and return (or throw)
early. The main logic path then reads without indentation, one level in — instead of
being buried inside nested `if`/`else` the reader has to unwrap to find the happy
path.

- **Flag** when:
  - the happy path is wrapped in nested conditionals because each precondition is
    handled by *entering* an `if` rather than *returning* from its negation;
  - an `else` exists only because the `if` branch didn't return — the two could be
    a guard-then-straight-line;
  - rightward drift ("arrow code") from stacked validation, each level a deeper
    indent.
- **Suggested fix**: invert each precondition and `return`/`throw` at the top; the
  main path drops to a single indentation level and reads top-to-bottom.
- **Calibration → not a finding**: nesting that reflects genuine branching where
  **both** arms do real, comparable work (that's a legitimate `if/else`, not a guard
  + body); a single shallow conditional; a case where early returns would duplicate
  cleanup that one exit point (or `execute-around`) handles better. Guard clauses are
  for edge cases, not for flattening every conditional.

#### `explaining-variable` — name a complex expression with a local

When an expression is dense enough that the reader has to decode it, bind it to a
well-named local. The name becomes the explanation — and beats a comment, because it
travels with the value.

- **Flag** when:
  - a compound boolean or arithmetic expression sits inline in an `if`/return/
    argument and its intent isn't obvious
    (`if (user.age >= 18 && user.country === 'US' && !user.banned)`);
  - the same non-trivial sub-expression is computed in two places;
  - a chained expression's purpose would need a comment to be clear.
- **Suggested fix**: extract it to a role-named local (`const isEligibleAdult = …`)
  and use the name at the site.
- **Calibration → not a finding**: expressions that are already simple or idiomatic
  (`items.length > 0`, a single comparison), or where the local would merely restate
  the code (`const sum = a + b`). Name the *opaque*, not the plain — an
  over-extracted pile of one-use locals is its own noise.

#### `magic-literal` — name the literal

A bare number or string that encodes a rule, threshold, key, or limit forces the
reader to reverse-engineer its meaning, and duplicates that knowledge everywhere it
appears. Give it a name defined once.

- **Flag** a literal whose meaning isn't self-evident and that carries domain
  meaning: `* 86400`, `status === 3`, `retries < 5`, a hard-coded URL/limit/role
  string; or the same literal repeated across several sites.
- **Suggested fix**: name it once at the right scope (`const SECONDS_PER_DAY = 86400`,
  an enum/const for the status) and reference the name. When the literal restates a value
  another module owns, the shared name goes where both sides may already import from — a
  constants or config module, or passed in from the composition root — never exported
  from a repository, an adapter or a test helper; say so in the fix, which is then
  structural.
- **Calibration → not a finding**: literals that are self-evidently themselves —
  `0`/`1`/`-1` as identity/index/step, `2` in a halving, an empty string/array
  default, an obvious base case; or a one-off literal whose meaning the surrounding
  name already makes plain. Don't name `i + 1`. In a test, a literal that *is* the
  case under test — the input a fixture feeds, the value an assertion expects — is the
  test's own data, not a magic number. A default declared once beside the key that
  names it (`timeoutMs: 30_000` in a config object) is already named. A version pin a
  dependency bot updates at every site (a `# renovate:` marker, an image tag in `FROM`) is
  self-evident, and its repetition is no drift risk. The same literal
  repeated across several files is duplication, which the merge files under
  `over-complex` or `canonical-helper`: flag it here at one site and say where it
  recurs, never as one bullet per file.

#### `composed-method` — one function, one level of abstraction

Divide a function into steps that each do **one identifiable task**, all at the same
level of abstraction. A method that mixes orchestration with low-level detail, or
stacks several distinct tasks, forces the reader to switch altitude line by line. If
a method needs a paragraph — or section-divider comments — to explain, it is doing
too much.

- **Flag** when:
  - a function interleaves high-level calls with low-level detail (a call to
    `fetchUser()` sitting next to raw byte-shuffling);
  - several distinct tasks are stacked in one body that would read as a short list
    of named steps;
  - the body is long enough to need internal section comments to navigate;
  - a conditional the change adds into a flow whose concern it does not share (a
    feature check inside a generic loader), so the function now serves two concerns
    → push the branch into its own helper or policy.
  - **Escalation:** when such a method has grown large **and shares many
    temporaries** across its parts, the fix is a *method object* — turn the
    temporaries into fields, the body into a `compute()`/`call()`, then split that
    into small methods.
- **Suggested fix**: extract each task into a well-named helper so the top method
  reads as a list of same-level steps; for the temp-heavy case, name the method
  object to extract.
- **Calibration → not a finding**: a genuinely linear routine that is merely a bit
  long but reads top-to-bottom at one level; do **not** shatter a cohesive function
  into one-line helpers to hit a length target — over-extraction costs more than it
  saves. Sometimes the fix is `openness` (blank lines between phases), not
  extraction; and pure duplication is `over-complex`, not this. Most-specific wins.

#### `ordering` — stepdown: read top-down like a newspaper

Clean Code's stepdown rule: *"We want the code to read like a top-down narrative …
every function followed by those at the next level of abstraction,"* and *"a
function that is called should be below a function that does the calling."* The
public entry point goes on top; the private helpers it calls follow underneath,
in roughly the order they are called, each a level more detailed. The reader
descends one level of abstraction at a time instead of scrolling up and down.

- **Flag** when a file reads bottom-up or scrambled: private helpers above the
  public function that uses them, or helpers in an order unrelated to the call
  flow, so the reader has to jump around to follow the story.
- **Suggested fix**: name the target order — entry point first, then helper A
  (called first), helper B (called next), etc. Because reordering is riskier than
  spacing, describe the move and let the user confirm rather than silently
  rewriting a large file.
- **Calibration → not a finding**: hoisting-dependent or convention-bound orders
  (a language/linter that wants exports first, alphabetized members, React
  hooks-then-handlers conventions); type/constant declarations that legitimately
  sit at the top; any ordering the `<conventions>` note documents; and file-local
  helpers in a test file one position off the call order, which is within "roughly".
  **N/A** for
  declarative IaC (HCL/Terraform): its blocks have no call flow to step down, so clear
  the rule in one line. Don't relocate
  something across a meaningful boundary just to satisfy the rule — judgment over
  mechanism.

---

### `tests` family

#### `test-structure` — group and order arrange / act / assert

A test communicates by its shape. When the *arrange*, *act*, and *assert* phases
(given / when / then) are visually separated and in order, the reader sees the
scenario at a glance. When they interleave, they have to mentally re-sort the
test before they can trust it.

- **Flag** when:
  - the *assert* phase is interleaved with *act* — e.g. act, assert, act again,
    assert again, where it should be arrange → act → all asserts (unless the test
    is a genuine multi-step progression; see calibration);
  - a variable that extracts a value from a mock or a result is declared **right
    before the third assertion that finally uses it**, instead of with the rest of
    the arrange/extraction up top. Late declaration breaks the "all the setup is
    here, all the checks are there" reading.
  - the three phases run together with no blank line between them (this overlaps
    `openness`, but in tests the AAA grouping is the *reason* for the blank line).
- **Suggested fix**: hoist all mock/extraction variables into the arrange block,
  separate the three phases with a blank line, and put the asserts together at the
  end. A short `// given / when / then` or `// arrange / act / assert` label is
  welcome here (it is test vocabulary, not narration).
- **Calibration → not a finding**: some tests are legitimately a *progression* —
  drive a state machine through steps, asserting after each. There the act/assert
  alternation is the scenario, not a smell; keep it, but still group within each
  step. Also: Clean Code's "declare variables near their use" is a real principle,
  but in tests the AAA grouping wins because it communicates intent — that is the
  deliberate trade-off, not a contradiction to point out.

#### `test-fidelity` — the test must actually check what its name claims

A test is trusted for what its name and fixtures say it guards. When the
`describe`/`it` title, or a fixture chosen to sit at a boundary, names a value or
condition the assertions don't actually exercise, the test passes while guarding the
wrong thing — and a regression that relaxes the real boundary slips through green.

- **Flag** when:
  - an `it`/`describe` title states a concrete boundary or value (`"rejects titles
    over 250 characters"`) the code under test or the assertion doesn't match (the
    schema caps at 200);
  - a fixture literal picked to represent a boundary no longer matches the boundary
    it probes, so the test would still pass if the boundary moved;
  - a test named for behaviour X asserts only behaviour Y;
  - the expected value is computed by the unit under test (or the same helper), so the
    assertion cannot fail;
  - a title clause names a mechanism (`"so the update rolls back"`, `"in the same
    transaction"`, `"holds the pod id"`) that a mock makes uncheckable — the clause is
    a factual claim, so tighten the double until it checks it, or drop the clause.
- **Suggested fix**: align the claim with the real behaviour — retitle to the actual
  boundary and adjust the fixture, or tighten the assertion so it genuinely guards the
  claimed boundary.
- **Calibration → not a finding**: a deliberately illustrative, round-number, or
  paraphrase name that asserts no exact value and stays on the correct side of the
  boundary (`"rejects an over-long title"`); property-based tests whose boundary is
  intentionally abstract. This rule is about a test's *factual claim*, not a symbol
  named after mechanism (`intent-name`) or phase grouping/order (`test-structure`) —
  most-specific wins. A test whose name and fixtures claim nothing about the boundary,
  but whose inputs would not notice it moving, is `mutation-gap`; when the name or a
  fixture does claim the boundary, the finding is this rule's.

#### `mutation-gap` — the tests would not notice the decision changing

A test that runs a decision without pinning it is coverage, not protection: flip the
comparison, shift the bound by one or delete the guard, and the suite stays green. The
change's new or modified decisions — a comparison, a bound, a guard, an early return, an
`&&`/`||` — are exactly where a later edit will move the boundary, so their tests have to
sit on it.

- **Flag** when the change adds or modifies a decision in source and, after you Grep the
  unit's name in `test`-kind files (one hop, no further) and read those tests, they
  exercise it but would pass a mutant of it:
  - every input sits far from the boundary, so both `>=` and `>` pass;
  - no test feeds the rejecting input of a guard or early return the change adds;
  - no test hits 0, 1 or the exact limit of a bound;
  - no case tells `&&` from `||` (every input makes both operands agree).
  Cite the source `path:L`, the mutant that survives, and the test `path:L` with the
  inputs it uses; file the bullet under the **source** path.
- **Suggested fix**: name the case to add and its expected value — "add cases at `18`
  (adult) and `17` (minor)".
- **Calibration → not a finding**: a unit with no tests at all — coverage is out of
  scope, so one `Not flagged` line; an equivalent mutant (an integer domain where the
  boundary value cannot occur, a later clamp that hides the shift); a site already pinned
  by property, fuzz or snapshot tests whose output depends on it; exhaustiveness
  assertions, logging or telemetry conditions, and conditions inside test files. When the
  condition itself is wrong, never ask for a test that pins the bug — `HANDOFF` it to
  `correctness`. A test whose name or fixture claims the boundary, or whose expected value
  the unit under test computes, is `test-fidelity` — most-specific wins. Primary findings
  only, never boy-scout; never run mutation tests.
- **Example**: `` `tests` · mutation-gap · medium · `src/age/classify.ts:L14` — `age >= 18` survives a flip to `> 18`: `src/age/classify.test.ts:L8, L15` use only `25` and `10` → add cases at `18` (adult) and `17` (minor) ``
