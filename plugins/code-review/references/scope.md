# Review scope policy — what gets judged, what gets skipped, what a language changes

Shared by `/start-cr` and the standalone `comment-review` / `quality-review` skills, so
the three agree on coverage. How the file list is *resolved* (the diff script, the
scope choice) stays in each surface; this file covers what to do with the list once you
have it: which files are in, which are skipped, what kind each in-scope file is, which
families or rules a language clears, and which project files override — or generate —
findings.

## In scope

Source files that carry human-authored code and comments: `.ts .tsx .mts .cts .js .jsx
.mjs .cjs .py .go .rs .java .kt .swift .c .cpp .h .rb .php .vue .scala .cs .sh`, plus
**infrastructure-as-code** — declarative surfaces that still carry comments and structure
worth reviewing: `.tf`/HCL; Dockerfiles (`Dockerfile`, `*.Dockerfile`, `Containerfile`); Helm
charts (templates and `values*.yaml` under a directory holding a `Chart.yaml`); compose files
(`docker-compose*.yml`, `compose*.yaml`); and similar. The ES-module and CommonJS extensions carry the
same hand-written code as `.js` — a build script or a config-as-code module under
`.mjs`/`.cjs` is reviewed, not skipped as tooling.

**Access policy and pipeline files** are in scope for the `security` lens: they are
config by shape, but a line in one decides who may do what, and a widening there is the
change's whole effect. `assumptions` also judges what a pipeline file believes about the CI
that runs it, and `coherence` reads them as one side of a seam; no craft lens grades them.
The set, by path: `*.rego`, `*.cedar`, `CODEOWNERS`, CI workflow
definitions (`.github/workflows/*.yml`, `.gitlab-ci.yml`, and their equivalents), and
YAML/JSON under a `policies/`, `policy/`, `rbac/` or `iam/` directory or named
`*policy*.json`/`*policy*.yaml`; plus any YAML whose own `apiVersion`/`kind` line makes it a
Cerbos policy (`api.cerbos.dev`) or a Kubernetes `Role`, `ClusterRole` or `*RoleBinding`.

## Skip

JSON, lockfiles, generated or minified files (a generator's `.d.ts`, `*_pb.*`, anything
under `dist/`, `build/`, `node_modules/`), `.md` and docs (in a comment review the prose
*is* the content), plain text (`.txt`), **static config data** (`.yaml`/`.toml`/`.ini`
settings, `.env` — YAML named as infrastructure-as-code or a policy file excepted), and
license/SPDX headers.

Note every skipped file in one line, so coverage stays honest. Skipped is not unread:
the `coherence` and `spec` lenses read skipped files for what they claim about the code,
and grade no craft in them.

**CI workflow definitions are not skipped — they are `policy` files.** A changed
`.github/workflows/*.yml` or `.gitlab-ci.yml` routinely carries a real exposure — a
`pull_request_target` job checking out and running untrusted code, a widened
`permissions:` block, a secret passed into a step that echoes it — so the `security` lens
judges it like any policy file, `assumptions` judges what it believes about the CI that
runs it, and no craft lens grades it. The dependency and action-pinning audit stays with
`/security-review`, so when a pipeline file changed the `Skipped` line still names it —
graded by `security` and `assumptions` alone — and points the reader to `/security-review`
for that audit, in those words.

**A skipped file that is the substance of the change gets its own sentence.** A
dependency manifest (`package.json`, `composer.json`, …) on a dependency-bump or upgrade
branch is the whole point of that diff, and so is the prose on a documentation branch, a
spec/ADR change, or a release-notes commit — when the skipped files *are* the change,
name that in a sentence of its own and say what the review therefore covers (often only
the handful of source files that came along for the ride). Say so explicitly rather than
burying it in the skip list: the skipped content isn't line-graded — `coherence` judges only
what it claims about the code — and the reader should read that as a deliberate scope
boundary rather than an oversight. The same sentence
carries a second boundary: a changed `.env*`, dependency manifest, or lockfile is also
**not secret- or dependency-scanned** by the `security` lens, which reads source files
only. Say that on the `Skipped` line and point the reader to `/security-review` for the
dependency and configuration audit this review does not do.

## File kinds

Every in-scope file has exactly one kind, decided mechanically by path — never by
eyeballing the content:

- **`test`** — any file under one of these directories: `__tests__/`, `test/`,
  `tests/`, `spec/`, `e2e/`, `cypress/`, `fixtures/`, `__mocks__/`, `__snapshots__/`,
  `testdata/`, and the test-support directories `test-utils/`, `test-helpers/`,
  `testutils/`, `testing/`; under any directory whose name *contains* `e2e` (`tests-e2e/`,
  `e2e-tests/`, `apps/web-e2e/`) or ends in `-tests`/`-test`; or whose name matches one
  of: `*.test.*`, `*.spec.*`, `*_test.go`,
  `test_*.py`, `*_test.py`, `conftest.py`, `*Test.php`, `*Test.java`, `*Test.kt`,
  `*Tests.cs`, `*_spec.rb`, `*.feature`, `*.stories.*`, `setupTests.*`.
- **`iac`** — `.tf`/HCL, Dockerfiles, Helm charts, compose files and the other
  declarative infrastructure-as-code surfaces named under *In scope*.
- **`policy`** — the access policy and pipeline files named under *In scope*.
- **`source`** — everything else in scope.

These consumers depend on this list:

- **`policy` files go to `security` and `assumptions`** among the lenses that grade a
  file's own lines — every craft, `correctness` and `performance` lens's `<files>` leaves
  them out, so a change that touches nothing but policy runs `security`, `assumptions` and
  `coherence`, plus `spec` when one is active;
- the **`assumptions` lens** receives the whole judged list, `policy` files included, and
  no skipped file: lockfiles, the installed dependency tree, `.nvmrc`, `engines`, a
  Dockerfile's base image and replica counts are evidence it reads, never files it judges;
- the **`spec` lens** receives the whole change — every judged file, `policy` files
  included, plus every file *Skip* leaves out but real env files (defined below): conformance
  is not line-graded craft, and a skipped workflow, manifest or doc is often exactly what a
  spec line describes. A real env file in the change is never Read; the lens may only Grep it
  for key names;
- the **`coherence` lens** receives the whole change too — every judged file, `policy`
  files included, plus every skipped file except lockfiles, generated output (a
  generator's `.d.ts`, `*_pb.*`, anything under `dist/`, minified files, snapshots) and real
  env files — every `.env*` but the templates `.env.example`, `.env.sample`, `.env.template`
  and `.env.dist` — and minus the active spec: a doc, a changeset, a migration or a compose
  file is one side of the seam it judges. A real env file in the change is never Read; the lens
  may only Grep it for key names. A change of skipped files alone still runs it;
- the **`performance` lens** receives only the `source` files, minus `.sh` files and
  `*.config.*` modules (build and tool configuration runs once, never per request) — and is not
  dispatched at all when that subset is empty (a tests-only or IaC-only change has no
  performance lens, and the report's Tally names it as skipped);
- the **`objects & patterns` lens** is not dispatched when every file in its list is
  `iac`: both its families are N/A there (see *Language applicability*), and the Tally
  names it as skipped;
- the **comments lens's higher test-file bar** (R11 in `rules/comments.md`) applies to
  exactly the `test` kind above, so "is this a test file?" is answered by the list, not
  by how the file reads.

## Language applicability

The rule families are written against imperative, object-oriented code (mostly JS/TS).
When the change targets a language where a family — or a single rule — has no
counterpart, clear it in one line instead of inventing findings to fit it.

- **HCL/Terraform, Dockerfiles, Helm charts, compose files** and other declarative
  infrastructure-as-code: no module system (`module`), no object construction
  (`objects`), no inheritance or type dispatch to refactor (`patterns`; a Dockerfile's
  stage chain is shared ancestry, not a class hierarchy), no type casts
  (`needless-cast`), and no tests inside the config itself (`tests`).
- **SQL, protobuf, plain config-as-code**: similar.
- **`performance` · wasted-render** applies only to `.tsx`/`.jsx` files (React's
  memoisation model); it is N/A everywhere else, Vue included.
- **`performance` · blocking-in-async** applies only to Node and Python asyncio code
  paths; it is N/A outside those two runtimes.

A family that *does* have a counterpart stays in play — `naming`, `comments`,
`readability`, and duplication (`over-complex`) apply almost everywhere. Clear a family
or a rule on language grounds only, never a whole lens — the one exception is `objects
& patterns` over a list of `iac` files alone, which the lens set makes inactive because
both its families are N/A there. The Step 2 conventions note
names an N/A rule the same way it names an N/A family, so the owning Scanner clears it
in one line.

## Project conventions override these rules

Gather conventions **mechanically, by exact path** — not by eyeballing an `ls`, which is
how the repo-root files (the ones that most often carry the decisive rule) get skipped.
Work this fixed order and Read each path that exists. The whole order, the standards
pair included, is read in path-argument mode too — a review of explicit paths has the
same repository root as a diff review.

0. **Standards files, root only, read first:** `CODING_STANDARDS.md`, then
   `CODING_STANDARDS.local.md`, both at the repository root and nowhere else — a
   `CODING_STANDARDS.md` inside a subdirectory is not a standards file. They **layer**:
   both apply; where they state the same rule differently, `.local` wins for that
   statement only; a `.local` with no `CODING_STANDARDS.md` beside it is fine on its own.

   Unlike every other file in this section, these two **generate** findings. A
   `standards` finding is raised only for an explicit, quotable rule — one sentence you
   can copy into the report — that falls inside the raising lens's own subject; vague
   prose ("write clean code", "keep it simple") never generates anything; a rule whose
   fit to the lens is unsettled goes to CANDIDATES, not to the report. A rule the
   `.local` file relaxes is suppressed. The finding's shape and its severity mapping are
   in `severity.md` under *standards*.

   A **tracked `.local`** is worth one line: when `git check-ignore -q
   CODING_STANDARDS.local.md` fails (the file is not ignored, so it is committed), add
   one note to the report's `Conventions` line saying so; the review otherwise proceeds
   unchanged, with the file still layered as above.

   **Tooling skip:** a standards rule about formatting, whitespace, import order, or
   quote style is skipped — not raised, not listed — when a formatter or linter config
   exists at the repository root, because the tool already enforces it. This is a
   presence check only; never run the tool. The configs that count: `.prettierrc*`,
   `biome.json`, `eslint.config.*` / `.eslintrc*`, `.editorconfig`, `ruff.toml` or a
   `[tool.ruff]` table in `pyproject.toml`, `.golangci.yml`, `rustfmt.toml`,
   `phpcs.xml` / `.php-cs-fixer*`.

1. **Repository root, always next:** `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`,
   `.cursor/rules`. Read these before anything directory-level; a dir-level file never
   stands in for the root, and the harness's auto-load never stands in for reading it
   yourself.
2. **The directory chain:** for each reviewed file, walk root → its directory and Read
   any `CLAUDE.md` / `AGENTS.md` along the way.
3. **Rule files:** every file matched by `.claude/rules/*.md` at the root, and the same
   glob inside a reviewed subtree that carries its own.

Steps 1–3 only **suppress**. What they document is the standard here: if the project
documents barrel exports as its public-API style, a layered file ordering, a naming
convention, or a sanctioned anchor-comment prefix (e.g. `AGENTS-NOTE:`), that is not a
finding — a rule you would otherwise raise becomes a non-finding when the project has
deliberately chosen it. A sanctioned prefix clears the prefix, not the text after it: the
comment rules still judge that, within the limits the project sets for the shape. Capture what you picked up in one short conventions note.

**Precedence** when two of these files disagree, most specific first: a file in a
closer directory > `CODING_STANDARDS.local.md` > `CODING_STANDARDS.md` > `CLAUDE.md` /
`AGENTS.md` / `.claude/rules/*.md` > `CONTRIBUTING.md` / `.cursor/rules` > the plugin's
own rules files. A conflict between two *project* files is reported on the
`Conventions` line — the higher one wins for the verdict, but the disagreement is never
resolved silently.
