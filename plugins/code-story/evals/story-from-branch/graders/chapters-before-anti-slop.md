---
type: tool_order
before: { tool: Write, input_match: 'chapters/\d+\.html' }
after: { tool: Skill, input_match: '"skill"\s*:\s*"(?:[\w-]+:)?anti-slop"' }
---
