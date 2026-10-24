---
name: Parse the product groups setting
status: merged
spec: ../app/docs/spec.md
elements: [CFG-1]
decisions: [D1, D2, D3]
repository: @@SANDBOX@@/app
branch: feat/product-groups
branch-base: main
worktree:
phase: 1
depends-on: []
tickets: []
---

## Goal

`parseProductGroups` turns `PRODUCT_GROUPS` into a list of validated slugs at startup.

## Done when

The CFG-1 behaviour row passes on the branch.

## Where to look

CFG-1 in the spec's elements table; decisions D1, D2 and D3.
