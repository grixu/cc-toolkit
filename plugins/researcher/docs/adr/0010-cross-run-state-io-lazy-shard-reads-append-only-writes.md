# Cross-run state I/O: the consumer reads shards lazily, writes are append-only, the answer is rebuilt from findings

The evolving **Report** (ADR-0005) persists its state as a small `state.json` HEAD plus bounded
`findings/NNN.json` shards (schema v2). Schema v2's first cut moved findings *across runs* with a
**swarm**: on extend, one read-back subagent per shard re-emitted its findings to the orchestrator so
the orchestrator could re-embed them into the next stage's prompt; on persist, every shard was cleared
and **rewritten** from the whole in-memory corpus. On a large/deep extend that swarm — not the reasoning
— became the dominant cost (e.g. a real deep extend: **13 read-back agents** to reload 247 findings, then
**19 shards rewritten** for 369). This decides how state crosses a run boundary, while keeping
**Findings the source of truth** (ADR-0005/0006) intact.

**Platform constraint that forces the shape.** A Dynamic Workflow *script* has **no filesystem or Node
access** — every read/write is a subagent (`agent()`), never the script. So the question is never "let the
orchestrator read the files"; it is "*which agent* reads them, and does the data round-trip through the
orchestrator or not?". The read-back swarm existed only to round-trip findings (disk → agent →
orchestrator → prompt → agent) so the orchestrator could build the corpus prompts in JS. That round-trip
is the waste.

**The shape.**

- **The consumer reads its own corpus; data never round-trips through the orchestrator.** The one stage
  that needs the whole corpus — the **Synthesizer** — reads the prior shards itself. The orchestrator
  passes only the deterministic shard-path list (derived from `HEAD.shardCount`), the citation vocabulary
  (`HEAD.sources[]` — which it *does* hold, cheaply), and this run's new findings; the Synthesizer reads
  the old shards from disk and reconciles old + new holistically. **No read-back fan-out.**
- **Reads use the `Read` tool, batched in one turn — not `cat`, not `parallel()`.** `cat` is a shell
  command a host hook may block (in our environment `~/.claude/hooks/codedb-block-legacy.sh` blocks
  `cat`/`grep`/`find`/`head`/`tail` outright); `Read` is a native tool and survives. A single agent issues
  all shard `Read`s **in one turn** (concurrent tool calls), so N reads cost ~one round-trip, not N. Using
  the workflow's `parallel()` here would be wrong — it spawns agents, and each would have to *re-emit* its
  shard to the orchestrator: the very round-trip we are removing.
- **The round loop reasons over new findings only.** The **Conflict-scout**, **Verifier**, and
  **Assessor** see just the current run's findings (the **Planner** gets the prior `sources[]` as a
  coverage map). New-vs-prior contradictions are not detected in the loop; the holistic **Synthesizer**
  reconciles them (already its job, ADR-0006). The loop's job is "another round?", and a prior finding is
  not retrievable counter-evidence — so the loop loses nothing it could have acted on.
- **Writes are append-only.** New findings are written as **new** shards whose indices continue from the
  prior `shardCount`; prior shards are never cleared or rewritten on an extend, and the HEAD counts
  accumulate. This is not just an optimization — a naive rewrite of the in-memory corpus (which now holds
  *only* the new findings, since nothing was read back) would **delete** the prior findings from disk.
  `findings/` is cleared only on a *fresh* (non-extending) run.
- **The answer is rebuilt from findings, never seeded by prior prose.** Each run the Synthesizer composes
  the whole answer from all findings; the persisted `answer.md` is a **write-only export**, not an input.
  Seeding the re-synthesis with the prior prose would quietly make *prose* the source of truth for settled
  material (entrenching any error there) — the exact downgrade this design refuses.

**Why this and not "answer-seeded" extend.** The cheap alternative — drop the prior findings entirely,
seed each extend from `answer.md`, and only research the new angle — makes extend cost ~constant but
**softens the core promise**: old claims stop being re-grounded against their findings, so `answer.md`
becomes the source of truth and errors calcify across follow-ups. We keep findings authoritative and buy
the cost back elsewhere (no swarm, no rewrite) instead.

**Trade-off accepted:** The Synthesizer's holistic pass still costs O(corpus) — that is ADR-0005's
accepted cost, **unchanged**; we removed only the swarm *around* it (the read-back agents and the redundant
shard rewrites) and shrank the per-round loop prompts on extend. We lose the orchestrator-level read-back
count-check: the Synthesizer must read every shard and retry a failed `Read` itself, so a silently missed
shard is now its responsibility, not a logged orchestrator warning. There is no cross-run finding-level
dedup, so a new finding may restate a prior one — reconciled in prose by the Synthesizer (sources still
dedup by URL with append-only ids, so citations never break).

**Consistent with ADR-0005** (amended: the answer is *rebuilt* from findings, not seeded by prior prose;
ids and now shards are append-only) **and ADR-0006** (the Synthesizer reconciles the full corpus
holistically; the Conflict-scout/Verifier feed the gate, not the truth of settled material) **and ADR-0009**
(content artifacts are append-only so older snapshots keep resolving — findings shards now follow the same
rule).
