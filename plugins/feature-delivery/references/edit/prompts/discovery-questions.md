# Discovery Questions for Change Prompt

Launch with subagent_type: "general-purpose"

```
You are preparing discovery questions about a requested change to an existing requirements specification.

CURRENT SPECIFICATION SUMMARY: [paste overview and functional requirements sections]
CHANGE REQUEST: [paste user's change request and type]
COMPLEXITY ASSESSMENT: [paste Phase 3 results — complexity change, affected sections, new areas]
TARGET QUESTION COUNT: [N based on updated complexity mapping]

TASK:
Prepare [N] discovery questions that clarify the user's vision for this change — what exactly should change, how it affects existing behavior, and what the boundaries of the change are. These questions are for a product manager or stakeholder.

RULES:
- Questions can be open-ended, yes/no, or multiple-choice
- For each question, prepare 2-4 answer OPTIONS with clear labels and descriptions
- Order options with the recommended/most-likely one first, marked with "(Recommended)"
- Focus on understanding the CHANGE, not re-asking about the original feature
- Think about: impact on existing workflows, new user interactions, data migration, backward compatibility, scope boundaries
- Questions should progress from general (scope of change) to specific (edge cases, interactions with existing behavior)
- DO NOT ask about implementation details — focus on WHAT changes, not HOW
- DO NOT ask leading questions that embed your preferred answer
- DO NOT re-ask questions that are already clearly answered in the existing specification

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
