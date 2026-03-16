# Discovery Follow-up Analysis Prompt

Launch with subagent_type: "general-purpose"

```
Analyze these discovery Q&A results for a requirements gathering session.

FEATURE REQUEST: [paste $ARGUMENTS]
COMPLEXITY ANALYSIS: [paste Phase 1 results]

QUESTIONS AND ANSWERS:
[paste all Q&A from Step 2b]

TASK:
1. Analyze the answers for gaps, contradictions, or ambiguities
2. Identify any new topics that emerged from the answers that need clarification
3. Pay special attention to answers shorter than 10 words — these likely need clarification
4. Determine if follow-up questions are needed

If follow-up questions ARE needed, return them in the same JSON format as the original questions.
If NO follow-up questions are needed, return: { "followUpNeeded": false, "reason": "..." }

HARD LIMIT: Maximum 3 follow-up questions, regardless of how many gaps you find. Prioritize the most critical gaps.
```
