# Master severity table — the single source for grading a finding

Every finding that reports as `family` · rule · severity carries one **family**, one
**rule**, and one **severity**, all three **verbatim** from this table — never a code
number, never a paraphrase invented this run. Two reviews of the same code name the
same `family` · rule every time. Eleven families report in that shape: the ten below
with **42 fixed rows**, plus `standards`, whose rules are the project's own and are
graded by the mapping at the end of this file.

Severity is exactly one of `high`, `medium`, or `nit`. There is no `low`, no
`critical`, and no numeric scale.

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
| `module`      | dependency-direction | an added import that closes a cycle, or points from a shared/lower module into a feature/higher one | high |
| `module`      | misplaced-logic     | feature-specific branch/constant/type added to a module imported by ≥2 unrelated features | medium |
| `module`      | canonical-helper    | a new helper duplicating an exported helper elsewhere in the repo | high |
| `module`      | pass-through        | a function/class/wrapper the change adds that forwards unchanged, has one caller or one case, and removes no branch/mode/layer (absorbs middle-man, needless-indirection, relocate-not-reduce) | medium |
| `objects`     | full-construction   | a half-initialized object, or leaked representation callers couple to | high |
| `objects`     | lazy-init           | an expensive-and-maybe-unneeded value computed eagerly | medium |
| `objects`     | leaky-collection    | a getter returning the raw internal mutable collection | high |
| `objects`     | feature-envy        | a method reading/computing over another object's fields more than its own | medium |
| `objects`     | data-clump          | the same ≥3 fields/params travelling together in ≥3 places | medium |
| `objects`     | message-chain       | a caller navigating `a.b().c().d()` across ≥2 foreign object boundaries | medium |
| `patterns`    | composition         | inheritance that already causes duplication/coupling delegation would remove | medium |
| `patterns`    | polymorphism        | the same type-discriminant `if`/`switch` repeated in ≥2 places | medium |
| `patterns`    | execute-around      | a paired setup/teardown left to callers, already duplicated or forgotten | medium |
| `simplicity`  | over-complex        | code that collapses into something smaller (duplication → one parameter) | high |
| `simplicity`  | needless-cast       | a type cast the value's type already guarantees | high |
| `simplicity`  | dead-code           | code that can never run or whose result is never used (an unreachable branch, an unread binding) | high |
| `security`    | secret-in-source    | credential/private key/password-bearing string as a literal, or a secret written to a log/exception | high |
| `security`    | injection-sink      | externally-influenced data reaching SQL/command/path/HTML/eval/deserialization by concatenation | high |
| `security`    | missing-access-check | handler reading/mutating a resource with no authn/authz guard, or request-supplied id with no ownership/tenant predicate | high |
| `security`    | unvalidated-boundary | HTTP/CLI/env/queue/third-party payload used in logic or persistence with no parse/validate at entry | medium |
| `security`    | insecure-setting    | a literal disabling a protection (`rejectUnauthorized:false`, `verify=False`, unsafe `yaml.load`, `Math.random` for tokens, CORS `*`+credentials) | high |
| `performance` | n-plus-one          | per-item DB/HTTP/IO call inside a loop over an unbounded collection where a batch form exists | high |
| `performance` | unbounded-fetch     | a list read with no limit/pagination over data that grows (incl. list endpoints) | medium |
| `performance` | blocking-in-async   | sync blocking call on a request-serving/event-loop path (N/A outside Node & Python asyncio) | medium |
| `performance` | wasted-render       | React: fresh object/array/arrow passed to a memoised child or hook dependency (N/A outside `.tsx/.jsx`) | medium |
| `spec`        | missing-requirement | a spec line nothing in the diff implements | high |
| `spec`        | wrong-implementation | a requirement implemented, but the implementation contradicts the spec line | high |
| `spec`        | partial-requirement | a requirement only partly implemented | medium |
| `spec`        | scope-creep         | behaviour in the diff no spec line asked for | medium |

## What each severity means

- **high** — a wrong structural decision, real waste, or a real exposure: collapsible
  duplication (`over-complex`), a function doing too much (`composed-method`), an
  OOP/functional break that misplaces code (`style-mix`), a query that secretly mutates
  (`command-query`), a half-formed object or leaked representation
  (`full-construction`, `leaky-collection`), a cast that masks a stale type
  (`needless-cast`), dead or unreachable code (`dead-code`), an import that closes a
  cycle or inverts the layering (`dependency-direction`), a helper the repo already
  exports (`canonical-helper`), a per-item call that multiplies with the data
  (`n-plus-one`), a spec line left unimplemented or implemented against its wording
  (`missing-requirement`, `wrong-implementation`), and the four security rules that
  name a confirmed exposure — a literal credential (`secret-in-source`), untrusted data
  reaching a sink (`injection-sink`), an unguarded resource (`missing-access-check`),
  and a protection switched off (`insecure-setting`). These cost the most to live with.
- **medium** — readability friction a reader feels every time, or a latent gap that
  matters: `ordering`, `test-structure` interleaving, a `test-fidelity` name/fixture
  that claims more than its assertions check, `guard-clause` nesting, an unexplained
  `magic-literal`, a mechanism `intent-name`, eager `lazy-init`, pointless
  indirection (`barrel`, `pass-through`), feature logic leaking into a shared module
  (`misplaced-logic`), a method living on the wrong object (`feature-envy`), values
  that always travel together (`data-clump`), a caller coupled to other objects'
  internals (`message-chain`), the pattern rules (`composition`, `polymorphism`,
  `execute-around`) once their friction is real, a boundary value used before it is
  validated (`unvalidated-boundary`), a read that grows with the data
  (`unbounded-fetch`), a blocking call on a serving path (`blocking-in-async`), a
  re-render the memoisation was meant to prevent (`wasted-render`), and a requirement
  half-met or exceeded (`partial-requirement`, `scope-creep`).
- **nit** — local `openness` / spacing, an inline `explaining-variable`, a
  type-in-the-name `role-name`. Real, but cheap; cluster them so the report does not
  drown in nits.

A `security` or `spec` finding is never `nit`: those families grade `high` or `medium`
only, and a doubt about one goes to CANDIDATES or `Not flagged`, never to a softer
severity.

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

## standards

The `standards` family has no fixed rows: its rules are the project's own, read from
`CODING_STANDARDS.md` and `CODING_STANDARDS.local.md` at the repository root (the read
and the layering are in `scope.md`). Severity comes from the rule's own keyword:

| keyword in the quoted rule | severity |
|----------------------------|----------|
| MUST / MUST NOT / NEVER / ALWAYS | high |
| SHOULD | medium |
| MAY / prefer / consider | nit |
| no keyword | medium |

The slug is short kebab-case derived from the rule's wording, and the same rule gets
the same slug throughout a report. Anti-anchoring applies unchanged: the keyword sets
the severity, the file's overall impression does not. A `standards` bullet has this
exact shape:

```
`standards` · <slug> · <sev> · L<lines> — "<quoted rule>" (CODING_STANDARDS.md › <section>) → <fix as a clause>
```

The quoted rule and the file › section citation are mandatory — a `standards` finding
that cannot quote its rule is not a finding.
