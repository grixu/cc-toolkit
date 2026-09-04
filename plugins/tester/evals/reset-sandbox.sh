#!/usr/bin/env bash
# Rebuild the tester eval sandbox and bring the target app up.
#
# /tester:run verifies a RUNNING application, so unlike the fd suite this reset does more than
# copy files: it recreates .sandbox/target-app from the pristine fixture, starts the two-container
# stack, and proves the fixture still exhibits its answer key before any tokens are spent.
# Wired as a pre-step by scripts/run-evals.sh and by `pnpm eval:tester`; safe to run by hand.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sandbox="$here/.sandbox"
app="$sandbox/target-app"
compose=(docker compose -f "$app/docker-compose.yml")

# Docker is not optional: the whole target stack is containerised, so without it there is
# nothing to verify. Fail here rather than let promptfoo spend a full run against a dead stack.
if ! docker info >/dev/null 2>&1; then
  echo "tester evals: Docker is not available — the target app cannot start, so this suite cannot run." >&2
  echo "  Start Docker and re-run, or skip this suite with promptfoo's --filter-pattern." >&2
  exit 1
fi

# agent-browser only gates the UI surface. Its absence narrows the run instead of stopping it,
# and gets recorded so the assertions score UI as not-applicable rather than as a missed defect.
if command -v agent-browser >/dev/null 2>&1; then
  ui_available=true
  ui_version="$(agent-browser --version 2>&1 | head -1)"
else
  ui_available=false
  ui_version=null
fi

# One shared stack on fixed ports means two overlapping runs are not merely slower, they are
# unscorable: each mutates the other's store, `docker pause` from one fault suite looks like a
# real fail-open to the other, and this script's own teardown restarts containers under a live
# run. A second reset also overwrites preflight.json, so the first run's assertions then hunt
# for a work dir and a transcript using the second run's timestamp and find neither.
#
# Our own ancestry is excluded: `pnpm eval:tester` runs this script from a shell whose command
# line is "reset-sandbox.sh && promptfoo -c …/promptfooconfig.yaml", which matches the pattern.
# Without the filter every run would refuse itself.
ancestors=" $$ "
p=$$
while [ "$p" -gt 1 ]; do
  p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d '[:space:]')"
  [ -z "$p" ] && break
  ancestors="$ancestors$p "
done

for pid in $(pgrep -f 'promptfoo.*plugins/tester/evals/promptfooconfig' 2>/dev/null || true); do
  case "$ancestors" in *" $pid "*) continue ;; esac
  echo "tester evals: another tester eval is already running (pid $pid) — refusing to reset the shared stack." >&2
  echo "  Wait for it to finish, or stop it: pkill -f 'plugins/tester/evals/promptfooconfig'" >&2
  exit 1
done

echo "tester evals: tearing down any previous stack"
if [ -f "$app/docker-compose.yml" ]; then
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
fi
# A WireMock proxy left behind by an interrupted fault suite would otherwise be mistaken for
# one this run failed to clean up.
docker rm -f tester-fault >/dev/null 2>&1 || true

rm -rf "$sandbox"
mkdir -p "$sandbox"
cp -R "$here/fixtures/target-app" "$app"

# Write the store explicitly rather than letting the app seed it on first boot. The app decides
# with existsSync-then-read, and rebuilding a bind-mounted directory immediately before `up -d`
# leaves Docker Desktop's view of it briefly stale: the deleted state.json still answers
# existsSync inside the VM, the read that follows gets ENOENT, and the app dies on boot.
cp "$app/seed.json" "$app/state.json"

echo "tester evals: starting the target stack"
"${compose[@]}" up -d >/dev/null

for _ in $(seq 1 60); do
  if curl -fsS http://localhost:4310/health >/dev/null 2>&1 &&
     curl -fsS http://localhost:4320/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -fsS http://localhost:4310/health >/dev/null 2>&1; then
  echo "tester evals: the target app did not become healthy on :4310" >&2
  "${compose[@]}" logs --tail 40 >&2 || true
  exit 1
fi

node "$here/verify-fixture.mjs"

# startedAt lets the assertions find THIS run's ephemeral work dir among any $TMPDIR/tester.*
# by mtime, instead of deleting directories that may belong to a real run of the command.
cat >"$sandbox/preflight.json" <<JSON
{
  "surfaces": { "api": true, "fault": true, "ui": $ui_available },
  "agentBrowser": $( [ "$ui_available" = true ] && printf '"%s"' "$ui_version" || printf 'null' ),
  "appBaseUrl": "http://localhost:4310",
  "pdpContainer": "tester-eval-pdp",
  "appContainer": "tester-eval-app",
  "startedAt": $(date +%s)
}
JSON

if [ "$ui_available" != true ]; then
  echo "tester evals: agent-browser is NOT on PATH — the UI surface is out of scope for this run."
fi
echo "tester evals: sandbox ready -> $app (app :4310, pdp :4320)"
