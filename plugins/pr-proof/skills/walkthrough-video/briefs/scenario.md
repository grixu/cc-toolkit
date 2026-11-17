# Leg 2: scenario

Write `scenario.md`: the walkthrough a recorder will turn, beat for beat, into one playwright-recast test and record against the local stack. It must be faithful to `requirements.md` (its `## User decisions` are binding), grounded in the UI as actually built, and paced so a viewer calmly sees what happens, what is clicked and what is typed.

When your dispatch hands you a scenario or step list from the caller, write it in this file's format, keep its story, and still fill every section below; list every place it disagrees with `requirements.md` under Findings.

## Read

- `requirements.md` and `recast-notes.md` in the work dir (its Helpers and Tested settings sections are what the recorder will write with).
- The built UI in the checkout: real routes, components, dialogs, buttons, `data-testid`s, labels, validation messages, toasts and confirmation texts for every FR you show. Existing e2e page objects and tests are a selector source; say which ones the recorder can mirror.
- Seed data: what the local stack holds after the project's init or seed script, which persona each credential key belongs to (key names only, never values), whether the feature's flag is on locally, and which preconditions setup can create through the API on data the stack owns.
- The project's `CLAUDE.md` on which local actions reach shared or external services.
- The repo profile (`repo-profile.md` in the work dir's parent): personas, toast and overlay selectors, flags and shared services as earlier runs found them. Check what you rely on against the code; it can be stale.

## The story

One coherent story the audience can follow, as a sequence of scenes, covering what they asked to see first and the rest of the scope after. With a PR, the story is the change: show the new behaviour; describe the old one in a caption only where the contrast is the point. Order the scenes so each precondition is met by the setup or an earlier scene, and put every irreversible action after the scenes that need what it destroys (the owner's rights before an ownership transfer; the role before its deletion). Every scene serves an FR or AC. A scene a real user would not do, a repeat of an interaction already shown, or a detour that only ticks a requirement does not belong.

The viewer watches once and cannot ask what they missed, so tell the story in the order they need it:

- **Scene 0 is the title card**, the video's first frame and the poster a PR shows before anyone presses play: a kicker (the PR number and repository, or the ticket, or the feature's area) and a headline naming the change in a user's words, at most 40 characters.
- **The why comes first.** Scene 0's caption, or at the latest the next one, says who the change helps and how: a consequence, never a mechanism. "Reviewers rebuilt the same filter every morning" is a why; "Filters are now persisted" is a mechanism.
- **Name every member of a set.** A caption that announces "three fields are saved" owes the viewer a beat for each field, each named in its own caption and highlighted on screen.
- **One screen per idea.** A change of route or view costs the viewer their bearings, so stay on one screen while one requirement unfolds (open the panel, fill the field, point at the result) and move only for the next idea.

A UX concern or defect the recording will show is shown plainly and named in Findings; never route the story around it, and never caption it as working.

## Demo data

Prefer, in this order:

1. **Seeded data, read-only**, in the seeded organization the credentials log into.
2. **Local data the stack owns**, created by setup through the API and deleted in teardown, with names a re-run cannot collide with and emails at `example.com`.
3. **Staged in the browser**: a state the stack cannot produce (an upstream outage, a live instance, a second persona's view) faked with `page.route` in the hidden `prepare` step, or with the clock. Say so on camera with one short caption ("Data on this page is staged for the demo.") and list it under Setup.
4. **Real writes to shared data** only on resources the user named under `## User decisions`, with a teardown that restores them and a note that a retake may need a fresh resource.

Never create, change or delete data on a shared or external service any other way; block every non-GET request to such a service in `prepare` so a stray click fails instead of writing.

## Per scene

- id, title, and the FR/AC it demonstrates (scene 0 demonstrates none: it carries the kicker, the headline and the why);
- precondition;
- exact steps: route, element (the real `data-testid`, or role and accessible name), exact text typed;
- captions: short English sentences describing user value (never an API, a service, a policy id). Each caption is **at most 60 × caption density characters** and at most 12 × density words (normal 60 and 12, 2x 120 and 24, 4x 240 and 48): the renderer splits anything longer into a second cue that starts mid-sentence in lowercase. Count the characters. At a higher density, write fewer, fuller captions that say what several short ones would, rather than the same short ones;
- pacing: pauses, which element to zoom or highlight, typing speed;
- the visible outcome to wait for (toast text, row, dialog closing).

## Sections

- **Recording settings**: viewport, the `setupRecast` options, the speed and caption density from your dispatch (the render applies both through `SPEED` and `CAPTION_DENSITY`; the take itself stays at the calm pace), caption position (top when a dropdown or footer opens at the bottom). Start from the tested values in `recast-notes.md`.
- **Setup / data preconditions**: logged-in state via API, which demo-data tier each precondition uses, everything staged in the browser, flags, reset, teardown.
- **Scenes**.
- **Length estimate**: per scene, the recorded length: captions at 12 characters a second (2.5 s minimum, 6 s × density maximum each) plus typing at 140 ms a character plus holds; the recorded total, and the rendered total, which is the recorded one divided by speed ÷ 0.5 (half of it at `1x`, a tenth at `5x`).
- **Spec coverage**: FR/AC → scene id, plus each requirement intentionally not shown and why.
- **Findings**: every place where the built UI and the requirements disagree, and every UX concern the scenes show, with evidence. List them; never paper over one in the story.

## Finish line

Scene 0 is the title card and the why is said by the second caption, every later scene maps to an FR/AC and names real selectors found in the code, every FR the audience asked about is covered or listed as not shown with a reason, every caption is within the density's limit, and the recorded length is what the story needs: a PR's change usually runs one to three minutes recorded, a whole feature at most about five. Never pad to reach a length. Return at most 12 lines: scene count, the story arc in one line, recorded and rendered length estimates, setup preconditions and what is staged, findings.
