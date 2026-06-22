# A single evolving Report across follow-up runs, holistically re-edited

Between-run follow-ups (ADR-0003) could each produce a fresh standalone report or extend one
artifact. We keep **one evolving Report**: each follow-up run merges its new **Findings**, the
**Editor** re-cuts the *whole* accumulated answer, and the **Composer** re-renders the entire
`output.html`. **Source** ids are append-only and never renumber; the prior file is snapshotted
before each overwrite.

**Why:** one canonical, shareable deliverable that deepens over time — and holistic re-editing
(rather than appending a section per run) is what stops the document from bloating back into "lanie
wody" at the whole-document level, which the linear, nothing-hidden layout would otherwise invite.
Each run the **Synthesizer** **rebuilds the whole answer from the accumulated Findings** — it is *not*
seeded by the prior prose (the persisted `answer.md` is a write-only export, not an input). Full
rebuild, not seeding, is what keeps the **Findings** the source of truth: seeding from the prior answer
would quietly let *prose* become authoritative for settled material and entrench any error there. The
**Editor** then re-cuts that freshly rebuilt draft wholesale. (How findings cross a run boundary —
lazy per-consumer shard reads + append-only shard writes — is ADR-0010.)

**Trade-off accepted:** the run must persist machine-readable state (sources + findings + answer)
beside `output.html` for the next run to read and extend, and re-editing the full document costs more
tokens as it grows — bounded by the same `maxRounds` cap as the research loop (not a token budget; see
ADR-0003). Snapshots mitigate the lost-history risk of overwriting.
