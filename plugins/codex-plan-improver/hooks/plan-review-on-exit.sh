#!/bin/bash
# PreToolUse hook: auto-triggers /codex-review when Claude exits plan mode.
# Matcher in hooks.json ensures this only runs for ExitPlanMode.
# Prevents infinite loops via session-scoped flag file.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')

FLAG_FILE="/tmp/codex-plan-reviewed-${SESSION_ID}"

if [ -f "$FLAG_FILE" ]; then
  # Already reviewed — allow ExitPlanMode to proceed
  rm -f "$FLAG_FILE"
  exit 0
fi

# Mark as review triggered
touch "$FLAG_FILE"

jq -n '{
  "decision": "block",
  "reason": "You are exiting plan mode. Before presenting the plan to the user, run the /codex-plan-improver:codex-review command to have Codex review and improve the plan. The plan is already in your conversation context. After the review is complete, call ExitPlanMode again with the revised plan."
}'
