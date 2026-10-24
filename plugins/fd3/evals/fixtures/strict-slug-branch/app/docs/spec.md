# Product group configuration — spec

Status: validated

## 1. Elements

| Code | Element | Kind |
|---|---|---|
| CFG-1 | `parseProductGroups` reads `PRODUCT_GROUPS` (comma-separated) at startup | code |

## 2. Decisions

- D1. `PRODUCT_GROUPS` is read once, at startup; a change needs a restart.
- D2. An empty `PRODUCT_GROUPS` means no product group, not every group.
- D3. A product group slug is lowercase letters and digits in hyphen-separated words: it matches
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`. `a--b`, `-a` and `a-` are rejected at startup with the offending
  slug named.

## 3. Verification

| Element | Kind | Check |
|---|---|---|
| CFG-1 | behaviour | `a--b`, `-a` and `a-` each fail startup; `core-api` passes |
