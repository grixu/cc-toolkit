# Technical Follow-up Analysis Prompt

Launch with subagent_type: "general-purpose"

```
Analyze these technical Q&A results in context of ALL gathered knowledge.

FEATURE REQUEST: [paste $ARGUMENTS]
COMPLEXITY ANALYSIS: [paste Phase 1 results]
DISCOVERY Q&A: [paste Phase 2 results]
CODEBASE RESEARCH: [paste Phase 3 results]

TECHNICAL QUESTIONS AND ANSWERS:
[paste all Q&A from Step 4b]

TASK:
1. Cross-reference technical answers with codebase research findings
2. Identify any contradictions between user expectations and technical reality
3. Check for contradictions between Phase 2 answers and Phase 4 answers — if found, flag them explicitly with both conflicting answers quoted
4. Spot gaps that could cause implementation ambiguity
5. Determine if follow-up questions are needed

If follow-up questions ARE needed, return them in the same JSON format.
If NO follow-up questions are needed, return: { "followUpNeeded": false, "reason": "..." }

HARD LIMIT: Maximum 3 follow-up questions.
```
