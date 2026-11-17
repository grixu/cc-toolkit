# Leg 1a: requirements

Produce `requirements.md`: the functional requirements (FR) and acceptance criteria (AC) a scenario writer can build a walkthrough on without reading anything else. A wrong or missing requirement here becomes a wrong or missing scene in the recording, so this file must be **complete within its scope** and honest about where each line came from.

## Scope

Your dispatch names it. With a PR or branch, the scope is what that change makes different for a user: compare against the base (`git diff origin/main...HEAD`, the PR description) and record as FRs only behaviour the change adds, alters or fixes. Behaviour the change leaves alone goes under **Unchanged context** in one line each, never as an FR, even where a PR table re-lists it. Without a PR, the scope is the whole feature.

## Find the source

Search in this order; stop descending once a source covers the scope, but read every companion it links:

1. The spec path you were given.
2. The repository's docs: spec, PRD, ADR, feature or domain folders whose name matches the feature; task files that carry acceptance criteria; the design-system pages for the components the change touches.
3. The PR: `gh pr view <n> --json title,body,headRefName` and the tickets it or its branch name links (read Jira through its MCP when one is connected).
4. The e2e and component tests that cover the feature: their titles and assertions are acceptance criteria someone already wrote.
5. The built code: routes, pages, dialogs, forms, validation messages, toasts, API endpoints the UI calls, feature flags, permission checks.

A requirement is `stated` when a document or ticket says it and `derived` when you read it off the tests or code. Derive from the code even when a spec exists, wherever the spec leaves a user-visible behaviour unstated.

## What to record

- **FRs**, each with an id (`FR-1`…; keep the spec's own ids when it has them), one line of user-observable behaviour, and its source (`path#section` or `file:line`).
- **ACs** under each FR: observable outcomes a viewer could see on screen (Given/When/Then is fine), each with its source.
- **Personas**: which user types and permissions matter, which credential key (name only) each maps to, and which persona the story is missing.
- **Data**: where each precondition lives. Local data the stack owns can be created and deleted; data on a shared or external service (per the project's `CLAUDE.md`) cannot, and must be staged in the browser or written only to resources the user names.
- **Irreversible actions** (ownership transfer, delete, revoke, writes to shared data): flag them, because they decide scene order and whether a retake is possible.
- **Gates**: feature flags, plan or permission conditions that hide the feature.
- **Not demonstrable**: requirements with no visible effect (migrations, infra, monitoring, rate limits), each with a one-line reason.
- **Disagreements**: wherever the spec and the built code differ, record both sides with evidence. Do not pick a winner.
- **UX concerns**: behaviour that matches the code but would puzzle or annoy a user: a check that blocks an action the user can already do another way, a toast that repeats while nothing changes, a list cut short, a layout that departs from the design system. Each with evidence. These go to the user before anything is recorded.
- **Open decisions**: choices the user should make before the scenario exists, each with options and your recommendation: real or staged data, a negative case shown live (needs a reversible change) or only in a caption, which of several instances to show.
- **Unchanged context** (PR scope only).

## Finish line

Every user-visible change in scope appears as an FR with at least one AC, every FR and AC cites a source and carries `stated` or `derived`, every disagreement lists both sides, and every UX concern and open decision is listed. Return a summary of at most 12 lines: where the requirements came from, FR/AC counts by `stated`/`derived`, irreversible actions, disagreements, UX concerns and open decisions.
