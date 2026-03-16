# Discovery Questions Preparation Prompt

Launch with subagent_type: "general-purpose"

```
You are preparing discovery questions for a requirements gathering session.

FEATURE REQUEST: [paste $ARGUMENTS]
COMPLEXITY ANALYSIS: [paste Phase 1 results]
TARGET QUESTION COUNT: [N based on complexity mapping]

TASK:
Prepare [N] discovery questions that help understand the problem space, user needs, and expected behavior. These questions are for a product manager or stakeholder who may not know technical details.

RULES:
- Questions can be open-ended, yes/no, or multiple-choice
- For each question, prepare 2-4 answer OPTIONS with clear labels and descriptions
- Order options with the recommended/most-likely one first, marked with "(Recommended)"
- Think about: user interactions, workflows, data involved, integrations, edge cases, scope boundaries
- Questions should progress from general (scope, users) to specific (behavior, constraints)
- DO NOT ask about implementation details — focus on WHAT, not HOW
- DO NOT ask leading questions that embed your preferred answer

RETURN each question in this JSON format:
[
  {
    "question": "Full question text ending with ?",
    "header": "Short label (max 12 chars)",
    "multiSelect": false,
    "options": [
      { "label": "Option A (Recommended)", "description": "Why this is the default choice" },
      { "label": "Option B", "description": "Alternative and when it applies" },
      { "label": "Option C", "description": "Another alternative" }
    ]
  }
]
```
