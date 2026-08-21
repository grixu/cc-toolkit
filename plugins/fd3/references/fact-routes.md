# Fact routes

How the fd3 skills dispatch fact lookups. Finding facts is the skill's job, never the
user's — the user answers decisions, not lookups.

Three routes, by where the fact lives:

- **The codebase** — dispatch the `Explore` subagent for a pointed question whose whole answer
  fits in a few lines; a sweep whose findings will run long goes to `general-purpose`, which can
  write its report to a file — `Explore` cannot.
- **Documentation, external contracts, prior art, alternative solutions, opinions** —
  dispatch the `fd3:researcher` subagent.
- **The live system** — dispatch the `general-purpose` subagent, which can run the CLI the
  answer needs (`gcloud`, `kubectl`, `gh`, a database client). Live state is authoritative
  over both code and documentation when they disagree, and it is the only place drift shows
  up: anything true in production and declared nowhere in code exists only here.

A lookup of one or two authenticated CLI or MCP calls whose exact command is already known —
`gh pr view`, one tracker query — needs no dispatch: the orchestrator makes it itself, after the
same cheap credential probe. The routes above govern lookups that take searching.

Dispatch every sub-agent unnamed — never pass `name:`. An unnamed one delivers its whole
report in the task notification; a named one only answers a later pull, and may deliver
nothing at all.

A dispatch expected to return more than roughly a screen of findings carries two extra things
in its prompt: the session's research directory, and the requirement to write the full report
there as a file per the researcher's output contract — the agent returns the condensed answers
and the file path, never the whole report. What enters the conversation is the routing slip;
the record lives in the file, where any later doubt is checked by reading, not by
re-dispatching.

Order the dispatches: codebase lookups go out first. A documentation or live-system lookup
whose question presumes a fact a pending codebase lookup will settle waits for that lookup —
a premise the code disproves wastes the whole dispatch. Before a live-system dispatch,
verify its credential with one cheap probe; an agent sent through a logged-out CLI returns
nothing and the question runs twice.

Parallel codebase lookups get exclusive territories: name in each prompt the files and
directories that belong to the other agents, and merge two questions whose territories would
overlap into one dispatch. A dispatch that has grown past roughly five sub-questions splits —
the researcher's contract takes several numbered input questions, and one overloaded agent
on the critical path costs more than two focused ones. Web-bound researchers share one
firecrawl quota: run two or three at a time, never the whole wave at once.

A dispatch prompt asks for the exact line of every cited construct — never the enclosing
function's range, never a bare path. A range forces the consumer to guess the line, and the
guess is what ends up quoted.

A fact no route can reach because *you* lack access — an expired token, a console-only
setting — is still not a decision. Ask the user for that one command at the head of the
round, before question 1, under its own heading and naming the numbered questions it blocks;
repeat it at the head of every following round until it is done. An unfulfilled access
request is the most expensive thing in the session — everything behind it waits.
