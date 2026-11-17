---
title: Dokumentacja referencyjna
description: Wymagania, argument komendy, ustawienie wyłączające hook i pliki, które zapisuje codex-plan-improver.
group: reference
sidebar:
  order: 2
---

## Wymagania

| Wymaganie | Po co |
|---|---|
| [OpenAI Codex CLI](https://github.com/openai/codex), zalogowany przez `codex login` albo z kluczem API w zmiennej środowiskowej | Komenda uruchamia `codex exec` w każdej rundzie. |
| `jq` w `PATH` | Hook odczytuje ID sesji ze swojego wejścia i zapisuje odpowiedź przez `jq`. |
| `uuidgen` w `PATH` | Komenda tworzy krótkie ID review dla swoich plików tymczasowych. |
| Zapisywalny `/tmp` | Trafiają tam plan, każde review i plik flagi hooka. |

Tabela 1. Czego codex-plan-improver potrzebuje na twoim komputerze.

## Komenda

```
/codex-plan-improver:codex-review [model]
```

| Argument | Domyślnie | Działanie |
|---|---|---|
| `model` | `gpt-6.1-sol` | Model przekazywany do `codex exec -m`. Zadziała każda nazwa, którą przyjmuje twój Codex CLI. Ustawienie `model` w `~/.codex/config.toml` nie ma znaczenia. |

Tabela 2. Jedyny argument komendy.

Komenda zawsze uruchamia Codexa z `-s read-only`, więc Codex może czytać repozytorium, ale nie może zmieniać plików.
Review kończy się po pięciu rundach.
Żadnej z tych rzeczy nie da się skonfigurować.

## Zmienna środowiskowa

| Zmienna | Domyślnie | Działanie |
|---|---|---|
| `CC_TOOLKIT_CODEX_PLAN_REVIEW` | Nieustawiona (review włączone) | `1` albo `true` zostawia hook włączony. Każda inna wartość go wyłącza. Ręczna komenda działa dalej. |

Tabela 3. Ustawienie wyłączające automatyczne review.

## Hook

| Zdarzenie | Matcher | Timeout | Odpowiedź |
|---|---|---|---|
| `PreToolUse` | `ExitPlanMode` | 10 sekund | Naprzemiennie w obrębie sesji: odrzuca wyjście z powodem, który każe Claude’owi uruchomić review, a następne przepuszcza. |

Tabela 4. Hook przy wyjściu z trybu planowania.

## Zapisywane pliki

| Plik | Kto zapisuje | Kiedy znika |
|---|---|---|
| `/tmp/claude-plan-<id>.md` | Komenda: plan, nadpisywany po każdej poprawce | Na końcu review |
| `/tmp/codex-review-<id>.md` | Komenda: review Codexa z pierwszej rundy | Na końcu review |
| `/tmp/codex-plan-reviewed-<session_id>` | Hook: znacznik, że poprosił o review | Przy następnym `ExitPlanMode` w tej samej sesji |

Tabela 5. Pliki tymczasowe. `<id>` to osiem znaków z `uuidgen`, więc równoległe sesje nie nadpisują sobie plików.

Kolejne rundy wznawiają sesję Codexa i czytają odpowiedź z wyjścia komendy, a nie z pliku.
