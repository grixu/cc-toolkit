# Readability & tests — rules for the readability-tests lens

Full rule text for the `readability-tests` scanner (part of the `code-review` plugin). Read
this whole file before judging. When two rules touch the same code, the
most-specific finding wins; when genuinely unsure whether something is a problem,
leave it out.

Each finding gets one **family**, one **rule**, and one **severity**. Grade severity
from the rows below (a finding's severity is the property of its rule, never the
file's overall impression). The orchestrator re-grades centrally against the master
table, so your severity is a first pass.

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `readability` | openness            | logical blocks jammed together with no blank line | nit |
| `readability` | guard-clause        | happy path buried in nesting an early return would flatten | medium |
| `readability` | explaining-variable | an opaque inline expression a named local would explain | nit |
| `readability` | magic-literal       | an unexplained literal carrying domain meaning | medium |
| `readability` | composed-method     | a function doing many tasks or mixing abstraction levels | high |
| `readability` | ordering            | helpers not in stepdown / newspaper order under their caller | medium |
| `tests`       | test-structure      | arrange/act/assert (given/when/then) interleaved or out of order | medium |

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
  spacing everything.

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
  an enum/const for the status) and reference the name.
- **Calibration → not a finding**: literals that are self-evidently themselves —
  `0`/`1`/`-1` as identity/index/step, `2` in a halving, an empty string/array
  default, an obvious base case; or a one-off literal whose meaning the surrounding
  name already makes plain. Don't name `i + 1`.

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
  - the body is long enough to need internal section comments to navigate.
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
  sit at the top; and any ordering the project documents (Step 0). Don't relocate
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
