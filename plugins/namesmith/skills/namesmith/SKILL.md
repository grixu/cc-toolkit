---
name: namesmith
description: >-
  Orchestrate business name discovery: gather context, generate candidates, challenge
  them with a scoring sub-agent, then check domain availability.
  Use when the user asks to name a business, startup, app, or product — or wants
  brand name ideas. Trigger phrases: "help me name my business", "business name ideas
  for", "what should I call my company", "find a business name", "brand name generator",
  "suggest names for my startup", "name my app", "find an available domain name for my
  business". Also triggered by /namesmith.
  Examples:
  <example>
  user: "I'm building a project management SaaS, help me name it"
  assistant: "I'll use the namesmith skill to generate and evaluate name candidates, then check domain availability."
  <commentary>User describes a product and wants name ideas — namesmith triggers.</commentary>
  </example>
  <example>
  user: "I need a name for my pet care startup"
  assistant: "Let me run namesmith to brainstorm, score, and check domains for your pet care business."
  <commentary>Direct naming request for a startup — namesmith triggers.</commentary>
  </example>
  <example>
  user: "/namesmith I'm launching a coffee subscription service targeting remote workers"
  assistant: "Starting namesmith with your coffee subscription context."
  <commentary>Explicit /namesmith invocation with business description.</commentary>
  </example>
version: 0.1.0
---

# namesmith

## Expert Mindset

The goal is not to generate impressive variety — it is to surface **5 names the user will actually want to register**. Keep this in mind throughout.

Key calibrations that non-experts get wrong:

- **The challenger rejects ~50% of names by design.** A 60-70% rejection rate is normal and healthy. If the challenger rejects 90%, the names were too generic. If it rejects only 20%, the criteria may not have been applied strictly enough.
- **.com is almost always taken for good coined words** — bias toward `.io`, `.ai`, `.app` as primary targets from the start, not as fallbacks. Short coined names (≤6 chars with unusual consonant clusters) are the exception — those are often unclaimed.
- **"Another round" is not random regeneration.** Each round should incorporate rejection patterns as steering signals. Read the most common failure dimension from the challenger output and adjust the archetype mix accordingly — if distinctiveness kept failing, shift away from metaphorical/evocative toward coined.
- **Name quality is multi-dimensional.** A name scoring 7/10 across all five dimensions beats a name scoring 10/10 on memorability and 3/10 on context fit.
- **B2B names and B2C names should feel different.** B2B buyers want precision and credibility — short coined words and descriptive names perform better. B2C buyers want warmth and story — metaphorical, evocative, and compound names work better. If the user hasn't specified, infer from the product description.
- **Include one "safe anchor" name per round.** Every list should have one descriptive-but-memorable name that clearly communicates what the product does. Users who reject all the creative names often accept the anchor — and it sets the tone against which they evaluate the others. Without an anchor, users feel unmoored by too much novelty.

---

## NEVER

- **NEVER show the internal name list to the user before Phase 4.** The challenger must run first. Showing unfiltered names undermines the entire workflow and exposes weak candidates.
- **NEVER generate more than 4 names from one archetype.** If 12 out of 18 names are coined words, the distribution is broken and the challenger will lack diversity to filter from.
- **NEVER retry the MCP domain probe more than once.** A second retry on a failed probe adds delay without new information. Go straight to fallback.
- **NEVER loop "another round" more than 3 times without asking the user to reconsider their brief.** After 3 rounds, the problem is usually an unclear or over-constrained brief, not insufficient generation.
- **NEVER present challenger scores to the user unprompted.** Users want name options, not a branding exam transcript. Share scores only if the user explicitly asks why a name was filtered out.
- **NEVER include a name you have already identified as culturally problematic** in the list passed to the challenger. Filter these out in Phase 1 — the challenger does not recheck cultural safety.
- **NEVER skip deduplication before Phase 2.** Near-identical names waste challenger capacity and confuse domain results.
- **NEVER use "another round" to fix a threshold problem.** If the user wants more names because the threshold is too strict (they liked a rejected name), that is a filtering discussion — adjust the threshold in the current results rather than generating 15 new names.

---

## Phase 0 — Understand the Business

Before asking questions, extract as much as possible from `$ARGUMENTS`. Most users provide more signal than they realize — read between the lines:
- "pet care startup" → B2C, warmth tone, compound/evocative archetypes will resonate
- "fintech SaaS for CFOs" → B2B, precision tone, short coined/descriptive archetypes will resonate
- "AI-powered recipe app" → consumer, playful tone, coined/short words work

If `$ARGUMENTS` contains a clear description of what the product/service does, who it serves, and what tone is desired (≥ 20 words covering these points), proceed to Phase 1 immediately.

Otherwise, use `AskUserQuestion` to gather:

1. What does your product or service do? (one sentence)
2. Who is the target customer?
3. Preferred tone: professional / playful / technical / human / other?
4. Any words, concepts, or languages to include? Anything to avoid?

Accept short answers — do not prompt for more detail than needed.

---

## Phase 1 — Generate Name Candidates

**MANDATORY READ before generating:** Load `${CLAUDE_PLUGIN_ROOT}/references/naming-criteria.md` — use **Section 1 only** (Generation Archetypes).

**Do NOT load** `mcp-fallback.md` or Section 2 of naming-criteria.md at this phase — they are for later phases.

Generate **15–20 name candidates** that cover all 6 archetype types. This phase is **high freedom** — the archetype constraints prevent clustering, not artistry. Apply full creative judgment within them.

**The 5-second test:** For each name you generate, ask: "If someone heard this name at a conference badge, would they still remember it by end of day?" If not, the name needs more distinctiveness before you include it.

| Archetype | Example | Max names |
|---|---|---|
| Invented / coined word | Kodak, Xerox, Etsy | 4 |
| Compound word | Dropbox, GitHub, Snapchat | 4 |
| Metaphorical / evocative | Amazon, Oracle, Stripe | 3 |
| Descriptive-but-memorable | Basecamp, Mailchimp | 3 |
| Short coined (≤6 chars) | Uber, Lyft, Fiverr | 3 |
| Domain-hack friendly (root ≤8 chars) | del.icio.us style | 3 |

**Rules:**
- No two names may be phonetically or visually near-identical (e.g. Veltora / Veltara)
- Each name must be 3–14 characters total
- Bias toward names where `.io` or `.ai` is plausibly unclaimed (`.com` is assumed taken for most good coined words)
- Apply cultural/linguistic safety rules from naming-criteria.md Section 1 — exclude any name that fails these checks before passing to the challenger

**Store internally as a list:** `[name, archetype, 1-sentence rationale]`

Do NOT display this list to the user yet.

---

## Phase 2 — Sub-Agent Challenge

Launch an `Agent` call to challenge and score all names from Phase 1.

Pass the following in the prompt:
- The business description (from Phase 0)
- The full name list: each entry as `Name | Archetype | Rationale`
- The full text of Section 2 from `${CLAUDE_PLUGIN_ROOT}/references/naming-criteria.md`

The agent is defined at `${CLAUDE_PLUGIN_ROOT}/agents/name-challenger.md`. Instruct the agent to follow its scoring rubric and produce the required structured output.

**Parse the agent's output:**
- Extract all names with `Verdict: KEEP`
- If fewer than 5 names are KEEPed, take the top 5 by score from the full list (relaxed threshold)
- Note in Phase 4 output if the threshold was relaxed

**survivors** = the final filtered list (5–15 names)

---

## Phase 3 — Domain Availability Check

**MANDATORY READ before probing:** Load `${CLAUDE_PLUGIN_ROOT}/references/mcp-fallback.md`.

**Do NOT re-read** naming-criteria.md at this phase.

This phase is **low freedom** — follow the probe-then-fallback pattern exactly. Do not improvise alternatives to the probe step.

**Probe:** Attempt one `search_domains` call for the first name in survivors, with `tlds: [".com"]`.

**If the probe succeeds (MCP healthy):**

For each name in survivors, call `check_domain_availability` for `.com`, `.io`, `.co`, and `.app`.
- If `.com` is taken for a name, also call `generate_domain_variations` to surface creative alternatives
- Process up to 5 names concurrently

**If the probe fails (tool not found, HTTP error, or timeout):**
- Do not retry
- Display the UNAVAILABLE or DEGRADED notice from `mcp-fallback.md`
- Proceed to Phase 4 with domain data marked as `—` (manual check)
- Include the manual check URL per the fallback template

---

## Phase 4 — Present Results

Display a results table:

```
## Business Name Candidates

| Name      | Type               | .com | .io | .app | Notes                          |
|-----------|--------------------|------|-----|------|--------------------------------|
| Veltora   | Coined             | ✓    | ✓   | ✓    |                                |
| NestRun   | Compound           | ✗    | ✓   | ✓    | .com taken; nestrun.io free    |
| ...       | ...                | ...  | ... | ...  | ...                            |
```

If domain check was unavailable, replace availability columns with a single `Domain` column containing the manual check URL from mcp-fallback.md.

If the challenger threshold was relaxed, add a note: `* Threshold relaxed to top 5 by score — consider running another round for stronger candidates.`

Then use `AskUserQuestion` to offer three options:

1. **Explore one name further** — deep-dive with domain variations
2. **Run another round** — generate fresh candidates (informed by what was rejected and why)
3. **Done** — end the session

**If option 1 (Explore):**
Ask which name. Call `generate_domain_variations` for that name across multiple TLDs and suffix patterns. Present the variations with availability status. If `generate_domain_variations` is unavailable, list common TLD alternatives manually (.ai, .co, .app, .io, .dev, -hq.com, get[name].com).

**If option 2 (Another round):**
Summarize the rejection reasons from the challenger output. Identify the most common failure dimension (e.g., "5 names failed distinctiveness, 3 failed context fit"). Adjust generation accordingly — if distinctiveness was the top failure, reduce metaphorical/evocative names and increase coined. Return to Phase 1.

**If option 3 (Done):**
End cleanly. Do not summarize unless the user asks.

---

## Edge Cases

| Scenario | Action |
|---|---|
| MCP tool not found | Follow mcp-fallback.md UNAVAILABLE template |
| MCP returns HTTP error or timeout | Follow mcp-fallback.md DEGRADED template; do not retry |
| All names rejected by challenger | Take top 5 by score; note threshold was relaxed |
| Challenger output is malformed / unparseable | Treat all names as KEEP with score 5; add note about parsing failure |
| User provides < 20 words of context | Phase 0 clarifying questions handle this |
| Generation produces near-identical names | Deduplicate before Phase 2 |
| `generate_domain_variations` tool unavailable | Use manual TLD alternatives listed in Phase 4 Explore path |
| Agent tool unavailable | Perform challenger scoring inline using the rubric from naming-criteria.md Section 2 |
| User hits "another round" 3+ times | Surface the pattern: ask user to revisit the brief before generating again |
