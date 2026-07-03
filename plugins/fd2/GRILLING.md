# Grillowanie — współdzielony agent

Grill to interaktywna pętla drążenia wymagań, wspólna dla `/start`, `/from-docs` i
`/grill`. Doprowadza spec do stanu kompletnego i spójnego, uzupełniając luki, niejasności
i sprzeczności, gruntując zewnętrzne twierdzenia i utrwalając model domenowy. Jest jednym
blokiem — komendy różnią się tylko tym, co podają na wejściu i co robią po jego
zakończeniu.

---

## 1. Wejście / wyjście

**Wejście** (zależnie od komendy):
- z `/start`: temat od usera + kontekst kodu projektu.
- z `/from-docs`: produkt analizy (kandydaci FR/NFR/AC, agenda grilla, `CONTEXT.md`,
  `sources-map.json`).
- z `/grill`: istniejący spec + nowy wkład usera (drążenie / nowe informacje).

**Wyjście:** zaktualizowany `spec.md` (elementy z ID-kotwicami), `ac-map.json`,
`CONTEXT.md`, dopisy do `sources-map.json`. Po zapisie komenda-właściciel odpala
walidację specu (ogon — `BUILDING_SPEC.md` §5).

---

## 2. Pętla grilla

Agent prowadzi rozmowę wokół **agendy** — listy otwartych pozycji: luk (brakujące
elementy / AC), niejasności (mgliste czasowniki, nieokreślone kontrakty) i sprzeczności
(kolidujące FR/NFR). Dla `/from-docs` agenda przychodzi z analizy; dla `/start` i
`/grill` agent buduje ją z tematu / istniejącego specu.

Każdy rozwiązany punkt materializuje się jako zmiana w specu: nowy lub uzupełniony blok
elementu (z ID), nowe AC z nawiązaniem w `ac-map.json`, doprecyzowany kontrakt. Grill jest
świadomy istniejących ID — zachowuje je, alokuje nowe tylko dla nowych elementów.

Pętla trwa, dopóki agenda nie jest pusta lub user jej świadomie nie zamknie. Grill nie
wychodzi poza wymagania w kod implementacji.

---

## 3. Skille bazowe

Grill opiera się o skille (drążenie oparte na dokumentacji + modelowanie domenowe):

- https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md
- https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md
- https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/CONTEXT-FORMAT.md
- https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/ADR-FORMAT.md

---

## 4. CONTEXT.md i ADR

Grill produkuje i utrzymuje **model domenowy `CONTEXT.md`** (format domain-modeling
mattpocock) oraz ADR-y (format ADR mattpocock), zapisywane wg trybu przechowywania z
konfiguracji:

- **per-feature** — `CONTEXT.md` i `adr/` w katalogu funkcjonalności.
- **shared** — `CONTEXT.md` per aplikacja / bounded context w `contextFile`, ADR w
  `adrRoot`. W tym trybie język współdzielonych artefaktów = domyślny z configu
  (`BUILDING_SPEC.md` §3).

Bounded context funkcjonalności (tryb shared + `per-bounded-context`) wynika z
`state.json.boundedContext` — z niego wiadomo, którego `CONTEXT.md` użyć
(`COMMAND_CONFIG.md`).

---

## 5. Grounding on-demand

Każde zewnętrzne twierdzenie (API / lib / framework / 3rd-party) jest gruntowane **od
razu** podczas grilla. Samo wyszukiwanie i fetch — zwłaszcza masowe — jest **delegowane
do subagentów** (`RESEARCHER.md`): główna pętla grilla pozostaje lekka, a subagenty
zwracają `{fakt, cytat, źródło}`, które zasilają `sources-map.json`. Fan-out N (lub
zbatchowanych) subagentów daje równoległość i oszczędza kontekst grilla.

Brak MCP groundingu → `groundingDegraded: true` + ostrzeżenie; obligacja pozostaje
intencją (best-effort).

---

## 6. Checkpoint do specu i idempotencja

Grillowana treść żyje w **specu** (źródło prawdy), nie w kontekście sesji. Dzięki temu:
- przerwany grill można wznowić z workspace'u,
- dorzucenie źródła (`/from-docs` re-run) jest reconcile, nie generacją od zera —
  grillowana treść przetrwa, bo jest w specu. Warunek: bieżący grill jest checkpointowany
  do specu przed re-ingest.

Po zakończeniu grill zapisuje spec i oddaje sterowanie komendzie-właścicielowi, która
uruchamia walidację i zamyka się na granicy (checkpoint między-komendowy — `SPEC.md`
§5.1).
