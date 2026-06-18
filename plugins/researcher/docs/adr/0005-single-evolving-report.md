# A single evolving Report across follow-up runs, holistically re-edited

Between-run follow-ups (ADR-0003) could each produce a fresh standalone report or extend one
artifact. We keep **one evolving Report**: each follow-up run merges its new **Findings**, the
**Editor** re-cuts the *whole* accumulated answer, and the **Composer** re-renders the entire
`output.html`. **Source** ids are append-only and never renumber; the prior file is snapshotted
before each overwrite.

**Why:** one canonical, shareable deliverable that deepens over time — and holistic re-editing
(rather than appending a section per run) is what stops the document from bloating back into "lanie
wody" at the whole-document level, which the linear, nothing-hidden layout would otherwise invite.
The persisted prior answer seeds each re-edit, so the **Editor** must treat it as a draft to re-cut
wholesale — not fixed text to append to — and the **Findings** stay the source of truth wherever
prose and findings drift.

**Trade-off accepted:** the run must persist machine-readable state (sources + findings + answer)
beside `output.html` for the next run to read and extend, and re-editing the full document costs more
tokens as it grows — bounded by the same `maxRounds` cap as the research loop (not a token budget; see
ADR-0003). Snapshots mitigate the lost-history risk of overwriting.
