# fd4: źródła wiedzy

Zewnętrzne materiały, na których opieramy założenia i pomysły fd4. Każde źródło ma zapisane, czego
dotyczy i które punkty [`GOAL.md`](GOAL.md) wspiera.

## Soczewki walidacji

- **[Automated Doubt](https://www.alexself.dev/blog/automated-doubt)** (Alex Self), esej o walidacji
  wieloagentowej, która przenosi wątpliwości na etap przed implementacją. Stąd pochodzą soczewki
  SPEC i zadań: wymaganie 6 i pomysł 8.
- **[aself101/agents-and-pipelines](https://github.com/aself101/agents-and-pipelines)**, repozytorium
  z implementacją agentów z eseju jako definicji dla Claude Code: 57 agentów, 54 komendy i 4 pipeline'y
  (np. `pre-implementation`). Zawiera prompty soczewek, m.in. `assumption-excavator`, i ich podział
  na typy (Analyst, Explorer, Validator…) oraz warstwy (strukturalna, behawioralna, rozumowania…).
