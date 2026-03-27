# Naming Criteria Reference

This file has two sections:
- **Section 1** — loaded by the namesmith skill at Phase 1 (name generation)
- **Section 2** — passed to the name-challenger sub-agent at Phase 2 (scoring)

---

# Section 1: Generation Archetypes

## The Six Archetype Types

Every name generation session must produce candidates across all six types. Do not cluster in one type.

### 1. Invented / Coined Words (Kodak-style)
Construct a word from scratch using phoneme blending. Rules:
- Combine two concept-adjacent syllables (e.g., "vel" + "tora" → Veltora)
- Favor plosive consonants (k, p, t, b) and clear vowels — they stick in memory
- 4–8 characters is the sweet spot
- Test: can a non-English speaker read it on first try? If not, adjust.

**Construction patterns:**
- Prefix blend: take the first 2–3 letters of a relevant word + a novel suffix
- Suffix blend: novel prefix + a familiar suffix (-ix, -ly, -io, -ify, -era, -ova)
- Pure phoneme invention: choose a sequence that sounds like a brand, not a word

### 2. Compound Words (Dropbox-style)
Combine two real words. Rules:
- Both words should be ≤6 characters each (total ≤12)
- One word = the category/action; the other = the value or audience
- Avoid clichés: "smart", "next", "pro", "hub", "lab" — these are overused
- Test: does the compound evoke the product without being literal?

**Patterns:**
- Action + Noun: NestRun, CloudHop, DeskFlow
- Noun + Noun: Moonstone, Roadmap (already taken), FireSide
- Adjective + Noun: Swiftbase, Clearpath

### 3. Metaphorical / Evocative (Amazon-style)
Pick a concrete noun from an unrelated domain that maps to the brand's core feeling. Rules:
- Choose scale, power, precision, or warmth — match the brand's emotional register
- The word must be a common English noun (easy to search, easy to say)
- Risk: these are often taken as .com — account for that

**Emotional register → domain map:**
- Scale / ambition → nature (river, mountain, arc, ridge)
- Precision / intelligence → tools (chisel, compass, prism)
- Warmth / community → hearth words (haven, grove, hearth, ember)
- Speed / agility → movement (sprint, current, tide, drift)

### 4. Descriptive-but-Memorable (Basecamp-style)
A real English word or short phrase that describes what the product does, chosen carefully so it is still ownable. Rules:
- Avoid single generic nouns (tracker, planner, helper) — too weak to own
- Prefer compound nouns or verb+noun combos that are specific enough to be distinctive
- ≤12 characters total

### 5. Short Coined (Uber-style)
≤6 characters, invented or repurposed from obscure roots. Rules:
- Priority: can be said in one syllable or two max
- Priority: no awkward consonant clusters
- May use an existing short word from another language if it has a clean sound in English
- Examples: Loom, Flock, Deel, Pipe, Mesh, Zest

### 6. Domain-Hack Friendly (short root ≤8 chars)
Designed so the name itself can become the domain without a traditional TLD:
- Root word fits naturally with `.io`, `.ai`, `.app`, `.co`, or `.is`
- Examples: Dri.gg, del.icio.us, Bit.ly
- Or: short enough that `.ai` or `.io` feels native (Krea.ai, Runway.ml)

---

## Cultural / Linguistic Safety Rules

Before including any name, check:

1. **Spanish**: Does the word or any substring sound like a slur, body part, or crude term? Common traps: words ending in -culo, -puta, -chinga
2. **French**: Does it sound like something negative or funny? Check: words with "con" substring, "-merde" sounds
3. **German**: Does it accidentally form a compound with a negative meaning? Check: words with "schlecht", "angst" roots
4. **Mandarin (pinyin)**: Does the transliteration resemble an offensive syllable sequence? This is harder to check without lookup tools — when uncertain, flag it rather than reject outright
5. **General**: Avoid names that contain obvious English slurs, even as substrings (e.g., "Assassin" contains "ass", "Cuntry" is obvious)

If a name fails any of these checks, exclude it from the list rather than passing it to the challenger.

---

## Length Guidelines

| Archetype | Ideal Length |
|---|---|
| Invented / coined | 4–8 characters |
| Compound | 6–12 characters |
| Metaphorical | 4–10 characters |
| Descriptive | 6–12 characters |
| Short coined | 3–6 characters |
| Domain-hack | root ≤8 characters |

Names longer than 14 characters should be excluded unless there is a strong rationale.

---

# Section 2: Challenger Scoring Criteria (Detail)

This section is passed to the name-challenger sub-agent. It provides verbose explanations and examples for each scoring dimension.

---

## Dimension 1: Memorability

**What it measures:** How easily the name sticks in memory after one hearing.

**2 points:** The name has ≤2 syllables and a novel or distinctive sound cluster that feels fresh. Examples of high-memorability names: Stripe (1 syl), Lyft (1 syl), Trello (2 syl), Figma (2 syl).

**1 point:** 3 syllables with a clear, clean sound. Memorable but requires some repetition. Examples: Asana, Canva (borderline 2), Notion.

**0 points:** ≥4 syllables, awkward rhythm, or the name blurs into background noise on first hearing. Also 0 if the syllables form an unintentionally funny or confusing sequence.

**KEEP examples at 2:** Velo, Zuno, Plixi
**KEEP examples at 1:** Velotura, Basenet
**REJECT examples at 0:** Collaboratix, Administratify

---

## Dimension 2: Spelling-Pronunciation Alignment

**What it measures:** Whether someone who hears the name can spell it correctly on first attempt, and vice versa.

**2 points:** One-to-one correspondence between spelling and pronunciation. No silent letters. No ambiguous vowels. Does not sound like an existing English word with an unrelated (or negative) meaning when said aloud. Clean in at least Spanish and French (spot-check for obvious traps).

**1 point:** One minor ambiguity — e.g., a vowel cluster that has two plausible readings (ei/ie, ou/oo), or a near-homophone with a neutral, unrelated word. Most people would get it right on second exposure.

**0 points:** Silent letters (Knecto — the "K" is silent?), multiple plausible pronunciations (Xaelith — is the X a Z or a Ks?), or the name sounds like something negative or embarrassing in English or a major language.

**KEEP examples at 2:** Kova, Nestrio, Swiftly
**REJECT examples at 0:** Pneumatica, Xeightio, Phlowr

---

## Dimension 3: Brand Distinctiveness

**What it measures:** How ownable the name is — low collision with existing brands, low risk of trademark disputes.

**2 points:** The name as an isolated term does not immediately evoke a dominant existing brand in this sector or an adjacent one. It is distinctive enough that the startup could reasonably build search presence around it. Not a common dictionary word.

**1 point:** There is a sector-adjacent brand with a similar name, or the root is a moderately common word. The startup would face some SEO competition but is not at immediate trademark risk.

**0 points:** The name is identical or near-identical to a well-known brand (Slack, Notion, Figma-like). Or it is a single common English noun (Tracker, Planner, Notes) that is impossible to own. Or there is clear trademark collision risk.

**KEEP examples at 2:** Veltora (no major brand), Nestrio (novel), Zundra (no obvious collision)
**REJECT examples at 0:** Slick (too close to Slack phonetically), Planner, Notion (already a product)

**Note:** You cannot search the web. When genuinely uncertain about an existing brand collision, score 1 (not 0) and add a note that the orchestrator should verify.

---

## Dimension 4: Domain Hackability

**What it measures:** How likely it is that a reasonable domain exists for this name.

**2 points:** The root word is ≤10 characters. It is not a common English dictionary word that would make .com near-impossible (bank, cloud, go, run, fly, now). A `.io`, `.ai`, `.app`, or `.co` variant is plausibly unclaimed for a word/name this specific.

**1 point:** Root is 10–14 characters, or the word is recognizable but niche enough that an uncommon TLD may be free. The `.com` is probably taken but alternatives exist.

**0 points:** Root exceeds 14 characters, or the root is a high-frequency English noun (money, health, travel, jobs) where all plausible TLDs are almost certainly registered. .com, .io, .ai, .co all likely taken.

**KEEP examples at 2:** Kova (4 chars), Nestrio (7 chars), Zundra (6 chars)
**REJECT examples at 0:** Collaboration (13 chars, generic), HealthMonitor, JobTracker

---

## Dimension 5: Business Context Fit

**What it measures:** How well the name supports the brand story described in the business description.

**2 points:** The name strongly evokes the product category, the target customer, or the core value proposition. A new user who hears the name for the first time gets a sense of what the product does or feels like.

**1 point:** The name is neutral — it does not mislead, but it also does not reinforce the brand story. Works fine but relies entirely on marketing to build associations.

**0 points:** The name creates the wrong impression (a fintech called "Meadow" might imply wellness), has strong negative connotations in the target market, or is so abstract that it has zero connective tissue with the product.

**KEEP examples at 2:** Nestrio for a property management tool (nest = home), Velo for a cycling app
**REJECT examples at 0:** Glacier for a fast delivery startup, Gloom for a mental health app
