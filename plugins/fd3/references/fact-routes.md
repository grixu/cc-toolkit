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
nothing at all. This binds at every level: say so in every dispatch prompt, so an agent that
fans its own work out passes the rule down, and it is answerable for its children's reports
arriving.

Route by cost as well as by where the fact lives. A dispatch whose whole job is to locate and
quote — where X is defined, what line N says, which callers exist — runs on a cheaper model; one
that must judge, reconcile contradictory sources or design a probe does not. State the model in
the dispatch, so the choice is a decision rather than a default.

A dispatch expected to return more than roughly a screen of findings carries two extra things
in its prompt: the session's research directory, and the requirement to write the full report
there as a file per the researcher's output contract — the agent returns the condensed answers
and the file path, never the whole report. What enters the conversation is the routing slip;
the record lives in the file, where any later doubt is checked by reading, not by
re-dispatching.

Which of the three routes a topic needs is your call. What is not your call is leaving the
codebase and the live system until later: they are the two routes that establish what is
actually so — the code says what the system does, the live system says what it is doing —
while documentation, prior art and the topic document itself record what someone once
intended. A ranking, a size or a rate inferred from source is a hypothesis until the
measurement lands, and every decision resting on it stays provisional. Where one lookup's
question rests on a fact another will settle, sequencing them saves a wasted dispatch — weigh
that against the fact arriving late, which is the more expensive of the two. Before a
live-system dispatch, verify its credential with one cheap probe; an agent sent through a
logged-out CLI returns nothing and the question runs twice.

Parallel codebase lookups get exclusive territories: name in each prompt the files and
directories that belong to the other agents, and merge two questions whose territories would
overlap into one dispatch. A dispatch that has grown past roughly five sub-questions splits —
the researcher's contract takes several numbered input questions, and one overloaded agent
on the critical path costs more than two focused ones. Web-bound researchers share one
firecrawl quota: run two or three at a time, never the whole wave at once.

A dispatch prompt asks for the exact line of every cited construct — never the enclosing
function's range, never a bare path. A range forces the consumer to guess the line, and the
guess is what ends up quoted. A dispatch prompt states the question, never the topic's answer
to it.

A fact no route can reach because *you* lack access — an expired token, a console-only
setting — is still not a decision. Ask the user for the commands under their own heading at the
head of the round, naming the numbered questions they block — a probe that needs four commands or
a short script is still one request. It stands at the head of every round until it is done. An
unfulfilled access request is the most expensive thing in the session — everything behind it
waits. When the frontier would otherwise be empty and the access has still not come, do not close
on the assumption silently: put it as the round's last numbered question — proceed on the stated
assumptions as an accepted risk, or stop and wait.
