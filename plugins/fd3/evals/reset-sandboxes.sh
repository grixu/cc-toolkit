#!/usr/bin/env bash
# Recreate every fd3 eval sandbox from its pristine fixture. Run before every eval
# invocation (scripts/run-evals.sh does this automatically for fd3).
#
# sandbox:fixture:git-roots — git-roots is a space-separated list of directories
# (relative to the sandbox) that get a fresh git repo; "." is the sandbox root,
# empty means no repo, "-" as fixture means an empty sandbox.
set -euo pipefail
cd "$(dirname "$0")"

MAPPINGS=(
  "validate-defective-spec:defective-payments-spec:."
  "validate-clean-spec:clean-payments-spec:."
  "validate-declared-gap:gap-payments-spec:."
  "validate-phased-verdict:phased-payments-spec:."
  "split-baseline:rollout-spec:repo-a repo-b"
  "split-unvalidated-precondition:unvalidated-rollout-spec:repo-a repo-b"
  "split-orphan-element:orphan-rollout-spec:repo-a repo-b"
  "split-english-artifacts:rollout-spec:repo-a repo-b"
  "write-precondition-stop:empty-project:"
  "write-template-conformance:grilling-summary:."
  "write-no-invented-decisions:no-rollout-order:."
  "grill-round-shape:retry-topic:."
  "grill-no-topic:retry-topic:."
  "grill-numbered-questions:retry-topic:."
  "build-spec-gate:retry-topic:."
  "e2e-chain:grilling-summary:."
  "researcher-output-contract:-:"
  "researcher-multiple-questions:-:"
  "researcher-unanswered:-:"
)

rm -rf .sandbox
mkdir -p .sandbox

for entry in "${MAPPINGS[@]}"; do
  sandbox="${entry%%:*}"
  rest="${entry#*:}"
  fixture="${rest%%:*}"
  git_roots="${rest#*:}"
  dest=".sandbox/${sandbox}"

  mkdir -p "$dest"
  if [ "$fixture" != "-" ]; then
    # DEFECTS.md is fixture documentation, never part of the scenario's fake project.
    rsync -a --exclude 'DEFECTS.md' "fixtures/${fixture}/" "$dest/"
  fi

  if [ -n "$git_roots" ]; then
    for root in $git_roots; do
      repo="${dest}/${root}"
      git -C "$repo" init -q -b main
      git -C "$repo" add -A
      git -C "$repo" \
        -c user.name='fd3-evals' -c user.email='fd3-evals@localhost' \
        commit -q -m 'fixture baseline' --no-gpg-sign
    done
  fi
done

echo "fd3 sandboxes reset: ${#MAPPINGS[@]} scenario dirs under $(pwd)/.sandbox/"
