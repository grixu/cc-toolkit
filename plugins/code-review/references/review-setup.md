# Review setup — the conventions note, the standards slot, the active lens set

What a review settles once, after its file list is resolved and before any Scanner runs. Two
callers use it: `/start-cr` Steps 2 and 2b, and the `cr-prepare` skill. Every path in this file is
relative to the directory it sits in, the plugin's `references/`.

## The conventions note and the standards slot

`scope.md` carries the **mechanical convention
read** (the exact paths, root first) and the **language-applicability** rules for
families or rules that have no counterpart in the language under review. That read
now opens with the **standards pair** at the repository root — `CODING_STANDARDS.md`,
then `CODING_STANDARDS.local.md` — which LAYER: both apply, and where two statements
conflict the `.local` one wins. Work it there, then:

- capture what you learned in one short **conventions note**, and **pass it to every
  Scanner** so a documented convention never surfaces as a finding; the note also
  records a **tracked `.local` file** (`git check-ignore` fails on it) and any
  **conflict between two project files** (resolved by scope.md's precedence order),
  both of which reach the report's `Conventions` line;
- **one note, the same for every Lens, and it may only suppress.** Write it once, as the context
  directory's `conventions.md` that every Scanner reads: a per-Lens note is a per-Lens instruction, and the Scanner
  reads whatever it finds there as what you want it to look for. So the slot holds nothing but
  documented conventions, each **quoted verbatim with its file** — never your own threat
  hypotheses or "where to focus", never an "established facts — do not raise" list, never a
  paraphrase of a rule (one run's paraphrase said a legacy pattern "is documented as accepted"
  where the rule said to migrate off it, and buried the very finding the user later asked for).
  Anything you want checked belongs in the Lens's own rules file, not here. A note that grows
  past a screen is the wrong shape: cut it to the rules that actually suppress something;
- name any family or rule the language makes **N/A** in that note, so its owning
  Scanner clears it in one line instead of inventing findings to fit;
- keep the standards text **out of the note**: it travels in the brief's own
  `<standards>` slot because, unlike everything else the read picks up, it
  **generates** findings. A Scanner raises `` `standards` · <slug> · <sev> `` only for
  an explicit, quotable rule inside its own Lens's subject, citing the file and
  section; vague prose ("write clean code") never generates; unsettled fit goes to
  `CANDIDATES`; a rule the `.local` file relaxes is suppressed; and a
  formatting/whitespace/import-order/quote rule is skipped when a formatter or linter
  config exists at the root (scope.md lists the presence check). When the pair is long,
  **pre-slice it per Lens** so each Scanner receives only the rules in its subject; a
  short pair goes to every Scanner whole. The rest of the conventions — `CLAUDE.md`,
  `AGENTS.md`, `CONTRIBUTING.md`, `.cursor/rules`, `.claude/rules` — stay
  **suppress-only**: they remove findings, never create them.

## The active lens set

Not every Lens runs on every change. Decide the set here, once, from the input —
never from a preference:

- the five craft Lenses (`comments`, `readability & tests`, `naming & module`,
  `objects & patterns`, `simplicity & types`), **`correctness`**, **`security`**,
  **`coherence`** and **`assumptions`** are **always active**, on any change however small
  — except that a Lens whose own `<files>` comes out empty is inactive with that reason: a
  change of `policy` files only runs `security`, `assumptions` and `coherence`, plus `spec`
  when one is active; a change whose every file is skipped — documents, changesets, config
  data — runs `coherence` alone, plus `spec` when one is active, and `coherence` reads the
  code side of each claim from the repository;
- **`objects & patterns`** is inactive, with the reason `declarative files only`, when
  every file in its `<files>` is `iac` — both its families are N/A for infrastructure code,
  and a scanner dispatched there only writes why;
- **`performance`** is active iff the `source`-kind subset of the resolved list,
  **minus `.sh` files and `*.config.*` modules**, is non-empty — a tests-only, IaC-only, or shell-only change
  skips it;
- **`spec`** is active iff a spec resolved to a readable local file during the scope resolution — from
  `--spec`, or from the offer the user accepted when the change carried its own spec.

Record **N**, the number of active Lenses, and for each one its own `<files>`:
`performance` gets the source subset it was gated on; `security` and `assumptions` get the
full resolved list; `spec` gets the full resolved list plus every skipped file; `coherence`
gets the full resolved list plus every skipped file except lockfiles, generated output (a
generator's `.d.ts`, `*_pb.*`, anything under `dist/`, minified files, snapshots) and real env
files (every `.env*` but `.env.example`, `.env.sample`, `.env.template` and `.env.dist` — a
real one in the change it may only Grep for key names, never Read), and minus the active spec,
which is `spec`'s alone; every other Lens gets the resolved list minus its
`policy` files. Record every **inactive** Lens with its reason (`performance — no executable
code`, `spec — no spec named`, `coherence — lockfiles, generated and env files only`, `assumptions
— no judged files`, `correctness — policy or skipped files only`); the Tally prints them. From here on
**N** means this count: N Scanners run, N outputs awaited, N outputs merged.
