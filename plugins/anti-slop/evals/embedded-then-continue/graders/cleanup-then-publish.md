---
type: tool_order
before: { tool: Skill, input_match: '"skill"\s*:\s*"(?:[\w-]+:)?anti-slop"' }
after: { tool: Bash, input_match: 'bash publish\.sh body\.md' }
weight: 2
---
