---
description: "Build a spec for a topic, plan, decision or idea by grilling it round by round, then writing it up and validating it."
argument-hint: "<topic, plan, decision or idea to grill — e.g. \"our retry strategy\" or path/to/PLAN.md>"
---

Three stages, in order. The grilling runs here, in the main thread — it needs the user. The writing and the validation run in their own contexts, so their reading never fills this conversation: relay each report, never re-derive or expand it.

1. Invoke the `fd3:grill-topic` skill with `$ARGUMENTS`, forwarded verbatim. Work its rounds to the end. While its lookups run, speak only when there is something to decide — a round ready to post, a returning fact that voids a question already asked, or a command the user must run; a lookup that came back and changed nothing gets one line.
2. Once the user confirms the closing summary — and not before — invoke the `fd3:write-spec` skill with the path of the closing-notes file the grilling wrote, the session's research directory, and where the spec goes. The paths, never a description of where things are. It runs in its own context; do not wrap it in a sub-agent of your own. Relay its report: where the spec went, the counts, what is not yet settled in it. If it stops to ask instead, put its questions to the user here, batched per `${CLAUDE_PLUGIN_ROOT}/references/question-batching.md`, and send the answers back with `SendMessage` — it resumes where it stopped.
3. Then dispatch one sub-agent to invoke `fd3:validate-spec` on the written spec in headless mode, as that skill defines it. When its partial report returns questions for the user, ask them here, batched per `${CLAUDE_PLUGIN_ROOT}/references/question-batching.md`, then dispatch the apply sub-agent with the answers and the partial report's path. Relay the final verdict.

Confirmation of shared understanding is the gate between stages 1 and 2. If the user ends the session without confirming, stop after the first stage and say what is still open.
