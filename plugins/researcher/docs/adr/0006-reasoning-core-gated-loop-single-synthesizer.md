# The reasoning core: a gated loop feeding a single terminal Synthesizer

Between "a pile of findings" and "a draft answer" sat one undefined line — `Synthesize`. We split that
black box into single-responsibility stages and decided *where contradiction-handling and verification
live*, while keeping composition terminal and single-pass.

**The shape.** Each **Research round** ends with a **Conflict-scout** (diffs the accumulated
**Findings** for mutual contradictions) and, *only on a deep brief*, a **Verifier** (adversarially
tries to refute material findings against independent evidence). Both feed the **Assessor**, which
stays the loop's **single gate**: it green-lights only when coverage is sufficient *and* no material,
resolvable conflict or refutation remains. Only then does a dedicated **Synthesizer** run — **once** —
reading the full deduplicated findings, reconciling what it can, surfacing residual (irreducible)
contradictions with attribution, and composing the cited draft answer. The **Editor** then trims it and
the **Composer** renders it. Order: **gather → detect → gate → compose → polish → render.**

**Why detection in the loop, not in the Synthesizer.** The obvious alternative — let the Synthesizer
notice a conflict mid-compose and bounce work back for another round — breaks the Synthesizer's
single-pass property and muddies control flow (re-synthesis on every bounce, expensive on an evolving
**Report** per ADR-0005). Pushing detection to per-round subagents that *feed the existing gate* keeps
exactly one place that decides "another round?" and keeps composition terminal. We accept an extra
subagent (and its tokens) per round as the price of that clean separation.

**Why a Conflict-scout separate from the Assessor.** Folding "are there contradictions?" into the
Assessor would overload the coverage judge with a different object (claims-vs-claims, not
breadth-of-coverage). A dedicated scout detects; the Assessor decides which conflicts warrant a round.
Same reasoning that kept **Editor** (prose) distinct from **Assessor** (coverage).

**Why fidelity is structural, not an LLM pass.** The product's core promise is *traceable* citations —
the worst failure is a finding that cites `[3]` when `[3]` does not say it. We enforce this by
construction: every **Finding** carries the verbatim **evidence span** that supports it, so a citation
is auditable cheaply (a human, or a deterministic string check against the scraped source) with no
extra model call. This is strictly cheaper and stronger than asking an LLM "is this faithful?".

**Why verification is depth-gated, not always-on.** Adversarial truth-checking (the `deep-research`
style: independent skeptics refuting each claim) is the most expensive thing we could add on top of an
already heavy loop (~213k tokens for five *trivial* retrievers in the probe). We run it only when the
brief asks for depth. Quick/standard briefs get grounding (evidence spans) and internal consistency
(scout) but no truth-judging. The guarantee we make is **"the source says this," not "this is true"** —
documented as such. The Verifier itself does **not** fetch: it reasons over the gathered corpus, and a
refutation that needs fresh counter-evidence becomes a gap filled by an ordinary round — the *same*
retrieval mechanism conflicts use, never a second one. The loop is bounded by `maxRounds` per depth,
**not** a token budget (Claude Code does not reliably expose one — see ADR-0003).

**Trade-off accepted:** five judge/compose-like subagents (Assessor, Conflict-scout, Verifier,
Synthesizer, Editor) where a naive design has one "analyze-and-write" step — more orchestration and
more tokens, bought for clean single-responsibility boundaries and a traceable, contradiction-honest
answer. Source *trust* is not its own stage: the **Synthesizer** weighs reliability when reconciling and
the **Report's** Sources list exposes it, rather than a separate trust-scoring pass.

**Consistent with ADR-0003** (the Assessor already gates the two-tier loop — we extend its inputs, not
its role) and **ADR-0005** (the Synthesizer re-synthesizes the whole answer per follow-up run, matching
the holistic re-edit).
