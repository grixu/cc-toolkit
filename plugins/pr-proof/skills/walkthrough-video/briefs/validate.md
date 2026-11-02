# Leg 3: validation

You are an independent reviewer of `scenario.md`. Every take costs a stack run and a render, so every scene must make sense to the audience and actually run against the built UI. Validate it, then fix it in place.

Read `scenario.md`, `requirements.md` (its `## User decisions` are binding) and `recast-notes.md` in the work dir, the sources `requirements.md` cites, and the built UI in the checkout. When the stack is up (your dispatch gives its URLs), check against the running app as well as the code: log in from a script that reads the credentials itself, then look with requests or a browser. The running app settles what the code leaves open: which data the seed holds, how many columns a layout has, whether an integration is enabled locally.

## Checks

Give each finding a verdict and evidence (scene id plus spec section, `file:line`, or what the running app showed):

1. **Repetition**: scenes or steps that show the same dialog, interaction pattern, filter or highlight twice without new information. Merge or cut.
2. **User sense**: anything a real user wouldn't do, odd ordering, contrived detours, dead time, steps that exist only to tick a requirement. Then the feature itself: would this behaviour make sense to a user? A check that blocks what the user can already do another way, repeated toasts while nothing changes, a list cut short, a layout that departs from the design system: each is a finding, shown plainly in the story, never captioned as working.
3. **Requirement coverage**: each scene's claimed FR/AC really matches its source; what the audience asked to see is covered; the "not shown" list is justified; nothing contradicts a requirement or a user decision; what the video presents as working is what the ticket, spec or design system asked for. Re-verify each finding in the scenario's Findings section against the source and the code, and mark it confirmed or refuted: a wrong finding must not reach the user.
4. **Executability**: every `data-testid`, role and name, route and toast text exists; preconditions follow from setup or earlier scenes; irreversible scenes leave later scenes workable; a re-run does not collide. Setup uses seeded data, the API on data the stack owns, or browser staging; a real write only on a resource named under `## User decisions`, with its revert. Nothing writes to a shared or external service except resources the user named, and staging blocks non-GET requests to such services. Setup that imports the repo's e2e helpers breaks the one-Playwright rule: rewrite it as raw requests.
5. **Captions**: every caption is at most 60 characters (count them) and 12 words, one cue, about user value, and the staged-data caption is there wherever the story stages data.
6. **Pacing and length**: settings match `recast-notes.md` (idle 1×, visible typing), zoom is not overused, the length estimate adds up, and the length is what the story needs: a PR's change usually one to three minutes, a whole feature at most about five. Cut low-value scenes when over; never pad when under.

## Fix

Edit `scenario.md` for every finding you are confident about, keeping its sections. Append `## Validation log`: one table per check, one row per finding with its verdict and the change made, or why none was.

## Finish line

All six checks have rows, every Findings entry is confirmed or refuted with evidence, and `scenario.md` reflects every confident fix. Return at most 12 lines: verdict, scene count before → after, length estimate, main changes, findings confirmed/refuted, UX concerns, and what the recorder must watch for.
