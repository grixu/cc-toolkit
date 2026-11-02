# Leg 2: scenario

Write `scenario.md`: the walkthrough a recorder will turn, beat for beat, into one playwright-recast test and record against the local stack. It must be faithful to `requirements.md` (its `## User decisions` are binding), grounded in the UI as actually built, and paced so a viewer calmly sees what happens, what is clicked and what is typed.

When your dispatch hands you a scenario or step list from the caller, write it in this file's format, keep its story, and still fill every section below; list every place it disagrees with `requirements.md` under Findings.

## Read

- `requirements.md` and `recast-notes.md` in the work dir (its Helpers and Tested settings sections are what the recorder will write with).
- The built UI in the checkout: real routes, components, dialogs, buttons, `data-testid`s, labels, validation messages, toasts and confirmation texts for every FR you show. Existing e2e page objects and tests are a selector source; say which ones the recorder can mirror.
- Seed data: what the local stack holds after the project's init or seed script, which persona each credential key belongs to (key names only, never values), whether the feature's flag is on locally, and which preconditions setup can create through the API on data the stack owns.
- The project's `CLAUDE.md` on which local actions reach shared or external services.

## The story

One coherent story the audience can follow, as a sequence of scenes, covering what they asked to see first and the rest of the scope after. With a PR, the story is the change: show the new behaviour; describe the old one in a caption only where the contrast is the point. Order the scenes so each precondition is met by the setup or an earlier scene, and put every irreversible action after the scenes that need what it destroys (the owner's rights before an ownership transfer; the role before its deletion). Every scene serves an FR or AC. A scene a real user would not do, a repeat of an interaction already shown, or a detour that only ticks a requirement does not belong.

A UX concern or defect the recording will show is shown plainly and named in Findings; never route the story around it, and never caption it as working.

## Demo data

Prefer, in this order:

1. **Seeded data, read-only**, in the seeded organization the credentials log into.
2. **Local data the stack owns**, created by setup through the API and deleted in teardown, with names a re-run cannot collide with and emails at `example.com`.
3. **Staged in the browser**: a state the stack cannot produce (an upstream outage, a live instance, a second persona's view) faked with `page.route` in the hidden `prepare` step, or with the clock. Say so on camera with one short caption ("Data on this page is staged for the demo.") and list it under Setup.
4. **Real writes to shared data** only on resources the user named under `## User decisions`, with a teardown that restores them and a note that a retake may need a fresh resource.

Never create, change or delete data on a shared or external service any other way; block every non-GET request to such a service in `prepare` so a stray click fails instead of writing.

## Per scene

- id, title, and the FR/AC it demonstrates;
- precondition;
- exact steps: route, element (the real `data-testid`, or role and accessible name), exact text typed;
- captions: short English sentences describing user value (never an API, a service, a policy id). Each caption is **at most 60 characters** and at most 12 words: the renderer splits anything longer into a second cue that starts mid-sentence in lowercase. Count the characters;
- pacing: pauses, which element to zoom or highlight, typing speed;
- the visible outcome to wait for (toast text, row, dialog closing).

## Sections

- **Recording settings**: viewport, the `setupRecast` options, `speedUp` with idle at 1×, caption style and position (top when a dropdown or footer opens at the bottom). Start from the tested values in `recast-notes.md`.
- **Setup / data preconditions**: logged-in state via API, which demo-data tier each precondition uses, everything staged in the browser, flags, reset, teardown.
- **Scenes**.
- **Length estimate**: per scene, captions at 12 characters a second (2.5 s minimum each) plus typing at 140 ms a character plus holds; the total.
- **Spec coverage**: FR/AC → scene id, plus each requirement intentionally not shown and why.
- **Findings**: every place where the built UI and the requirements disagree, and every UX concern the scenes show, with evidence. List them; never paper over one in the story.

## Finish line

Every scene maps to an FR/AC and names real selectors found in the code, every FR the audience asked about is covered or listed as not shown with a reason, every caption is within 60 characters, and the length is what the story needs: a PR's change usually runs one to three minutes, a whole feature at most about five. Never pad to reach a length. Return at most 12 lines: scene count, the story arc in one line, length estimate, setup preconditions and what is staged, findings.
