---
name: Bump the queue worker module and chart
status: merged
spec: ../app/docs/spec.md
elements: [INF-1]
decisions: [D1]
repository: @@SANDBOX@@/app
branch: feat/queue-chart-bump
branch-base: main
worktree:
phase: 1
depends-on: []
tickets: []
---

## Goal

The `queue_worker` module points at `queue-worker` v1.5.0 and deploys chart 2.4.0.

## Done when

INF-1 is environment-level: `terraform plan` after merge, by the operator.

## Where to look

INF-1 in the spec's elements table; decision D1.

## Note

`infra/main.tf` is listed under Files to protect in CLAUDE.md: confirm with the user before editing it.
Consent: yes — edit only the `?ref=` and `chart_version` lines in infra/main.tf
