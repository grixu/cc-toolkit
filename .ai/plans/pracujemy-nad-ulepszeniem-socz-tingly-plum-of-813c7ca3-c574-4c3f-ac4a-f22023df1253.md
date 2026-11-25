# comments lens: Matt Pocock's taxonomy (tautology · stale · excuse · decision record)

## Context

Matt Pocock's prompt (x.com/mattpocockuk/status/2123798388227403983) sorts every comment into
four kinds: **Tautology** (delete), **Stale** (delete), **Excuse** (a comment that licenses a
hack; delete + file an issue), **Decision Record** (move to an ADR). The `comments` lens
(`plugins/code-review/references/rules/comments.md`, R1–R12) already covers tautology (R1/R7/R11)
and part of stale (R9 contradiction, R6 history). It has no notion of an excuse, and R2 keeps
every decision inline. Today R6 even *keeps* an open `TODO: proper fix later` as a "landmine".

Owner decisions (2026-11-24):
- **Decision records — hybrid.** A local *why* (this line's limit, ordering, gotcha) stays
  inline. A cross-cutting decision goes MOVE → ADR, only when the repo has an ADR directory.
- **Excuse — flag only.** The comment stays; the lens reports it report-only, so the author
  fixes the shortcut or rewrites the comment into the real constraint. No issue filing.
- **Scope — the lens only.** No repo-wide sweep, lint ratchet or LOC estimate.

Verdict set and report shape stay unchanged (KEEP/REMOVE/REWRITE/MOVE/ADD), so
`evals/checks/report.mjs`, the tally and cr-merge's return shape need no change.

## Steps

### Rules — `references/rules/comments.md`
- [x] Add a short **triage** paragraph after the deletion test: sort each comment first as
      tautology (R1/R7/R11), stale (R9), excuse (R13), decision record (R2 KEEP or R14 MOVE),
      then apply the rule. Update title/Contents to R1–R14; drop the duplicated
      "when two rules collide" paragraph (L32–34 and L54–56 say the same).
- [x] **R9 → "contradicts or outlived the code"**: add a *stale reference* bullet — a comment
      naming an identifier, flag, file or approach the code no longer has. Grep the name
      before claiming it (same evidence bar as R9 today); REMOVE if nothing survives, else
      REWRITE. Keep the R9 vs `coherence` · doc-drift seam unchanged.
- [x] **New R13 — Excuse.** Tell: the comment concedes the code is wrong, temporary or lazy
      ("hack", "quick fix", "for now", "for simplicity we just", "not ideal", "good enough",
      `TODO/FIXME: proper fix later`) without naming a constraint that makes it right.
      Verdict **REWRITE**, always `report-only`; the fix names the proper fix at the site, or
      the honest constraint text if the shortcut is deliberate. Contrast → KEEP (R2): a
      workaround that names its cause (`upstream bug in X ≤2.3`, an API limit).
- [x] **R6 exception + "R6 vs landmine" trap**: keep only a TODO tied to an external,
      checkable trigger (`remove once Safari <16 is dropped`); a TODO that only defers a
      proper fix is R13.
- [x] **New R14 — Decision record belongs in an ADR.** Fires only when (a) the comment
      records a choice between alternatives or a rule other modules must follow, and (b) the
      repository of the file has an ADR directory (`docs/adr/`, `doc/adr/`, `adr/`,
      `docs/decisions/`; Glob from the file's repo root). Verdict **MOVE**; destination =
      `<adr-dir>/<next-number>-<slug>.md` with a 2–4 sentence draft (context, decision,
      consequence) in the repo's ADR headings; the code keeps nothing, or one line of the
      local constraint if one exists. No ADR dir, or a local why → R2 KEEP. Add a trap
      "R14 vs local why".
- [x] Always-KEEP list: unchanged apart from pointing R2 at R14 for the cross-cutting case.

### Contracts and orchestration
- [x] `references/scanner-contract.md` (comments lens, ~L85–109): mention R13 report-only
      and R14 MOVE destination shape (ADR path + draft text).
- [x] `references/merge-contract.md` risk classes (~L141, L167–189): R13 REWRITE is
      `report-only`; R14 MOVE stays `structural`.
- [x] `commands/start-cr.md` (~L465–470, MOVE apply): for an R14 MOVE, on the walk's yes,
      Write the new ADR modelled on the newest ADR's headings and numbering, then delete the
      comment; if the next number or format is ambiguous, hand the user the text instead.
      Check `codex/skills/start-cr/SKILL.md` for a parallel apply section and mirror it. (Checked: it has no apply section of its own, nothing to mirror.)

### Docs
- [x] `plugins/code-review/README.md` (L13 "12 comment rules", L77 lens row, L109–116),
      `CONTEXT.md` (L35 R1–R12, L41), docs site pages
      `docs/src/content/docs/plugins/code-review/{how-it-works.md,reference.md}` + `pl/` copies.
- [x] New `docs/adr/0006-comment-taxonomy.md`: why hybrid ADR and flag-only excuse instead of
      Matt's delete-everything; source link.
- [x] `CHANGELOG.md` `[Unreleased]` → Added R13/R14, Changed R9/R6.

### Evals (`plugins/code-review/evals/`)
- [x] Baseline first: `pnpm eval:code-review -- "eval-[0-4]|eval-28" --trials 3`, archived. (Changed: anchored pattern `^eval-([0-4]|28) `, run from a HEAD worktree; HEAD scored 0/3 on eval-0/1/3 because the quote check required the comment marker — fixed in `checks/report.mjs`, baseline re-run 17/18.)
- [x] Fixture `cases/comment-taxonomy/` (synthetic, but fixtures live in R2 per README L49):
      `src/retry-client.ts` with three excuses (R13), a `TODO` with an external trigger
      (KEEP), a named-cause workaround (KEEP), a stale ref to a removed `legacyNormalize()`
      (R9), a cross-cutting decision comment and a local-why comment; plus `docs/adr/0001-*.md`.
      `reset-sandbox.sh` builds two git-inited sandboxes: `.sandbox/comment-adr` (with ADR
      dir) and `.sandbox/comment-noadr` (same file, no ADR dir).
- [x] Cases in `promptfooconfig.yaml` (comment-track prompt, existing `commentVerdict` /
      `commentKept` / `commentFix` checks): recall (R13×3 REWRITE, R9 stale, R14 MOVE with
      `docs/adr/0002-` in the fix) and calibration (no-ADR twin keeps the decision; trigger
      TODO, named workaround and local why stay KEEP). Add rows to the README case table.
- [x] `pnpm eval:data push code-review` (R2 keys via the user's secrets `!`), commit new pin.

## Verification
- `node scripts/verify-plugins.mjs`, `claude plugin validate plugins/code-review`,
  `claude plugin test plugins/code-review` (the `verify` skill).
- `pnpm eval:code-review -- "eval-[0-4]|eval-28|<new ids>" --trials 3`: new cases pass ≥2/3,
  old comment cases not below baseline (paired against the archived run).
- [ ] (Not run.) One manual `/start-cr` over a small real diff with a hack comment, to see R13 land in the
  report as report-only and not in the safe batch.

## Notes
- Doc/code inconsistency found: `docs/adr/0001-lens-granular-scanners.md` L18 lists verdicts
  without ADD; fix in the same docs commit.
- No tracing exists, so "improvement" rests on the eval numbers above only.
