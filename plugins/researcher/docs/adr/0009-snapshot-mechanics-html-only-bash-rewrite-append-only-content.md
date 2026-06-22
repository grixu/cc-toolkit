# Snapshot mechanics: HTML-only, a deterministic Bash copy+rewrite, content artifacts append-only

ADR-0005 made the Report a single **evolving** file, snapshotted before each overwrite. ADR-0008 added
that snapshots **share** the live `report.css`. This settles *how* a snapshot is actually made — and the
one non-obvious consequence that ripples back into how the Composer names every diagram and image.

**The decision.** Before each overwrite the Composer writes the prior report to
`snapshots/output.<UTC-ts>.html`, where `<ts>` = `date -u +%Y%m%dT%H%M%SZ` (sortable, colon-free,
filesystem-safe). The snapshot is **HTML only**, and it is produced by a **deterministic Bash step, not an
LLM pass**: `cp` the prior `output.html` into `snapshots/`, then `sed`/`awk` to rewrite its relative links
`assets/…` → `../assets/` and `diagrams/…` → `../diagrams/`. No tokens are spent re-rendering HTML.

A snapshot therefore **shares the live styling** (`report.css`) and the pinned library (`chart.umd.js`)
through `../assets/`, while its **content stays frozen**:
- **Charts freeze inline** — a chart's `data` config and its `<noscript>` `<table>` live in the HTML body
  itself, so the snapshot's own copy preserves them with no external dependency.
- **Diagrams and source images are append-only** — diagram SVGs (beside their `.mmd` sources) and any
  downloaded source images are written into `diagrams/`/`assets/` *append-only*; the Composer never
  overwrites a content artifact in place. So every old snapshot's `<img>` keeps resolving to exactly the
  artifact it was rendered with, even after a later run changes or drops that visual.

**Retention: keep all.** A snapshot is HTML text plus a few KB of shared SVG — cheap. No cap for now; a
"keep last N" knob can be added later as config, never as a silent default (pruning history is worse than
the bytes).

**Why a deterministic Bash step, not an LLM rewrite.** Snapshotting is pure mechanical transform —
copy a file, rewrite two path prefixes. Routing it through the Composer's model would burn tokens
re-emitting an entire HTML document and risk it "improving" the frozen content. `cp` + `sed` is exact,
free, and faithful by construction. This is the same instinct as ADR-0007's fidelity-by-construction:
don't ask the model to do what a deterministic tool does perfectly.

**Why share styling but freeze content.** ADR-0008 established that the *look* is identity, not content —
restyling old snapshots when `report.css` changes is desirable, so snapshots link the shared `../assets/`.
But a diagram or a chart is *content* — what the report said at that moment — and must not mutate when a
later run revises it. Hence the split: styling/library shared via `../assets/`; content frozen, with the
append-only naming making "frozen" hold even though everything lives in one shared `diagrams/`/`assets/`.

**Why append-only content artifacts (the rippling consequence).** The alternative was a fully
self-contained snapshot subfolder (`snapshots/<ts>/` with its own `assets/` + `diagrams/`): no link
rewriting, but it duplicates the ~70 KB `chart.umd.js` + `report.css` per snapshot and **breaks ADR-0008's
shared-styling** (old snapshots would keep their own stale CSS). Append-only-into-the-shared-folders keeps
ADR-0008 intact and costs only small orphaned files (SVGs no longer referenced by the live report, still
referenced by snapshots). It also mirrors the **append-only source ids** already at the core of the design
(ADR-0005/0006) — the same rule, extended from citations to visual artifacts: never renumber, never
overwrite, so older references never rot.

**Trade-off accepted:** `diagrams/`/`assets/` accumulate small orphaned content artifacts over a report's
life (the price of frozen snapshots without per-snapshot duplication), and the Composer's diagram/image
naming must guarantee uniqueness per run (an append-only scheme, e.g. a per-round or content suffix) rather
than reusing stable names. In exchange: snapshots are faithful, styling stays unified and updatable, and
the report root stays clean — `output.html` is unambiguously the live report, history sits in `snapshots/`.

**Consistent with ADR-0005** (extends its snapshot decision with the concrete mechanism),
**ADR-0007** (fidelity-by-construction via a deterministic tool; agent-readable bodies — append-only `.mmd`
sources stay resolvable for a reading agent), and **ADR-0008** (snapshots share the live stylesheet rather
than freezing a copy).
