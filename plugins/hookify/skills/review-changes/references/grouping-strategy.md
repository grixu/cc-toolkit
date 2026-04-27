# Grouping Strategy

Goal: partition the change set into review groups so subagents can run in
parallel without overlap. Each group = `{files: [...], rules: [...]}`.

## Inputs

- `rules[]` — from `scripts/list_rules.py` (already filtered to `file`/`all` events)
- `files[]` — from `scripts/get_changes.py` (already excludes deletions, may
  include `binary: true` files)

## Step 1: Drop ineligible files

Remove from `files[]`:

- `binary: true` — diff has no reviewable text
- generated/lock files when no rule explicitly targets them
  (`pnpm-lock.yaml`, `package-lock.json`, `*.min.js`, `dist/**`, `build/**`)

If a rule's `file_path_filters` explicitly matches a generated file, keep it —
the rule author opted in.

## Step 2: Compute applicable rules per file

For each remaining file `f`:

```
applicable(f) = {
  r in rules
  | r.file_path_filters is empty            -- rule applies to all files
  OR any(regex.search(pattern, f.path)
         for pattern in r.file_path_filters)
}
```

Use **Python regex** (`re.search`, not `re.match`) — that's what hookify uses
at runtime, so semantics line up.

If `applicable(f)` is empty, drop the file entirely from review.

## Step 3: Bucket by rule signature

Group files whose `applicable()` set is identical:

```
signature(f) = sorted tuple of rule names in applicable(f)
buckets = group_by(files, signature)
```

Each bucket → one candidate group. Files in a bucket share the same set of
rules to check.

## Step 4: Cap group size

For parallelism, split any bucket with more than `MAX_FILES_PER_GROUP = 5`
files into multiple groups (each still uses the same rule set).

Example: a bucket of 17 files becomes 4 groups (5 + 5 + 5 + 2).

Bias toward more groups, not fewer — subagents run in parallel and the user
explicitly preferred more groups for a large PR.

## Step 5: Emit final group list

Each group:

```json
{
  "id": "g3",
  "files": ["src/api/users.ts", "src/api/posts.ts"],
  "rules": [
    {"name": "warn-console-log", "...": "..."},
    {"name": "no-any-typescript", "...": "..."}
  ]
}
```

Invariants to verify before spawning subagents:

- Every file appears in **exactly one** group.
- Every group has at least one rule.
- Group count ≥ 1.

## Worked example

Rules:
- `R1` — `file_path_filters: ["\\.tsx?$"]`
- `R2` — `file_path_filters: ["src/api/.*"]`
- `R3` — `file_path_filters: []` (applies everywhere)

Files:
- `src/api/users.ts` → applicable = {R1, R2, R3}
- `src/api/util.py`  → applicable = {R2, R3}
- `src/ui/Btn.tsx`   → applicable = {R1, R3}
- `README.md`        → applicable = {R3}

Buckets:
- `(R1, R2, R3)` → [users.ts]
- `(R2, R3)`     → [util.py]
- `(R1, R3)`     → [Btn.tsx]
- `(R3,)`        → [README.md]

Result: 4 groups, 4 parallel subagents. No file overlap.
