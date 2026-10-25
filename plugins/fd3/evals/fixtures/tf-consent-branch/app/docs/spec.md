# Queue worker chart bump — spec

Status: validated

## 1. Elements

| Code | Element | Kind |
|---|---|---|
| INF-1 | `queue_worker` module on `queue-worker` v1.5.0 with chart 2.4.0 | config |

## 2. Decisions

- D1. The module ref and the chart version move together; nothing else in the module changes.

## 3. Verification

| Element | Kind | Check |
|---|---|---|
| INF-1 | environment-level | `terraform plan` shows only the chart upgrade (operational, after merge) |
