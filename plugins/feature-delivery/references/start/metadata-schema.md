# Metadata Schemas

Reference file for start, edit, and implement commands. Load when creating or updating metadata files.

---

## metadata.json

Create in Phase 0, update after each phase completion.

```json
{
  "id": "feature-slug",
  "started": "ISO-8601-timestamp",
  "lastUpdated": "ISO-8601-timestamp",
  "status": "active",
  "phase": "complexity-analysis",
  "complexity": null,
  "progress": {
    "complexity": "pending",
    "discovery": { "answered": 0, "total": 0, "followUps": 0 },
    "codebaseResearch": "pending",
    "technical": { "answered": 0, "total": 0, "followUps": 0 },
    "testPlanning": "pending"
  },
  "contextFiles": [],
  "affectedModules": [],
  "relatedFeatures": []
}
```

**After Phase 1** — update complexity:
```json
"complexity": {
  "level": 1,
  "name": "Very Easy",
  "appsAffected": ["frontend"],
  "estimatedFiles": { "new": 1, "modified": 3 },
  "estimatedLines": "~200"
}
```

**Phase values**: `"complexity-analysis" | "discovery" | "codebase-research" | "technical" | "test-planning" | "specification" | "complete"`

**Status values**: `"active" | "complete" | "incomplete"`

---

## .latest-spec

Create in Phase 6 after generating the specification.

```json
{
  "version": 1,
  "filename": "06-requirements-spec.md",
  "updated": "ISO-8601-timestamp",
  "edit_count": 0
}
```

---

## .verification-plan

Create in Phase 6 if test planning phase was completed.

```json
{
  "testingStrategy": "mixed",
  "automatedTests": {
    "approved": ["list of approved test categories"],
    "excluded": ["list of excluded test categories"]
  },
  "manualTests": {
    "approved": ["list of approved scenarios"],
    "excluded": ["list of excluded scenarios"]
  },
  "sourceFile": "05-test-plan.md"
}
```

---

## implementation (in metadata.json)

Added by `/implement` during implementation. Nested under the root `metadata.json` object.

```json
"implementation": {
  "startedAt": "ISO-8601-timestamp",
  "completedAt": "ISO-8601-timestamp",
  "phase": "context-discovery",
  "tasks": [
    {
      "id": "impl-backend-1",
      "name": "Create auth service",
      "agent": "backend",
      "status": "pending",
      "dependencies": ["impl-db-1"],
      "specSections": ["3.2", "4.1"],
      "deliverables": ["backend/src/auth/auth.service.ts"]
    }
  ],
  "validation": {
    "acceptanceCriteria": { "total": 0, "passed": 0, "partial": 0, "missing": 0 },
    "codeQuality": { "critical": 0, "warnings": 0 },
    "qualityGates": { "lint": null, "test": null, "build": null }
  }
}
```

**Phase values**: `"context-discovery" | "decomposition" | "approval" | "execution" | "validation" | "quality-gates" | "complete"`

**Task status values**: `"pending" | "in-progress" | "complete" | "failed"`

**Quality gate values**: `null` (not run) | `"pass"` | `"fail"`
