---
description: "Build a spec for a topic, plan, decision or idea by grilling it round by round, then writing it up and validating it."
argument-hint: "<topic, plan, decision or idea to grill — e.g. \"our retry strategy\" or path/to/PLAN.md>"
---

Three stages, in order. The grilling runs here, in the main thread — it needs the user. The writing and the validation run in their own contexts, so their reading never fills this conversation: relay each report, never re-derive or expand it — with one exception: where a report contradicts something you told the user, say so in the open, name both and which one now stands.

Stages 2 and 3 are in `${CLAUDE_PLUGIN_ROOT}/references/build-spec-stages.md`. Read it when stage 2 begins or a re-entry starts — not before — and again after a compaction.

**A finished spec re-enters at stage 3.** When `$ARGUMENTS` is a path to an existing file that carries the template's `## 12. Appendix — the evidence record` section (`${CLAUDE_PLUGIN_ROOT}/references/spec-template.md`), it is a spec coming back — with a change the user wants made, edited after its verdict, or stale against its repositories. This is the only route by which a spec changes after its verdict: the spec exists once, at the path stage 2 wrote it, and no implementation run, repair, task or "align with as-built" commit edits it or keeps a second copy of it. Grilling it again would re-open decisions the user already made: skip stages 1 and 2 and follow the stages file's re-entry section.

1. Invoke the `fd3:grill-topic` skill with `$ARGUMENTS`, forwarded verbatim. Work its rounds to the end. While its lookups run, speak only when there is something to decide — a round ready to post, a returning fact that voids a question already asked, or a command the user must run; a lookup that came back and changed nothing gets one line.
2. Once the user confirms the closing summary — and not before — write the spec with `fd3:write-spec`, as the stages file says.
3. Then validate it with `fd3:validate-spec`, as the stages file says.

Confirmation of shared understanding is the gate between stages 1 and 2. If the user ends the session without confirming, stop after the first stage and say what is still open.
