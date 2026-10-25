# build-spec stages 2 and 3

What `/fd3:build-spec` does once the user has confirmed the closing summary, and what a re-entry
runs. Read it at that point, and again after a compaction — a stage run from memory of this file is
where the pass loop goes wrong.

In stages 2 and 3 the questions come from the skills, never from you. A conflict you notice while
relaying — an answer that collides with a decision, a report that disagrees with another — goes to
the running agent with `SendMessage`, and it decides whether the fact is a question. A question you
add yourself reaches the user beside the skill's own, and its answer lands nowhere the document is
written.

Every question a skill raises reaches the user the same way: in the skill's own wording (a
translation keeps every qualifier and number; an answer to a question you relayed wrongly is asked
again, never interpreted), batched per `${CLAUDE_PLUGIN_ROOT}/references/question-batching.md`,
asked through `AskUserQuestion`, with sub-parts numbered (`20.1`, `20.2`) rather than lettered beside
lettered options — and the answers go back to the same agent with `SendMessage`, which resumes where
it stopped. Relaying them in prose invites answers you have to interpret.

## Stage 2 — write

Invoke the `fd3:write-spec` skill with the path of the closing-notes file the grilling wrote, the
session's research directory, and where the spec goes. The paths, never a description of where
things are. Where the spec goes is a path in the repository the work lands in, following the layout
its existing specs or design docs already use; when the repository has no such layout, that
location is a question in the closing round. Never default it to the scratchpad: a spec that lives
there has to be moved later, and the move rewrites the document after its verdict. It runs in its
own context; do not wrap it in a sub-agent of your own.

Relay its report: where the spec went, the counts, what is not yet settled in it, and the question
batch it closes with — asked as above, so it applies the answers before validation starts. If it
stops to ask instead, the same.

## Stage 3 — validate

Invoke the `fd3:validate-spec` skill on the written spec. It runs in its own context and returns its
verdict and status. Validation is also where the spec's defects get repaired: the skill edits the
spec wherever a fact settles one, so its report lists spec edits alongside findings. A verdict on a
spec that had findings and lists no edits is a pass that only counted them — say so when you relay
it.

After each return, take the first of these that holds:

1. **The pass stopped to ask.** Its questions came to you, or its return lists anything under *Still
   open* — even with a `not ready` verdict and its full table, because that verdict describes the
   document before the answers. The pass is not finished: ask its questions as above and resume it
   with `SendMessage`, never with a fresh invocation — only the same pass applies the answers with
   everything it already established.
2. **Three passes have run.** Stop the loop; if the third ended short, say plainly what is still
   open. Its own body edits go to the post-verdict pass below.
3. **The pass ended its own turn with a verdict, and either the verdict is `not ready` and a further
   pass could close what remains, or the pass applied spec edits to the body** — its own dated
   evidence block is not one. A `ready` verdict on a document the same pass rewrote is a verdict on
   the version before those edits, and nothing but the next pass ever reads them, so do not skip it
   because the verdict looks close. Invoke the skill again on the same spec, passing back the status
   it returned — its text, verbatim, never a path to where it is stored — and a **focus list**: the
   findings the previous pass left open and the sections it edited. That is what the next pass
   spends itself on; everything the status records as verified it inherits.
4. **Otherwise** the loop is done.

Relay the final verdict, and relay every finding the status leaves standing inside a passing check.

## After the verdict

The final verdict describes the file as the last pass left it, and its line count is how the next
stage checks that. Any change to the spec after it — a tickets table, a rewritten header, a
corrected link, or a body edit the capped third pass applied itself — is an edit no pass has read:
run one more pass focused on exactly those edits, outside the three-pass cap, before you call the
spec done. That is one pass, not a series: whatever it edits it re-verdicts in its own block, and if
its verdict is not `ready`, relay what stays open and stop rather than launching another.

The status, the verdict and any "validated" wording are written by passes only; never type them
into the spec yourself. Nor its body, nor its place: the spec stays at the path stage 2 wrote, never
moved or copied once a pass has read it. A decision the user takes after the verdict — a new option,
a reversed choice, in this session or on re-entry — is appended to `notes.md` in the spec's
session folder, `<spec-basename>.session/`, as a ratified decision with its provenance, then
applied by `fd3:write-spec` (resumed with `SendMessage` while its agent is addressable, otherwise
invoked with that notes file, the folder's `research/` directory and the existing spec path), and
the next pass reads its edit — the post-verdict pass in this session, the first stage-3 pass on
re-entry. A session folder or a file in it that no longer exists is created, holding only what this
decision brings, the folder with the `.gitignore` of `*` that `fd3:write-spec` gives it. A spec from
before session folders keeps its notes beside it as `<spec-basename>.notes.md`, its research in
`<spec-basename>.research/`: use those where they exist.

## Re-entry

A finished spec handed back to `/fd3:build-spec` skips stages 1 and 2. A change the user brings is
a decision taken after the verdict — apply it as the section above says — and then stage 3 runs on
that path. When the re-entry names no reason, ask for one with the concrete choice first and
recommended — re-validate the spec as it stands against the repositories as they are now — and
the change the user would have to type as the question's free-text answer, never as a listed option
(`question-batching.md`).

The first pass's focus list is what changed since the last verdict line, read from the spec and the
re-entry itself, never from `git`, which often does not track the spec at all: the sections
`fd3:write-spec` just edited, any drift the user or the calling skill named, and — when the file's
line count differs from the count the last verdict line records — the whole document, because an
edit no pass recorded cannot be located without a copy, and none is kept. An equal count is no proof
that nothing changed — it is blind to an edit that keeps the length, which is why every change takes
this route. Everything else in stage 3 applies unchanged.
