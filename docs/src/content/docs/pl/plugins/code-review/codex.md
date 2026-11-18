---
title: Uruchamianie w Codex CLI
description: Zainstaluj code-review w OpenAI Codex CLI, uruchom review przez $code-review:start-cr i zobacz, co działa tam inaczej.
group: reference
sidebar:
  label: Codex CLI
  order: 5
---

code-review instaluje się też w [OpenAI Codex CLI](https://github.com/openai/codex).
To jedyny plugin cc-toolkit, który to potrafi: Codex pokazuje też pozostałe pluginy z marketplace'u, ale nie są tam wspierane.
Review uruchamia te same soczewki i te same reguły co w Claude Code, z ograniczeniami opisanymi niżej.

## Instalacja

Plugin przetestowano na codex-cli 0.165.0 i potrzebuje tych samych `git` i `python3` co w Claude Code.
Z shella:

```sh
codex plugin marketplace add grixu/cc-toolkit   # --ref <branch> instaluje z brancha
codex plugin add code-review@cc-toolkit
codex plugin list                               # sprawdź, czy jest zainstalowany
```

Żeby pracować na lokalnym checkoucie cc-toolkit, dodaj jako marketplace jego ścieżkę.
Po edycji uruchom ponownie `codex plugin add code-review@cc-toolkit`, co odświeża zainstalowaną kopię, i zacznij nową sesję.

## Uruchom review

W Codeksie skill wywołuje się przez `$`, nie `/`:

```
$code-review:start-cr [--base <ref>] [--pr <n>] [--spec <path>]
```

Argumenty znaczą to samo co w [`/code-review:start-cr`](/pl/plugins/code-review/reference/#argumenty-start-cr).
`--pr` potrzebuje dostępu do sieci; zobacz [Ograniczenia](#ograniczenia).

`start-cr` uruchamia się tylko wtedy, gdy go wywołasz; Codex nie odpala go sam na podstawie prośby.
[Kroki bez interakcji](/pl/plugins/code-review/reference/#kroki-bez-interakcji) `$code-review:cr-prepare`, `cr-scan` i `cr-merge` też działają tylko po wywołaniu, dla workflowów, które nimi sterują.

## Jak to działa

Codex czyta ten sam `.claude-plugin/marketplace.json` co Claude Code.
Plik `.codex-plugin/plugin.json` pluginu kieruje Codeksa do `codex/skills/` zamiast do skilli Claude Code.

Każdy skill w tym katalogu to cienki adapter:

1. Znajduje katalog główny pluginu i czyta `codex/host.md`.
2. `host.md` tłumaczy mechanizmy Claude Code na odpowiedniki w Codeksie: katalog główny pluginu, `$ARGUMENTS`, nazwy narzędzi, pytania, subagentów, regułę, że z plików `.env` czyta się tylko nazwy kluczy, oraz commity w sandboksie.
3. Potem adapter wykonuje komendę albo skill z Claude Code bez zmian.

Reguły soczewek mają więc jedno źródło, a poprawka reguły trafia do obu środowisk.

## Ograniczenia

| Obszar | Co działa inaczej w Codeksie |
|---|---|
| Równoległe soczewki | Scannery działają jako subagenty Codeksa, więc soczewki idą falami. W multi-agent v1 naraz działa sześć; w v2 tyle, ile sesja ma slotów, minus jeden, domyślnie trzy. Wersję Codex wybiera pod model. Limit podniesiesz przez `agents.max_concurrent_threads_per_session` w `config.toml`. |
| Pytania | `request_user_input` jest niedostępne w trybie Default, więc pytania i menu poprawek przychodzą jako ponumerowane wiadomości w czacie. Odpowiedz w następnej wiadomości. |
| `codex exec` | Każde pytanie, w tym menu poprawek, zatrzymuje przebieg i nic, co od niego zależy, nie zostaje zastosowane. Odpowiedz przez `codex exec resume <id> "<odpowiedź>"`. `resume` nie przyjmuje `-C` ani `-s`; sandbox ustawisz przez `-c sandbox_mode=...`. |
| Commity | Sandbox `workspace-write` trzyma `.git` tylko do odczytu i blokuje socket gpg-agenta, więc tryb z commitem zatrzymuje się i pyta, zamiast commitować. |
| `--pr` | Potrzebuje sieci dla `gh` i `git fetch`, zapisywalnego `.git` oraz zapisywalnego katalogu obok repozytorium na worktree pull requesta. `workspace-write` nie daje żadnej z tych rzeczy, a ta ścieżka nie była testowana w Codeksie. |
| Narzędzia scannera | Codex nie ma listy narzędzi per agent, więc scanner dostaje pełny zestaw narzędzi Codeksa. To, że niczego nie edytuje, zależy wyłącznie od jego promptu. |
| `/security-review`, `/code-review` | Wbudowane komendy Claude Code nie istnieją w Codeksie i nigdy nie są proponowane. |
| Walk decision backend | To opcja pluginu w Claude Code, więc w Codeksie każda poprawka strukturalna idzie do pytania osobno. |

Tabela 1. Co działa inaczej w Codeksie

### Commity w sandboksie

Dodanie `<repo>/.git` do `sandbox_workspace_write.writable_roots` naprawia tylko `.git` tylko do odczytu; podpisane commity nadal się nie udają.
W interaktywnym przebiegu zatwierdź uruchomienie commita poza sandboksem, gdy Codex o to zapyta, albo wybierz **Leave uncommitted**.
Plugin nigdy nie wyłącza podpisywania commitów ani hooków.

### Sprawdzenie cudzego pull requesta

`start-cr` sprawdza przez `gh`, czy branch jest cudzym otwartym pull requestem.
Gdy sandbox blokuje to sprawdzenie, review mówi o tym w jednej linii, zamiast uznać, że pull requesta nie ma.
Przebieg interaktywny najpierw prosi o eskalację tej komendy.

## Koszt

Jeden pomiar (2026-10), jako orientacyjna liczba: pełne review zmiany w jednym pliku z dziesięcioma soczewkami trwało 3,5–4 minuty i zużyło około 5M tokenów wejściowych, z czego około 95% z cache'a, oraz 20k tokenów wyjściowych.
