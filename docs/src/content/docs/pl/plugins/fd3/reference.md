---
title: Dokumentacja referencyjna
description: Wymagania, argumenty komend, pliki i branche, które zapisuje fd3, oraz pola pliku zadania.
group: reference
sidebar:
  label: Referencja
  order: 7
---

## Wymagania

| Do czego | Wymaganie |
|---|---|
| Wszystkiego | Claude Code i checkout git każdego repozytorium, którego dotyczy praca, z remote'em `origin`. Wywiad, walidacja, cięcie i implementacja zaczynają od `git fetch`. |
| Szukania dokumentacji | Serwery MCP context7 i firecrawl. Sub-agent fd3 do researchu używa ich jako źródeł. |
| `/fd3:implement` | [Dynamiczne workflow](https://code.claude.com/docs/en/workflows). Są dostępne w płatnych planach i z dostępem do Anthropic API. W planie Pro włącz je w wierszu Dynamic workflows w `/config`. Są wyłączone, gdy `disableWorkflows` ma wartość `true` albo ustawiono `CLAUDE_CODE_DISABLE_WORKFLOWS=1`. |
| Otwierania pull requestów | CLI `gh`, zalogowane. Po twojej zgodzie fd3 uruchamia `gh pr create` dla każdego brancha. |
| Code review (opcjonalnie) | Plugin [code-review](/pl/plugins/code-review/) w wersji 0.4.0 lub nowszej. Ze starszą wersją review nie zwraca werdyktu, a branche zostają w `merged`. |

Tabela 1. Czego potrzebuje fd3

## Komendy

| Komenda | Argument | Kiedy jej użyć |
|---|---|---|
| `/fd3:build-spec` | Pomysł albo temat, albo ścieżka do planu | Chcesz sprawdzony spec. |
| `/fd3:build-spec` | Ścieżka do istniejącego specu | Spec zmienił się po werdykcie albo kod poszedł dalej. Wywiad jest pomijany. |
| `/fd3:grill-topic` | Temat, plan, decyzja albo pomysł | Chcesz sam wywiad. |
| `/fd3:split-to-tasks` | Ścieżka do specu | Ostatni werdykt specu to `ready`. |
| `/fd3:implement` | Ścieżka do katalogu zadań albo do katalogu z `tasks/` | Masz pliki zadań. Uruchom ponownie na tym samym katalogu, żeby wznowić. |

Tabela 2. Komendy i ich argumenty

`/fd3:implement-tasks` to skill, który wywołuje `/fd3:implement`, z tym samym argumentem.
Żadna komenda nie przyjmuje flag.

## Pliki, które zapisuje fd3

| Ścieżka | Zapisuje | Co to jest |
|---|---|---|
| `<spec>.md` | build-spec | Spec. Każdy przebieg walidacji dopisuje na końcu datowany blok dowodów i linię werdyktu. |
| `<spec>.session/` | build-spec | `notes.md` (potwierdzone decyzje), `question-ledger.md` i `research/`. `.gitignore` z `*` trzyma katalog poza gitem. |
| `evidence/<section>.md` | build-spec | Dowody za długie na komórkę tabeli, obok specu. |
| `tasks/NNNN-<slug>.md` | split-to-tasks | Jeden plik na zadanie, obok specu, chyba że wskażesz inny katalog. |
| `<spec>.split.md` | split-to-tasks | Tabela zadań, kolejność branchy per repozytorium, sprawdzenie pokrycia i to, co zostało po twojej stronie. |
| `implement-answers.md` | implement | Odpowiedzi z pierwszej paczki pytań, późniejsze decyzje, liczniki napraw i ścieżka ostatniego raportu, obok katalogu zadań. |
| `HIL_ACTIONS.md` | implement | Kroki dla ludzi w kolejności, obok katalogu zadań, zapisywane, gdy przebieg czeka na ludzi. |
| `<repo>.worktrees/<name>/` | implement | Worktree, tworzone obok repozytorium, nie w nim. |
| `<repo>.worktrees/.review/` | implement | Pliki robocze code-review i `cr-report.md` dla każdego brancha i przebiegu. |

Tabela 3. Pliki, które zapisuje fd3

Do napisania specu wywiad trzyma swoje pliki robocze w katalogu roboczym sesji.
Zapisanie specu przenosi je do `<spec>.session/`.

## Branche

- Jeden branch `task/<slug>` na zadanie, mergowany do brancha docelowego na końcu każdej fali.
- Branche docelowe z pól `branch` w plikach zadań, po jednym pull requeście na każdy.

Sprzątanie na końcu przebiegu usuwa worktree i zmergowane branche `task/<slug>`, po twojej zgodzie.
Branch zadania z commitami, których brakuje w branchu docelowym, nigdy nie jest usuwany.

## Pola pliku zadania

| Pole | Co zawiera |
|---|---|
| `name` | Nazwa, po której rozpoznajesz zadanie. |
| `status` | `todo`, `in-progress`, `implemented`, `merged`, `blocked` albo `done`. Po cięciu zawsze `todo`. |
| `spec` | Ścieżka względna do specu. |
| `elements` | Kody elementów, które zadanie buduje, na przykład `[DB-1, API-2]`. |
| `decisions` | Decyzje ze specu, które wiążą zadanie. |
| `repository` | Ścieżka bezwzględna checkoutu albo `none` dla zadania operacyjnego. |
| `branch` | Branch docelowy, wspólny dla wszystkich zadań jednostki wdrożenia. Pusty dla zadania operacyjnego. |
| `branch-base` | Baza stacka brancha, taka sama na każdym zadaniu brancha. |
| `merge-after` | Branche, których pull requesty muszą być zmergowane wcześniej, jako `<branch>` albo `<repository path>:<branch>`. |
| `worktree` | Puste, dopóki przebieg implementacji nie przejmie zadania. |
| `phase` | Faza rolloutu ze specu albo `cleanup`. |
| `depends-on` | Slugi zadań, które muszą wylądować wcześniej. |
| `tickets` | Identyfikatory ticketów, jeśli spec je ma. |

Tabela 4. Frontmatter pliku zadania

Treść ma trzy sekcje: `## Goal`, `## Done when` (wiersze weryfikacji ze specu, które zadanie musi przejść, po nazwie) i `## Where to look` (odnośniki do specu po kodzie elementu i sekcji).
Zadanie może kończyć się sekcją `## Note` z faktami o jego własnej pracy, na przykład wspólnym plikiem z zależności albo udzieloną zgodą.
Zadanie operacyjne zawsze ją ma i wyjaśnia w niej, dlaczego nie ma pull requesta.

## Następne kroki

- [Jak działa fd3](/pl/plugins/fd3/how-it-works/) objaśnia części i statusy zadań.
- [Wróć do przeglądu](/pl/plugins/fd3/).
