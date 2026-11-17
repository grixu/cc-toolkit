---
title: Dokumentacja referencyjna
description: Argumenty /code-review:start-cr, pliki projektu, które czyta, słownik raportu i kroki bez interakcji, które uruchamiają workflowy.
group: reference
sidebar:
  label: Referencja
  order: 4
---

## Argumenty start-cr

`/code-review:start-cr [paths...] [--base <branch>] [--spec <path>] [--pr <number>]`

| Argument | Co robi |
|---|---|
| `paths...` | Przegląda te pliki albo katalogi w całości zamiast diffu brancha. |
| `--base <branch>` | Mierzy zmianę względem tego brancha. Bez niego: branch upstream, `origin/main`, `origin/master`, `main`, potem `master`. |
| `--spec <path>` | Dołącza soczewkę spec dla lokalnego pliku specu. Adres URL ani identyfikator zgłoszenia nie przejdą; review poprosi o lokalną ścieżkę. |
| `--pr <number>` | Przegląda head pull requesta z GitHuba względem jego bazy, przez `gh`. Nie przyjmuje ścieżek ani `--base`. |

Tabela 1. Argumenty `/code-review:start-cr`

Nie ma argumentu do wyboru soczewek.
O tym, które ruszają, decydują zmiana i spec; zobacz [Jak to działa](/pl/plugins/code-review/how-it-works/#soczewki).

## Wymagania

| Wymaganie | Po co |
|---|---|
| `git` | Zmiana jest czytana z gita. |
| `python3` | Dołączony skrypt `get_changes.py` znajduje zmienione pliki i ustala bazę. |
| Narzędzie `Agent` | Każda soczewka działa jako osobny subagent. Bez niego `start-cr` mówi o tym, zanim cokolwiek zrobi. |
| `gh` | Tylko dla `--pr` i do wykrycia, że bieżący branch to cudzy otwarty pull request. |

Tabela 2. Czego potrzebuje review

## Pliki projektu czytane przez review

### Pliki, które tworzą uwagi

`CODING_STANDARDS.md` w katalogu głównym repozytorium i `CODING_STANDARDS.local.md` obok niego obowiązują razem.
Gdy się różnią, w danym punkcie wygrywa plik `.local`.
Trzymaj plik `.local` poza gitem; śledzony przez gita zostanie wymieniony w linii `Conventions` raportu.
Liczy się tylko para z katalogu głównego.

Jawna reguła, np. „Domain services MUST NOT import from `infra/`”, staje się uwagą `standards`, która ją cytuje.
Jej wagę ustala słowo kluczowe reguły:

| Słowo kluczowe | Waga |
|---|---|
| MUST, MUST NOT, NEVER, ALWAYS | `high` |
| SHOULD albo brak słowa | `medium` |
| MAY, prefer, consider | `nit` |

Tabela 3. Waga uwagi `standards`

Ogólnik w rodzaju „pisz czysty kod” nie tworzy niczego.
Reguły o formatowaniu, białych znakach, kolejności importów i cudzysłowach są pomijane, gdy w katalogu głównym leży konfiguracja formatera albo lintera, bo to narzędzie ich pilnuje.
Review sprawdza `.prettierrc*`, `biome.json`, `eslint.config.*`, `.eslintrc*`, `.editorconfig`, `ruff.toml` albo tabelę `[tool.ruff]` w `pyproject.toml`, `.golangci.yml`, `rustfmt.toml`, `phpcs.xml` i `.php-cs-fixer*`.

Przyjęty ADR, `CONTEXT.md` albo dokument decyzji w zmianie też tworzą uwagi: soczewka coherence zgłasza kod łamiący zapisaną w nich regułę.

### Pliki, które tylko usuwają uwagi

`CLAUDE.md` i `AGENTS.md` (w katalogu głównym i w każdym katalogu aż do ocenianego pliku), `CONTRIBUTING.md`, `.cursor/rules` i `.claude/rules/*.md`.
Gdy któryś opisuje styl, review przestaje go zgłaszać.
Gdy dwa pliki projektu sobie przeczą, wygrywa bardziej szczegółowy, a raport wymienia konflikt w linii `Conventions`.

## Słownik raportu

| Kształt | Przykład |
|---|---|
| Uwaga do kodu: `` `family` · rule · severity · lines — problem → fix `` | `` `readability` · magic-literal · medium · L22 `` |
| Werdykt o komentarzu: `` `comments` · R1–R12 · verdict · line — problem → fix `` | `` `comments` · R2 · ADD · L44 `` |

Tabela 4. Dwa kształty uwag

- **Rodziny:** `readability`, `tests`, `naming`, `module`, `objects`, `patterns`, `simplicity`, `correctness`, `security`, `coherence`, `assumptions`, `performance`, `spec` i definiowana przez repozytorium `standards`.
- **Wagi:** `high`, `medium`, `nit`. Uwaga z rodziny `security`, `correctness`, `spec`, `coherence` albo `assumptions` ma tylko `high` albo `medium`.
- **Werdykty o komentarzach:** `KEEP` (komentarz zostaje), `REMOVE`, `REWRITE` (z dokładnym tekstem), `MOVE` (tam, gdzie żyje opisywane zachowanie) i `ADD` (brakujący komentarz wyjaśniający decyzję).
- **`(verify)`:** fakt, którego scanner nie może potwierdzić z tego, co czyta, np. zachowanie w czasie działania albo plik spoza review. Scannery czytają kod; soczewki correctness, security, performance i spec nigdy go nie uruchamiają.
- **Bloki raportu:** `Conventions`, `Headline`, sekcja na każdy plik, `Not flagged`, `Boy-scout`, `Tally`, a nad nimi linia `Reconciliation`.

## Kroki bez interakcji

Trzy skille dzielą `start-cr` na kroki dla workflowów, które nie mogą odpowiadać na pytania ani uruchamiać własnych subagentów.
Są ukryte w menu `/` i nie są do ręcznego uruchamiania.
`/fd3:implement` używa ich do review każdego brancha, który buduje: `cr-prepare` raz, `cr-scan` raz na każdą aktywną soczewkę, potem `cr-merge`.
`start-cr` też używa `cr-scan`, przez agenta `scanner`.

| Skill | Argumenty | Zapisuje |
|---|---|---|
| `code-review:cr-prepare` | `--base <ref> --out <dir> [-C <checkout>] [--spec <path> [--spec-focus <codes>]]` | `scope.json`, `conventions.md`, `standards.md` |
| `code-review:cr-scan` | `--lens <lens>[,<lens>…] --context <dir>` | `<lens>.md` na każdą soczewkę |
| `code-review:cr-merge` | `--context <dir>` | `cr-report.md` |

Tabela 5. Kroki bez interakcji

- **Zakres:** tylko zmiany zacommitowane, względem `--base`. Niezacommitowana praca należy do tego, kto ma checkout otwarty.
- **O nic nie pytają, niczego nie edytują.** Każdy skill pisze tylko do katalogu kontekstu i zwraca blok zamykający ze statusem.
- **Nazwy soczewek** to nazwy plików reguł bez rozszerzenia: `comments`, `readability-tests`, `naming-module`, `objects-patterns`, `simplicity-types`, `correctness`, `security`, `coherence`, `assumptions`, `performance`, `spec`, `hookify`.
- **`--spec-focus "DB-1,D3"`** wskazuje kodami elementów albo identyfikatorami decyzji część specu, którą implementuje zmiana. Wymaga `--spec`. Soczewki spec i correctness oceniają zmianę najpierw względem tych elementów.
- **Lista soczewek** (`--lens comments,security`) uruchamia soczewki jedna po drugiej w jednym agencie. Początkowe czytanie płaci się raz, ale późniejsze soczewki czytają z wcześniejszymi w kontekście, a ich zgodność nie liczy się jako zbieżność. Przy dużej zmianie coherence i assumptions działają jako osobne agenty. `/fd3:implement` używa jednego agenta na wszystkie soczewki, gdy zmiana ma najwyżej trzy oceniane pliki.

| Skill | Statusy |
|---|---|
| `cr-prepare` | `ready`, `empty` (z alternatywną bazą, gdy skrypt ją znalazł), `error` |
| `cr-scan` | `scanned`, `inactive`, `error`, jeden blok na każdą soczewkę z listy |
| `cr-merge` | `merged`, `incomplete` (wymienia soczewki, które się nie zgłosiły), `error` |

Tabela 6. Statusy zamykające

Pusta zmiana albo soczewka, która się nie zgłosiła, wraca jako status, nigdy jako czyste review.
`cr-merge` zwraca jedną linię na uwagę z klasą poprawki `safe`, `structural` albo `report-only`, listę `unowned` z prawdziwymi problemami, których nie nazywa żadna reguła, i linię `security-review` z plikami zostawionymi dla `/security-review` z Claude Code.

## Zapisywane pliki

| Plik | Kto zapisuje | Gdzie |
|---|---|---|
| `scope.json`, `conventions.md`, `standards.md` | `start-cr` albo `cr-prepare` | katalog kontekstu |
| `<lens>.md` | każdy scanner, przez `cr-scan` | katalog kontekstu |
| `cr-report.md` | `cr-merge` | katalog kontekstu |
| plik raportu i wyboru | `start-cr`, przed stosowaniem poprawek | katalog roboczy sesji |
| plik szkicu review | `start-cr` w trybie reviewera | katalog roboczy sesji |
| `<repo>.worktrees/cr-pr-<number>` | `start-cr --pr`, gdy checkout nie stoi na headzie | obok repozytorium |

Tabela 7. Pliki zapisywane przez review

## Ograniczenia

- **To nie jest audyt bezpieczeństwa.** Soczewka security nie skanuje zależności, plików `.env`, lockfile'i ani przypięcia wersji akcji. Do tego uruchom `/security-review` z Claude Code.
- **Reguły są pisane głównie pod JavaScript i TypeScript** oraz kod imperatywny i obiektowy. Reguła bez odpowiednika w danym języku zostaje odpuszczona, a nie naciągnięta.
- **Soczewka assumptions czyta zainstalowane zależności.** W checkoucie bez nich korzysta z instalacji w głównym worktree, gdy lockfile przypina tę samą wersję. W przeciwnym razie sięga po typy, README albo changelog samej paczki, a gdy żadne z nich nie rozstrzyga sprawy, oznacza twierdzenie jako `(verify)`.
