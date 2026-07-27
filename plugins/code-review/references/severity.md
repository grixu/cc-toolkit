# Master severity table — the single source for grading a quality finding

Every quality finding carries one **family**, one **rule**, and one **severity**, all
three **verbatim** from this table — never a code number, never a paraphrase invented
this run. Two reviews of the same code name the same `family` · rule every time.

Severity is exactly one of `high`, `medium`, or `nit`. There is no `low`, and no
numeric scale.

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
| `naming`      | intent-name         | a name after mechanism/algorithm, not intent | medium |
| `naming`      | role-name           | a name carrying the type instead of the role | nit |
| `naming`      | command-query       | a query that mutates, or a command relied on only for its return | high |
| `module`      | style-mix           | OOP and functional mixed ad hoc (a misplaced free function or class) | high |
| `module`      | barrel              | a pointless re-export `index.*` that narrows nothing | medium |
| `objects`     | full-construction   | a half-initialized object, or leaked representation callers couple to | high |
| `objects`     | lazy-init           | an expensive-and-maybe-unneeded value computed eagerly | medium |
| `objects`     | leaky-collection    | a getter returning the raw internal mutable collection | high |
| `patterns`    | composition         | inheritance that already causes duplication/coupling delegation would remove | medium |
| `patterns`    | polymorphism        | the same type-discriminant `if`/`switch` repeated in ≥2 places | medium |
| `patterns`    | execute-around      | a paired setup/teardown left to callers, already duplicated or forgotten | medium |
| `simplicity`  | over-complex        | code that collapses into something smaller (duplication → one parameter) | high |
| `simplicity`  | needless-cast       | a type cast the value's type already guarantees | high |
| `simplicity`  | dead-code           | code that can never run or whose result is never used (an unreachable branch, an unread binding) | high |

## What each severity means

- **high** — a wrong structural decision or real waste: collapsible duplication
  (`over-complex`), a function doing too much (`composed-method`), an OOP/functional
  break that misplaces code (`style-mix`), a query that secretly mutates
  (`command-query`), a half-formed object or leaked representation
  (`full-construction`, `leaky-collection`), a cast that masks a stale type
  (`needless-cast`), and dead or unreachable code (`dead-code`). These cost the most to
  live with.
- **medium** — readability friction a reader feels every time, or a latent gap that
  matters: `ordering`, `test-structure` interleaving, a `test-fidelity` name/fixture
  that claims more than its assertions check, `guard-clause` nesting, an unexplained
  `magic-literal`, a mechanism `intent-name`, eager `lazy-init`, pointless
  indirection (`barrel`), and the pattern rules (`composition`, `polymorphism`,
  `execute-around`) once their friction is real.
- **nit** — local `openness` / spacing, an inline `explaining-variable`, a
  type-in-the-name `role-name`. Real, but cheap; cluster them so the report does not
  drown in nits.

## Anti-anchoring

Severity is a property of the rule, not of the file's overall impression. Grade each
finding on its own row above, then stop. A finding keeps its row's severity even when
the change is otherwise clean, small, or correct — that anchoring ("the file reads
well, so this can only be a nit") is exactly how a real medium gets buried. A clean
file with one `test-structure` interleaving has a *medium* finding, not a nit.

The one lever that legitimately changes an outcome is a rule's own calibration turning
a candidate into a **non-finding**. Once something is a finding, its severity comes
from this table, full stop — and the same rule carries the same severity everywhere in
a report.
