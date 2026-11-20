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

## Dobór modeli

- **[Model Team Engineering: Stop Paying Opus Prices for Grunt Work in Claude Code](https://x.com/0xmfox/status/2115825484529311955)**
  (Fox, @0xMfox, 29.10.2026), artykuł na X. Autor wycenił 3 miesiące swoich logów Claude Code: 98%
  rachunku szło na Opusie, 30% na czytanie plików i stron, a podział ról (Opus planuje, Sonnet buduje,
  Haiku czyta) dał w przeliczeniu 68% mniej. Podaje też, że Explore, Plan i general-purpose dziedziczą
  model sesji, że zmiana modelu w trakcie sesji traci cache, a cache subagenta żyje 5 minut. Wspiera
  wymaganie 11. Liczby to przeliczenie cen na tych samych zapytaniach, nie ponowny przebieg, więc nie
  mówią nic o jakości pracy na tańszym modelu.
