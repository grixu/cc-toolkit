# Discovery Follow-up Analysis for Change Prompt

Launch with subagent_type: "general-purpose"

```
Analyze discovery Q&A results about a change to an existing requirements specification.

CURRENT SPECIFICATION SUMMARY: [paste overview and affected sections]
CHANGE REQUEST: [paste user's change request]
COMPLEXITY ASSESSMENT: [paste Phase 3 results]

QUESTIONS AND ANSWERS:
[paste all Q&A from Phase 4b]

TASK:
1. Analyze the answers for gaps, contradictions, or ambiguities about the CHANGE
2. Check if answers contradict anything in the existing specification — if so, flag explicitly
3. Identify any new scope that emerged from the answers that wasn't in the original change request
4. Pay special attention to answers shorter than 10 words — these likely need clarification
5. Determine if follow-up questions are needed

If follow-up questions ARE needed, return them in the same JSON format as the original questions.
If NO follow-up questions are needed, return: { "followUpNeeded": false, "reason": "..." }

HARD LIMIT: Maximum 3 follow-up questions, regardless of how many gaps you find. Prioritize the most critical gaps.
```
