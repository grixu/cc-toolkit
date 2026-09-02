# start-cr fans out to an active lens set resolved per run, and root standards files generate findings

Status: accepted

Amends 0001's "exactly five parallel scanners". `start-cr` now resolves an
**active lens set** in a new Step 2b, after scope and conventions and before
dispatch: the five craft lenses (comments, readability & tests, naming & module,
objects & patterns, simplicity & types) plus `security` are always active;
`performance` is active only when the resolved files contain executable source
(the `source` file kind — not tests, not infrastructure-as-code, not `.sh`);
`spec` is active only when the user passed `--spec <local path>`. The
orchestrator dispatches N scanners (6 to 8), waits for N `<result>` blocks,
applies fail-closed re-dispatch to every active lens, merges once all N have
delivered, and records `Lenses: L of 8` in the tally with every inactive lens
and its reason. The user still picks no lens: the change and the `--spec` flag
decide.

Three lenses get their own rules files (`security.md`, `performance.md`,
`spec.md`), read by `start-cr` only. Ten further rules from the same proposal —
architecture, structural, and code-smell reviews — are **folded** into existing
lenses rather than given scanners: four `module` rules (dependency-direction,
misplaced-logic, canonical-helper, pass-through), three `objects` rules
(feature-envy, data-clump, message-chain), and three flag bullets on existing
rules (`composed-method`, `intent-name`, `dead-code`). The fixed severity table
grows from 22 to 42 rows across ten families.

An eleventh family, `standards`, has no fixed rows. Its rules come from a root
pair, `CODING_STANDARDS.md` and `CODING_STANDARDS.local.md`, read by every
scanner as step 0 of the mechanical convention read under **LAYER** semantics:
both files apply, and `.local` wins per statement on conflict. An explicit,
quotable rule inside a scanner's own lens subject generates a `standards`
finding that quotes the rule and cites file and section; severity maps from the
rule's keyword (MUST/MUST NOT/NEVER/ALWAYS → high, SHOULD → medium, MAY/prefer/consider →
nit, none → medium). Vague prose generates nothing, and formatting rules are
skipped when a formatter or linter config exists at the root. Every other
convention file (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.claude/rules`)
keeps its suppress-only role.

## Considered Options

- **Separate architecture / structural / smells scanners** — rejected: about 80%
  of their rules overlapped rules the existing families already carry (a
  misplaced free function is `style-mix`, duplicated logic is `over-complex`),
  so three more scanners would have produced the same findings under three more
  names and paid three more briefs per run.
- **A `critical` severity for security findings** — rejected: a fourth grade
  invites anchoring ("only high, not critical") and the apply menu already treats
  every security finding as a structural walk; `security` and `spec` simply
  never grade `nit`.
- **A `types` family via Primitive Obsession and explicit type boundaries** —
  rejected: no `path:line` bar survives calibration (every string parameter is a
  candidate), and the language-applicability rules already clear typed concerns
  where the language has none.
- **REPLACE semantics for `CODING_STANDARDS.local.md`** — rejected: a personal
  overlay that replaces the shared file forces the author to copy it whole to
  relax one rule, and the copy silently drifts; LAYER lets one statement override
  one statement.
- **Standalone skills for the gated lenses** — rejected: `security` has no
  partial-review use case distinct from `/security-review`, `performance` and
  `spec` depend on the orchestrator's file-kind resolution and `<spec>` brief
  slot, and three more skills would triple the parity surface of every future
  change.
- **A `kind` field emitted by `get_changes.py`** — rejected: path-argument mode
  bypasses the script entirely, so the file-kind globs live in `scope.md` prose
  where both modes read them, and the script stays unchanged.

## Consequences

- "Five" is no longer an invariant anywhere: every count in the command, the
  skills, the references, and the docs is N, 8, 11, or 42, and a future lens
  adds a gate to Step 2b rather than a new number to hunt down.
- The gated lenses have no eval surface except the scanner-track prompts — no
  standalone skill means no skill-level fixture, so their recall and noise gates
  emulate the brief directly.
- Every scanner pays the standards slice: the root pair is read on every run,
  and each brief carries a `<standards>` slot the orchestrator pre-slices per lens
  when the file is long.
