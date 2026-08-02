# Fact routes

How the fd3 skills dispatch fact lookups. Finding facts is the skill's job, never the
user's — the user answers decisions, not lookups.

Three routes, by where the fact lives:

- **The codebase** — dispatch the `Explore` subagent.
- **Documentation, external contracts, prior art, alternative solutions, opinions** —
  dispatch the `fd3:researcher` subagent.
- **The live system** — dispatch the `general-purpose` subagent, which can run the CLI the
  answer needs (`gcloud`, `kubectl`, `gh`, a database client). Live state is authoritative
  over both code and documentation when they disagree, and it is the only place drift shows
  up: anything true in production and declared nowhere in code exists only here.

Dispatch every sub-agent unnamed — never pass `name:`. An unnamed one delivers its whole
report in the task notification; a named one only answers a later pull, and may deliver
nothing at all.
