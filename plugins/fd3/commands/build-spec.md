---
description: "Build a spec for a topic, plan, decision or idea by grilling it round by round, then writing it up."
allowed-tools: Skill
argument-hint: "<topic, plan, decision or idea to grill — e.g. \"our retry strategy\" or path/to/PLAN.md>"
---

Two halves, in order.

1. Invoke the `fd3:grill-topic` skill with `$ARGUMENTS`, forwarded verbatim. Work its rounds to the end.
2. Once the user confirms the closing summary — and not before — invoke the `fd3:write-spec` skill to write the specification.

Confirmation of shared understanding is the gate between them. If the user ends the session without confirming, stop after the first half and say what is still open.
