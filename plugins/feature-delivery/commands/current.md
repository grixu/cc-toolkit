---
description: "Requirements dashboard — show status of active or all requirements. Use when user asks about current requirements, wants to see progress, or needs to find a specific specification. Handles: active requirement status, task progress via TaskList, specification listing."
allowed-tools:
  - Read
  - Glob
  - TaskList
  - TaskGet
argument-hint: "[spec-id] or --all"
---

# Requirements Dashboard

## Mode Selection

- **No argument**: Show active requirement status
- **Specific ID** (e.g. `dark-mode`): View details of specific specification
- **--all**: List all requirements

## Mode: Active Status (No Arguments)

1. Read `requirements/.current-requirement`
2. If no active requirement:
   - List last 3 completed requirements (Glob `requirements/*/metadata.json`, read each)
   - Suggest: `/start [description]`
   - Exit

3. If active requirement exists:
   - Read `metadata.json` for phase, complexity, version
   - If implementation phase → call `TaskList` to show task progress
   - Display:

```
ACTIVE: [name]
Complexity: [level] - [name]
Phase: [current phase]
Version: v[X] ([Y] edits)

[If in requirements gathering:]
Progress: Phase [N]/6 — [phase name]
Next: [what needs to happen]
→ Continue with: /start (resumes automatically)

[If in implementation:]
Tasks: [completed]/[total] | Failed: [count]
Current batch: [in_progress tasks from TaskList]
→ Continue with: /implement

[If spec complete, not implemented:]
Spec ready: [spec filename]
→ Implement with: /implement
→ Edit with: /edit
```

## Mode: View Specific (Argument Provided)

1. Search `requirements/` for folder matching $ARGUMENTS
2. Read `metadata.json` + `01-request-and-complexity.md`
3. Check for `.latest-spec` → read spec version info
4. Display:

```
Requirement: [name]
Complexity: [level] - [name]
Version: v[X] ([Y] edits)
Status: [gathering/spec-complete/implementing/implemented]

Request: [brief from 01-request-and-complexity.md]
Spec: [filename if exists]
Files: [list requirement folder contents]

Actions:
→ /edit [id]
→ /implement [id]
```

## Mode: List All (--all)

1. Glob `requirements/*/metadata.json`
2. Read each, extract: name, complexity, phase, version
3. Sort: Active → Complete → Incomplete → by date

```
Requirements Documentation

[ACTIVE]
  [name] | [level] - [complexity] | Phase: [phase] | v[X]

[COMPLETE]
  [name] | [level] - [complexity] | v[X] ([Y] edits) | [spec filename]

[INCOMPLETE]
  [name] | [level] - [complexity] | Paused at: [phase] | [last date]

Total: [N] | Complete: [N] | Active: [N] | Incomplete: [N]
```
