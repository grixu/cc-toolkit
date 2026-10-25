# Question batching

How an fd3 skill puts judgment calls to the user **through `AskUserQuestion`**. A skill that grills
in prose rounds — `grill-topic` — follows the question format in its own SKILL.md; the rules below
bind only where the tool carries the questions. Collect first, ask once: questions go out after
the facts are gathered, never one interruption per doubt — and anything you can look up is not a
question.

- **Batch in fours.** `AskUserQuestion` carries at most four questions per call. More judgment
  calls than four means consecutive batches of four, most consequential first, sent back to back —
  overflow never gets demoted to a note in the report.
- **Number the questions** across batches, so the answers and the report can cite them.
- **Cost every option.** Each option's description says what choosing it costs; an option that
  opens decisions of its own names them, since a follow-up that arrives only after the pick was
  never part of the comparison.
- **Recommend in every question.** The recommended option goes first and its description begins
  with `Recommended — `. Options with balanced descriptions and no recommendation make the user do
  the comparison you were meant to do.
- **Options are choices, not requests for text.** `AskUserQuestion` returns the label picked and
  nothing more, so an option whose answer needs typed detail — "Elsewhere — I'll name it", "a change
  to make", "give the path" — picked as it stands carries no answer at all. Such an option is never
  the recommended one and never first: the concrete choices come first, the recommendation is one
  of them, and the detail the user may want to type goes through the tool's own free-text answer,
  which the question names. When the only useful answer is a value the user must supply, the
  options are the values you can see, or the concrete fallback that holds without one.
