# Pattern catalog

Passes 2–5 of `SKILL.md`. Each pattern has a **strength**:
- **one:** act on a single sighting;
- **cluster:** weak alone; act only when other tells share the passage.

Every fix keeps the fact underneath. Polish forms of these patterns are in `polish.md`.

## A. Reader and leftovers (pass 2)

### A1. Writing about the text instead of its subject · one

**Watch for:**
- self-rating ("the cleanest thing we found", "the good part is measurable");
- signposting ("then there's the map", "the other half of the read");
- status labels ("the open question is", "two things stay provisional");
- a quote framed before it speaks ("Mike put it best:");
- a description of how the text was made ("compiled from", "anything unconfirmed is flagged");
- a layout the reader can see ("the table below compares").

**Tests:**
- **Deletion:** cut it. If only reader guidance is lost, it was scaffolding.
- **Referent:** its subject is the piece itself (*the read, the section, the picture, the case, the story*).

**Fix:** delete it, or turn it into the fact it pointed at. "The open question is whether it scales" becomes "We have not tested it past 10k rows."

**Keep:**
- a judgment between two findings ("The construction check could change the choice. The HTML page could not.");
- a caveat that changes what the reader does;
- a mention of a previous version in a changelog, release notes or migration guide.

Full treatment: `overcompletion.md` §11.

### A2. Re-explaining what the reader knows · one, in a reply

**Watch for:** a reply that restates the problem, walks the diagnosis and shows proof before it reaches the decision, which sits in the last line.

**Fix:** lead with the decision. Keep only the one fact the reader lacks and the link they need to act. The diagnosis belongs in the ticket.

Act only when you can see the conversation or the text plainly is a reply.

### A3. Chatbot residue · one

**Watch for:** Great question!, Certainly!, I hope this helps, let me know, Would you like…, here is a…, You're absolutely right.

**Fix:** remove the wrapper and keep the content.

### A4. Knowledge-limit disclaimers and guesses · one

**Watch for:**
- "as of my last update", "based on available information", "not widely documented";
- "it appears to have been", or "likely" before a guessed fact.

**Fix:** state what the source does not show, or cut the sentence. Never keep the guess.

### A5. Heading repeated in the first sentence · one

A heading followed by a line that restates it ("## Performance / Speed matters."). Cut the line.

## B. Staging instead of stating (pass 3)

### B1. Not X but Y · one

**Watch for:**
- "not X but Y", "not just X, but also Y", "it's not X, it's Y";
- "X rather than Y";
- the split form ("This does not mean X. It means Y.");
- a clipped tail (", no guessing").

**Fix:** state Y. Keep a contrast only when X is a belief the reader really holds, or when both halves carry information.

> Before: The options come from the selected item, no guessing.
> After: The options come from the selected item, so the user does not have to guess.

### B2. One-line closers and dramatic fragments · one

**Watch for:**
- a one-sentence paragraph that restates the one before ("That is the real win.", "That distinction matters.");
- a line naming what an example just showed ("This shows the importance of…");
- a row of fragments ("No aesthetic prior. No nostalgia.");
- "every. single. day.".

**Fix:** cut a closer that repeats. Merge fragments into one sentence with a claim. A short sentence that adds a fact stays.

### B3. Sayings that sound deep · one

**Watch for:**
- "the real question is", "at its core", "what really matters", "fundamentally";
- "X is the Y of Z", "X becomes a trap", "the language of", "the currency of";
- equations ("X without Y is just Z", "What gets X gets Y").

**Portability test:** could the line move into an unrelated text with only the nouns changed?

**Fix:** back the line with the example that earned it, or state the claim plainly, or cut it.

### B4. Run-up before the point · one

**Watch for:**
- "Let's dive in", "here's what you need to know", "Here's the thing", "It is worth noting that";
- "In today's fast-paced world", "In the realm of";
- a standalone "Honestly?" or "Look," before a routine claim.

**Fix:** start with the fact, name or action.

### B5. Arguing with no one · one

**Watch for:**
- "This isn't about X", "To be clear", "I'm not saying";
- "A tempting approach would be", "You might think… but".

The text rejects a view or an option no one raised.

**Fix:** remove the defense and state the claim. Keep an objection the text attributes or answers, and an option a reader would really weigh.

### B6. Over-resolved endings · one

**Watch for:**
- "In conclusion", "Overall", "Ultimately", "The future looks bright", "a step in the right direction";
- a recap;
- a universal lesson drawn from one case.

**Fix:** end on the last concrete fact, a next step or a real open question. See `overcompletion.md` §10.

## C. Shape by rule (pass 4)

### C1. Forced triads · one

**Watch for:** three items or three parallel sentences where the meaning has two or four. This also covers three short facts followed by a lesson.

**Fix:** keep as many items as there are things. Merge examples or develop the strongest.

> Before: Attendees can expect innovation, inspiration, and industry insights.
> After: The event includes talks and panels, with time for networking between them.

### C2. Symmetry and uniform rhythm · cluster

**Watch for:**
- equal-length paragraphs and bullets;
- every section with the same internal shape;
- sentences of one length;
- repeated "subject verb object, -ing detail";
- lists that drop the final "and".

**Fix:** let the material set the shape. Vary length because the content varies, not for camouflage.

### C3. Repeated sentence openings · cluster

**Watch for:** several sentences in a row starting with the same subject.

**Fix:** merge them, or start with the action. Repetition chosen for rhythm stays.

### C4. Bold as decoration · one in a list, cluster in prose

**Watch for:**
- bullets that each open with `**Label:**` followed by a sentence restating the label;
- bold scattered through prose.

**Fix:** remove the bold. Turn a labelled list into a sentence when the labels add nothing. Keep labels a template or the caller requires.

### C5. Decorative headings · cluster

**Watch for:**
- Title Case headings;
- emojis or arrows in headings and bullets;
- a rule between every section;
- headings over one- or two-sentence sections;
- a heading written for effect ("The decision, on one screen").

**Fix:** use sentence case and name what the section holds.

### C6. Dashes as the universal connector · cluster for one dash, one for many

**Watch for:** em dashes, en dashes or ` -- ` joining clauses.

**Fix:** use a comma, colon, period or parentheses, or rewrite. Dashes inside code, paths and URLs stay. A voice sample that uses dashes sets the rate.

### C7. Curly quotes · cluster

**Watch for:** “…” where the writer or the format uses "…".

**Fix:** straighten them. Polish typography („…”) is correct Polish and stays.

## D. Words (pass 5, after `plain-words.md`)

### D1. AI vocabulary · cluster, one when several share a paragraph

**Watch for:** delve, tapestry, testament, landscape (abstract), realm, pivotal, crucial, key (adjective), robust (figurative), seamless, meticulous, intricate, vibrant, showcase, underscore (verb), highlight (verb), foster, garner, bolster, enhance, leverage, utilize, harness, unlock, empower, elevate, interplay, enduring, quietly, valuable, align with.

The full list is in `lexicon-en.csv`.

**Fix:** use the plain verb or noun. Keep a technical sense ("robust estimator", "key" in a key-value store).

### D2. Inflated significance · one

**Watch for:**
- "stands as a testament", "marks a pivotal moment", "plays a key role";
- "reflects a broader trend", "setting the stage for", "lasting legacy";
- a "challenges and outlook" section.

**Fix:** keep the fact and drop the significance.

> Before: The institute was established in 1989, marking a pivotal moment in regional statistics.
> After: The institute was established in 1989.

### D3. Sales language · one

**Watch for:** nestled, in the heart of, breathtaking, stunning, groundbreaking, cutting-edge, renowned, rich (figurative), diverse array, must-visit, seamless, best-in-class.

**Fix:** say what the thing is or does.

### D4. Corporate and MBA abstraction · one

**Watch for:**
- problem space, value proposition, go-to-market motion, north star;
- pain points, actionable insights, key takeaways, move the needle, low-hanging fruit, circle back;
- stakeholders, deliverables, alignment, paradigm shift.

**Fix:** name the actual problem, person, decision, metric or result.

### D5. Avoiding is, are and has · one

**Watch for:** serves as, stands as, functions as, represents, boasts, features, offers, refers to.

**Fix:** use *is*, *are*, *has*.

> Before: The gallery serves as the exhibition space and boasts four rooms.
> After: The gallery is the exhibition space and has four rooms.

### D6. Shallow -ing tails · one

**Watch for:** ", highlighting…", ", ensuring…", ", reflecting…", ", showcasing…", ", contributing to…", ", fostering…".

The tail is bolted onto a plain fact to make it sound deeper.

**Fix:** cut the tail, or make it a sentence when the source supports it.

### D7. Vague association · cluster

**Watch for:** associated with, linked to, tied to, in connection with.

**Fix:** name the relation (founded, runs, calls, depends on) when you know it. Leave the vague word when you do not.

### D8. Borrowed authority · one

**Watch for:**
- "Experts agree", "Studies show", "Research indicates", "industry reports";
- a list of outlets that cited someone.

**Fix:** name the source and what it said, or cut the claim. A missing citation alone is not a tell.

### D9. Stacked qualifiers and filler · cluster

**Watch for:**
- "could potentially", "might arguably", "it can be argued", "to some extent", "generally speaking";
- "just" or "actually" used as emphasis.

**Fix:** match the source's certainty in one qualifier. Keep temporal "just", corrective "actually", and scope, legal and safety wording.

### D10. Formal transitions · cluster

**Watch for:** moreover, furthermore, additionally, consequently, thus, hence, notably, indeed, subsequently.

**Fix:** use "also", "so", "then", or restructure. Keep them where the genre expects them, such as a proof or a legal text.

### D11. Empty figurative language · one

**Tests:**
- **Deletion:** meaning survives the cut.
- **Mapping:** the shared mechanism is never named.
- **Swap:** any topic fits.
- **Restatement:** the image repeats the literal sentence.

**Watch for:** tapestry of, treasure trove, double-edged sword, tip of the iceberg, uncharted waters, beacon of, at a crossroads, blueprint for.

**Fix:** cut it, or name the correspondence. Keep a fresh image that explains a mechanism.

### D12. Hyphenated pairs after the noun · cluster

**Watch for:** "the report is high-quality", "well-documented", "long-term" after the noun.

**Fix:** drop the hyphen after the noun, and keep it before the noun ("a high-quality report"). Dictionary compounds keep it everywhere.
