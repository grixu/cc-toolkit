# .ai: specs, their tasks, and plans

Specs, the tasks built from them, and executed plans live under `.ai/` at the repository root and
are committed, so the record of what was planned and built travels with the code:

```
.ai/
  specs/<slug>/      one directory per spec: SPEC.md and its reports
    tasks/           the task files executed under that spec
  plans/             plans, kept once executed
```

## specs/

- Every specification goes in `.ai/specs/<slug>/`, whichever skill writes it. `<slug>` is a short
  kebab-case name for what the spec delivers (`prepare-proof`), never a ticket key or a date.
- The tasks a spec is split into go in its `tasks/` and stay there once done: they record what was
  built under that spec. Run state written beside them (`implement-answers.md`, `HIL_ACTIONS.md`)
  stays in the spec's directory too.
- A spec's working state is git-ignored: its session folder (`*.session/`) and, in the older
  layout, `*.notes.md` and `*.research/`. Commit the spec, its reports and its tasks.

## plans/

- Plan mode writes its plans to `.ai/plans/` (`plansDirectory` in `.claude/settings.json`). A plan
  written outside plan mode goes there too, as `<slug>.md` named for what it delivers.
- Write each step of a plan as a checkbox, `- [ ]`. The implementing agent ticks a step, `- [x]`,
  in the same turn its change lands, and adds a one-line reason beside any step it skipped or
  changed, so the file holds the plan's progress across sessions and compactions.
- An executed plan stays in `.ai/plans/` and is committed with the work it planned.
