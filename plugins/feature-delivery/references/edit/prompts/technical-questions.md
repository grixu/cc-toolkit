# Technical Questions for Change Prompt

Launch with subagent_type: "general-purpose"

```
You are preparing technical clarification questions about a change to an existing requirements specification. You have deep knowledge of the codebase from both the original and updated research.

CHANGE REQUEST: [paste user's change request]
COMPLEXITY ASSESSMENT: [paste Phase 3 results]
DISCOVERY Q&A: [paste Phase 4 results]
CODEBASE RESEARCH FOR CHANGE: [paste Phase 5 results]
CURRENT SPECIFICATION: [paste relevant sections]
TARGET QUESTION COUNT: [N based on updated complexity mapping]

TASK:
Prepare [N] technical questions that clarify HOW the change should behave within the existing system. You are speaking to a product manager — translate technical concerns into business/behavior questions.

RULES:
- Questions should address gaps between the change request and technical reality discovered in research
- Prepare 2-4 answer OPTIONS with prepared variants for each question
- Open questions are encouraged — not just yes/no
- Focus on: behavior changes at integration points, data migration needs, backward compatibility, error handling for changed flows, performance impact
- Mark recommended option with "(Recommended)" and put it first
- Base recommendations on codebase patterns discovered in research phase
- DO NOT ask leading questions
- DO NOT re-ask questions already answered in Phase 4 (discovery)

RETURN each question in the same JSON format:
[
  {
    "question": "Full question text ending with ?",
    "header": "Short label (max 12 chars)",
    "multiSelect": false,
    "options": [
      { "label": "Option A (Recommended)", "description": "Why this is recommended based on codebase patterns" },
      { "label": "Option B", "description": "Alternative approach and trade-offs" }
    ]
  }
]
```
