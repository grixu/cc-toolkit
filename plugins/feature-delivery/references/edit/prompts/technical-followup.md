# Technical Follow-up Analysis for Change Prompt

Launch with subagent_type: "general-purpose"

```
Analyze technical Q&A results about a change to an existing requirements specification, in context of ALL gathered knowledge.

CHANGE REQUEST: [paste user's change request]
COMPLEXITY ASSESSMENT: [paste Phase 3 results]
DISCOVERY Q&A: [paste Phase 4 results]
CODEBASE RESEARCH FOR CHANGE: [paste Phase 5 results]
CURRENT SPECIFICATION: [paste relevant sections]

TECHNICAL QUESTIONS AND ANSWERS:
[paste all Q&A from Phase 6b]

TASK:
1. Cross-reference technical answers with codebase research findings
2. Identify any contradictions between user expectations and technical reality
3. Check for contradictions between Phase 4 answers (discovery) and Phase 6 answers (technical) — if found, flag them explicitly with both conflicting answers quoted
4. Check for contradictions between answers and the existing specification — flag explicitly
5. Spot gaps that could cause implementation ambiguity
6. Determine if follow-up questions are needed

If follow-up questions ARE needed, return them in the same JSON format.
If NO follow-up questions are needed, return: { "followUpNeeded": false, "reason": "..." }

HARD LIMIT: Maximum 3 follow-up questions.
```
