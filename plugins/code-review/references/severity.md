# Master severity table — the single source for grading a finding

Every finding that reports as `family` · rule · severity carries one **family**, one
**rule**, and one **severity**, all three **verbatim** from this table — never a code
number, never a paraphrase invented this run. Two reviews of the same code name the
same `family` · rule every time. Every family reports in that shape: the fixed families
below, each with its own rows, plus `standards`, whose rules are the project's own and
are graded by the mapping at the end of this file.

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
| `tests`       | mutation-gap        | a decision the change adds or modifies that the unit's tests exercise but would still pass if inverted, shifted by one, or deleted | medium |
| `naming`      | intent-name         | a name after mechanism/algorithm, not intent | medium |
| `naming`      | role-name           | a name carrying the type instead of the role | nit |
| `naming`      | command-query       | a query that mutates, or a command relied on only for its return | high |
| `module`      | style-mix           | OOP and functional mixed ad hoc (a misplaced free function or class) | high |
| `module`      | barrel              | a pointless re-export `index.*` that narrows nothing | medium |
| `module`      | dependency-direction | an added import that closes a cycle, or points from a shared/lower module into a feature/higher one | high |
| `module`      | misplaced-logic     | feature-specific branch/constant/type added to a module imported by ≥2 unrelated features | medium |
| `module`      | canonical-helper    | a new helper duplicating an exported helper elsewhere in the repo | high |
| `module`      | pass-through        | a function/class/wrapper the change adds that forwards unchanged, has one caller or one case, and removes no branch/mode/layer (absorbs middle-man, needless-indirection, relocate-not-reduce) | medium |
| `objects`     | full-construction   | a half-initialized object the caller must finish before it is usable | high |
| `objects`     | exposed-representation | a public mutable field or a getter exposing the internal layout, so callers couple to the representation | medium |
| `objects`     | lazy-init           | an expensive-and-maybe-unneeded value computed eagerly | medium |
| `objects`     | leaky-collection    | a getter returning the raw internal mutable collection | high |
| `objects`     | feature-envy        | a method reading/computing over another object's fields more than its own | medium |
| `objects`     | data-clump          | the same ≥3 fields/params travelling together in ≥3 places | medium |
| `objects`     | message-chain       | a caller navigating `a.b().c().d()` across ≥2 foreign object boundaries | medium |
| `patterns`    | composition         | inheritance that already causes duplication/coupling delegation would remove | medium |
| `patterns`    | polymorphism        | the same type-discriminant `if`/`switch` repeated in ≥2 places | medium |
| `patterns`    | execute-around      | a paired setup/teardown left to callers, already duplicated or forgotten | medium |
| `simplicity`  | over-complex        | duplicated logic that collapses into one shape (near-identical functions → one parameter, a copy-pasted block → one extraction) | high |
| `simplicity`  | shallow-duplication | duplication with no logic to drift (near-identical test cases or fixtures, a repeated one-line expression, a restated declaration) | medium |
| `simplicity`  | verbose             | a single piece of code, nothing repeated, longer or more nested than its idea needs (an `if/else` chain that is a lookup, a loop that is a `map`) | nit |
| `simplicity`  | needless-cast       | a type cast the value's type already guarantees | high |
| `simplicity`  | dead-code           | code that can never run or whose result is never used (an unreachable branch, an unread binding, a function nothing calls) | high |
| `simplicity`  | dead-code-surface   | surface nothing consumes (an unused export or return field, a redundant fallback or conjunct) | medium |
| `security`    | secret-in-source    | credential/private key/password-bearing string as a literal, or a secret written to a log/exception | high |
| `security`    | injection-sink      | externally-influenced data reaching SQL/command/path/HTML/eval/deserialization by concatenation | high |
| `security`    | missing-access-check | handler reading/mutating a resource with no authn/authz guard, or request-supplied id with no ownership/tenant predicate | high |
| `security`    | unvalidated-boundary | HTTP/CLI/env/queue/third-party payload used in logic or persistence with no parse/validate at entry | medium |
| `security`    | insecure-setting    | a literal disabling a protection (`rejectUnauthorized:false`, `verify=False`, unsafe `yaml.load`, `Math.random` for tokens, CORS `*`+credentials) | high |
| `security`    | iac-exposure        | infrastructure code storing a secret where others can read it (state, an unmarked output), or a trust/access grant wider than the identity it names | high |
| `security`    | access-widening     | the change relaxes an authorization boundary that existed — a weaker permission, a removed guard or owner predicate, an allowlist opened up | high |
| `performance` | n-plus-one          | per-item DB/HTTP/IO call inside a loop over an unbounded collection where a batch form exists | high |
| `performance` | unbounded-fetch     | a list read with no limit/pagination over data that grows (incl. list endpoints) | medium |
| `performance` | blocking-in-async   | sync blocking call on a request-serving/event-loop path (N/A outside Node & Python asyncio) | medium |
| `performance` | wasted-render       | React: fresh object/array/arrow passed to a memoised child or hook dependency (N/A outside `.tsx/.jsx`) | medium |
| `performance` | missing-index       | a query the change adds filters, joins or sorts a growing table on a column no index covers | medium |
| `correctness` | wrong-condition     | a comparison, boolean or null check that selects the wrong branch for an input the code must handle | high |
| `correctness` | unhandled-case      | a value the input can take — an enum member, an empty/absent value, an error result — that no branch handles, so it falls into a wrong default | high |
| `correctness` | off-by-one          | a bound, index, slice or loop limit one step off, dropping or repeating the first or last element | high |
| `correctness` | swallowed-error     | an error caught, ignored or turned into a success value, so the caller proceeds on a failure it never sees | medium |
| `correctness` | state-race          | shared state read and written across an `await`, callback or concurrent caller with no ordering | high |
| `correctness` | contract-mismatch   | a call that breaks what the callee declares — argument order or unit, a nullable return used as present, a promise not awaited | high |
| `spec`        | missing-requirement | a spec line nothing in the diff implements | high |
| `spec`        | wrong-implementation | a requirement implemented, but the implementation contradicts the spec line | high |
| `spec`        | partial-requirement | a requirement only partly implemented | medium |
| `spec`        | scope-creep         | behaviour in the diff no spec line asked for | medium |
| `coherence` | doc-drift              | a prose artifact (README, ADR, CONTEXT.md, changeset, `docs/`, `.env.example`, OpenAPI `description:`) states a behaviour, value, default, name or command the code does not have | medium |
| `coherence` | contract-drift         | two declarations of one boundary that the type checker does not connect disagree on a field, optionality, type, enum member, status or error shape (OpenAPI/proto/SDL vs handler; contracts-package schema vs hand-written client type; producer vs consumer; stale generated client) | high |
| `coherence` | schema-drift           | a migration and the ORM model / schema types / factories / seeds disagree on column, type, nullability, default or enum; a `down` that does not invert `up` | high |
| `coherence` | config-drift           | a key, port, path, script name or flag that code or CI reads is missing or named differently in the artifact that should provide it (compose, Helm values, workflow `env:`, Dockerfile, package.json scripts/exports) | high |
| `coherence` | sibling-asymmetry      | among ≥3 parallel paths where every other sibling, or a clear majority of ≥3 siblings, shares a step (validation, transaction, audit log, cleanup, error mapping, cache invalidation), one skips it | high |
| `coherence` | missing-counterpart    | one half of an inherent pair is missing: create/destroy, setup/teardown, subscribe/unsubscribe, migration up without down where the repo writes downs | medium |
| `coherence` | incomplete-propagation | the change adds an enum member, error/log code, event name, permission, or renames something, and a runtime listing of its siblings misses it (exhaustive map, switch in another module, i18n catalog, DB check constraint, OpenAPI enum) | high |
| `coherence` | invariant-breach       | code in the diff breaks an invariant an accepted ADR, CONTEXT.md, or a decision document in the diff states as a rule (single writer, writes through outbox, money as integer cents) | high |
| `assumptions` | dependency-semantics | code relies on a library/framework/runtime behaviour its installed source contradicts: option scope, defaults, redirect/header handling, what a timeout covers, in-place mutation, ordering, retry | high |
| `assumptions` | platform-semantics   | code or config relies on behaviour of where it runs that does not hold: GitHub Actions (`environment:` secrets, fork PRs get no secrets, skipped `needs` cascading), containers (`depends_on` ≠ ready), cron in UTC, at-least-once queues, DB engine semantics (collation, ON CONFLICT with partial index), replicas>1 (per repo's Helm/compose) vs in-process state | high |
| `assumptions` | version-skew         | the change uses an API/option/behaviour the locked version lacks or changed, or a runtime API newer than `engines` / `.nvmrc` / Dockerfile base | high |
| `assumptions` | mock-divergence      | a test double encodes behaviour the real dependency lacks, so the suite is green on the assumption (mocked fetch rejecting on 404) | medium |

## What each severity means

- **high** — a wrong structural decision, real waste, or a real exposure: collapsible
  duplicated logic (`over-complex`), a function doing too much (`composed-method`), an
  OOP/functional break that misplaces code (`style-mix`), a query that secretly mutates
  (`command-query`), a half-formed object or a leaked internal collection
  (`full-construction`, `leaky-collection`), a cast that masks a stale type
  (`needless-cast`), dead or unreachable code (`dead-code`), an import that closes a
  cycle or inverts the layering (`dependency-direction`), a helper the repo already
  exports (`canonical-helper`), a per-item call that multiplies with the data
  (`n-plus-one`), a spec line left unimplemented or implemented against its wording
  (`missing-requirement`, `wrong-implementation`), code that takes the wrong path for an
  input it must handle (`wrong-condition`, `unhandled-case`, `off-by-one`, `state-race`,
  `contract-mismatch`), and the six security rules that
  name a confirmed exposure — a literal credential (`secret-in-source`), untrusted data
  reaching a sink (`injection-sink`), an unguarded resource (`missing-access-check`),
  a protection switched off (`insecure-setting`), a secret or over-wide grant declared
  into infrastructure (`iac-exposure`), and a boundary the change relaxes
  (`access-widening`), and two artifacts that disagree where the disagreement breaks a
  wire format, a deploy, persistence or dispatch (`contract-drift`, `schema-drift`,
  `config-drift`, `sibling-asymmetry`, `incomplete-propagation`, `invariant-breach`), and
  code that rests on a false belief about a library, the platform or the locked version
  (`dependency-semantics`, `platform-semantics`, `version-skew`). These cost the most to
  live with.
- **medium** — readability friction a reader feels every time, or a latent gap that
  matters: `ordering`, `test-structure` interleaving, a `test-fidelity` name/fixture
  that claims more than its assertions check, a decision its tests would not notice
  changing (`mutation-gap`), `guard-clause` nesting, an unexplained
  `magic-literal`, a mechanism `intent-name`, eager `lazy-init`, copies with no logic to
  drift (`shallow-duplication`), surface nothing consumes (`dead-code-surface`), an exposed
  data layout (`exposed-representation`), pointless
  indirection (`barrel`, `pass-through`), feature logic leaking into a shared module
  (`misplaced-logic`), a method living on the wrong object (`feature-envy`), values
  that always travel together (`data-clump`), a caller coupled to other objects'
  internals (`message-chain`), the pattern rules (`composition`, `polymorphism`,
  `execute-around`) once their friction is real, a boundary value used before it is
  validated (`unvalidated-boundary`), a read that grows with the data
  (`unbounded-fetch`), a blocking call on a serving path (`blocking-in-async`), a new
  query on an unindexed column (`missing-index`), a
  re-render the memoisation was meant to prevent (`wasted-render`), a failure the caller
  never sees (`swallowed-error`), a requirement
  half-met or exceeded (`partial-requirement`, `scope-creep`), prose that describes code
  the change does not have (`doc-drift`), and one half of an inherent pair left out
  (`missing-counterpart`), and a test double that keeps the suite green on behaviour the
  real dependency lacks (`mock-divergence`).
- **nit** — local `openness` / spacing, an inline `explaining-variable`, a
  type-in-the-name `role-name`, a `verbose` site a shorter form would say plainly. Real, but cheap; cluster them so the report does not
  drown in nits.

A `security`, `correctness`, `spec`, `coherence` or `assumptions` finding is never `nit`: those families grade `high`
or `medium` only, and a doubt about one goes to CANDIDATES or `Not flagged`, never to a softer
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
