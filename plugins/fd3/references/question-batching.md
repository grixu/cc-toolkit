# Question batching

How an fd3 skill puts judgment calls to the user. Collect first, ask once: questions go out after
the facts are gathered, never one interruption per doubt — and anything you can look up is not a
question.

- **Batch in fours.** `AskUserQuestion` carries at most four questions per call. More judgment
  calls than four means consecutive batches of four, most consequential first, sent back to back —
  overflow never gets demoted to a note in the report.
- **Number the questions** across batches, so the answers and the report can cite them.
- **Recommend in every question.** The recommended option goes first and its description begins
  with `Recommended — `. Options with balanced descriptions and no recommendation make the user do
  the comparison you were meant to do.
