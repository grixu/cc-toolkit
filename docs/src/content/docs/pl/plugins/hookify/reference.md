---
title: Dokumentacja
description: Format pliku reguły, miejsca, z których hookify czyta reguły, zdarzenia i pola, które reguła może dopasować, oraz komendy list, configure i help.
group: reference
sidebar:
  order: 4
---

Ta strona opisuje, jak hookify czyta i stosuje pliki reguł.
Zacznij od [`/hookify:hookify`](/pl/plugins/hookify/hookify/), żeby utworzyć regułę, a tu wróć, gdy reguła zachowuje się inaczej, niż oczekujesz.

## Plik reguły

Reguła to plik Markdown.
Frontmatter YAML mówi, kiedy reguła się uruchamia, a treść to komunikat.

| Klucz | Znaczenie | Domyślnie |
|---|---|---|
| `name` | Identyfikator reguły, widoczny w komunikatach i używany do nadpisywania | `unnamed` |
| `enabled` | `true` albo `false`. Każda inna wartość oznacza włączoną regułę | `true` |
| `event` | `bash`, `file`, `prompt`, `stop` albo `all` | `all` |
| `action` | `block` zatrzymuje akcję. Wszystko inne to ostrzeżenie | `warn` |
| `pattern` | Skrót dla jednego warunku `regex_match` na głównym polu zdarzenia | brak |
| `conditions` | Lista `field`, `operator` i `pattern`. Wszystkie muszą pasować. Gdy lista ma elementy, `pattern` jest ignorowany | brak |
| `tool_matcher` | Dokładne nazwy narzędzi rozdzielone `\|`, na przykład `Edit\|Write`, albo `*` dla każdego narzędzia. Sprawdzany przed warunkami | brak |

Tabela 1. Klucze frontmattera.

Reguła bez `pattern` i bez `conditions` nigdy się nie uruchamia.
Reguły bez `name` dostają nazwę `unnamed`, więc wczytuje się tylko pierwsza z nich.

## Gdzie są reguły

hookify czyta reguły z trzech miejsc, od najwyższego priorytetu:

| Plik | Dotyczy | Commitować? |
|---|---|---|
| `<project>/.claude/hookify.<name>.local.md` | Ciebie, w tym projekcie | Nie. Dodaj `.claude/*.local.md` do `.gitignore` |
| `<project>/.claude/hookify.<name>.rule.md` | Wszystkich pracujących nad projektem | Tak |
| `~/.claude/hookify.<name>.local.md` | Ciebie, we wszystkich projektach | Nie w repozytorium projektu |

Tabela 2. Miejsca reguł, od najwyższego priorytetu.

W każdym miejscu pliki wczytują się alfabetycznie.
Wygrywa pierwsza reguła, która zajmie dany `name`, a kolejne o tej samej nazwie są pomijane.
Wyłączona reguła też zajmuje swoją nazwę.
Żeby wyłączyć regułę zespołową tylko u siebie, utwórz plik `.local.md` z tym samym `name` i `enabled: false`.

hookify ignoruje pliki bez prefiksu `hookify.` albo bez końcówki `.local.md` lub `.rule.md`.
Nie czyta plików `.rule.md` z `~/.claude/`.
Folder projektu to katalog, w którym Claude Code uruchamia hook, zwykle ten, w którym uruchomiono Claude Code, a nie korzeń repozytorium git.
hookify czyta wszystkie pliki reguł od nowa przy każdym wywołaniu hooka, więc zmiany działają od razu.

## Zdarzenia

Każda wartość `event` uruchamia się w innym momencie:

| Zdarzenie | Kiedy | Główne pole dla `pattern` | Co robi `block` |
|---|---|---|---|
| `bash` | Claude uruchamia komendę Bash | `command` | Odrzuca komendę |
| `file` | Claude wywołuje Edit, Write albo MultiEdit | `new_text`, czyli zapisywany tekst | Odrzuca edycję |
| `prompt` | Wysyłasz prompt | `prompt` | Pokazuje komunikat. Prompt i tak przechodzi |
| `stop` | Claude kończy turę | brak: użyj `conditions` na `transcript` | Claude pracuje dalej, z twoim komunikatem jako powodem |
| `all` | Każde z powyższych | `content`, tylko przy edycji plików | To samo co pasujące zdarzenie |

Tabela 3. Zdarzenia.

Dla narzędzi innych niż Bash, Edit, Write i MultiEdit hookify sprawdza reguły `bash`, `file` i `all`.
Dlatego reguła `file` z jedynym warunkiem na `file_path` uruchamia się też wtedy, gdy Claude czyta ten plik.
Dodaj `tool_matcher: Edit|Write|MultiEdit`, żeby ograniczyć ją do edycji.

## Pola

`field` w warunku może być:

- **Dowolnym kluczem wejścia narzędzia**, tak jak wysyła je Claude Code, na przykład `command`, `file_path`, `content`, `new_string` albo `url`.
- **`transcript`:** pełną treścią pliku z transkryptem sesji. Puste, gdy pliku nie da się odczytać.
- **`prompt` albo aliasem `user_prompt`:** wysłanym promptem, tylko przy wysyłaniu promptu.
- **Aliasem**, który czyta to samo w różnych narzędziach plikowych:

| Pole | Bash | Edit | Write | MultiEdit |
|---|---|---|---|---|
| `command` | komenda | | | |
| `file_path` | | ścieżka | ścieżka | ścieżka |
| `new_text`, `content` | | `new_string` | `content` | `new_string` każdej edycji, połączone spacjami |
| `new_string` | | `new_string` | `content` | niedostępne |
| `old_text`, `old_string` | | `old_string` | puste | niedostępne |

Tabela 4. Aliasy pól dla każdego narzędzia.

Gdy pole niczego nie zwraca, warunek nie pasuje.
Dotyczy to też `not_contains`: brakujące pole nie liczy się jako „nie zawiera”.

## Operatory

| Operator | Pasuje, gdy | Wielkość liter |
|---|---|---|
| `regex_match` | Wyrażenie regularne Pythona pasuje w dowolnym miejscu pola | Ignorowana |
| `contains` | Pole zawiera tekst | Rozróżniana |
| `not_contains` | Pole nie zawiera tekstu | Rozróżniana |
| `equals` | Pole jest dokładnie równe tekstowi | Rozróżniana |
| `starts_with` | Pole zaczyna się od tekstu | Rozróżniana |
| `ends_with` | Pole kończy się tekstem | Rozróżniana |

Tabela 5. Operatory.

Domyślny `operator` to `regex_match`.
Nieznany operator albo błędne wyrażenie regularne nigdy nie pasuje.

Tylko `regex_match` rozumie `|`.
`not_contains` z `npm test|pytest` szuka dokładnie tego napisu.
Żeby wymagać, by nie uruchomiono żadnej z kilku komend, użyj negatywnego lookahead, jak w `examples/require-tests-stop.local.md`:

```markdown
---
name: require-tests-run
enabled: false
event: stop
action: block
conditions:
  - field: transcript
    operator: regex_match
    pattern: ^(?![\s\S]*"command":\s*"[^"]*(npm test|pytest|cargo test))
---

**Tests not detected in transcript!**
```

Listing 1. Reguła stop, która każe Claude’owi pracować, dopóki nie uruchomi testów

Reguła jest dostarczana jako wyłączona.
Dopóki pasuje, Claude pracuje dalej, aż Claude Code zakończy turę po ośmiu wymuszonych kontynuacjach z rzędu.

## Co robi dopasowanie

| Hook | `warn` | `block` |
|---|---|---|
| Przed wywołaniem narzędzia | Claude Code pokazuje komunikat, a narzędzie się wykonuje | Wywołanie jest odrzucone. Claude dostaje komunikaty blokujących reguł jako powód, a ty widzisz `Hookify: Blocked operation by rule: <names>` |
| Po wywołaniu narzędzia | Claude Code pokazuje komunikat | Widzisz `Hookify: Blocked operation by rule: <names>`, ale narzędzie już się wykonało, więc nic nie jest cofane |
| Stop | Claude Code pokazuje komunikat, a Claude kończy | Claude pracuje dalej, z komunikatami jako powodem |
| Wysłanie promptu | Claude Code pokazuje komunikat | To samo co `warn`: prompt nie jest blokowany |

Tabela 6. Co robi pasująca reguła w każdym hooku.

Gdy pasuje kilka reguł, wygrywa każde `block` i wysyłane są tylko komunikaty reguł blokujących.
W przeciwnym razie wszystkie ostrzeżenia są łączone, każde z nazwą reguły w nagłówku.
Reguły `bash` i `file` działają przed narzędziem i po nim, więc ostrzeżenie może pojawić się dwa razy.

## Wzorce i cudzysłowy

hookify używa własnego, małego parsera frontmattera, a nie pełnej biblioteki YAML.

- Pisz wzorce bez cudzysłowów: `pattern: \s+` to wyrażenie regularne `\s+`.
- W podwójnych cudzysłowach `\\` zamienia się w `\`, a `\"` w `"`. Inne sekwencje, takie jak `\s`, zostają bez zmian.
- W pojedynczych cudzysłowach `''` zamienia się w `'`, a ukośniki wsteczne zostają.
- `#` po wartości jest częścią wartości, a nie komentarzem.
- Jeśli pierwsza linia elementu listy zawiera przecinek, parser czyta ją jako `key: value, key: value`. Wyrażenie regularne z przecinkami umieść we wciętej linii pod linią z `-`.
- Frontmatter musi być na samym początku pliku i nie może nigdzie indziej zawierać `---`.

Ten przykład z `examples/coding-standards.rule.md` używa podwójnych cudzysłowów, więc każdy ukośnik wsteczny jest podwojony:

```markdown
---
name: warn-typescript-any
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.tsx?$
  - field: new_text
    operator: regex_match
    pattern: ":\\s*any\\b|<any>"
---

**TypeScript `any` type detected!**
```

Listing 2. Reguła file z dwoma warunkami

## Przykładowe reguły

Plugin dostarcza te reguły w `examples/`.
Skopiuj jedną do `.claude/`, żeby jej użyć:

| Plik | Reguła | Co robi |
|---|---|---|
| `dangerous-rm.rule.md`, `dangerous-rm.local.md` | `block-dangerous-rm` | Blokuje komendy Bash pasujące do `rm\s+-rf` |
| `console-log-warning.local.md` | `warn-console-log` | Ostrzega, gdy edycja dodaje `console.log(` |
| `sensitive-files-warning.local.md` | `warn-sensitive-files` | Ostrzega, gdy Claude edytuje albo czyta pliki `.env` i ścieżki zawierające `credentials` albo `secrets` |
| `coding-standards.rule.md` | `warn-typescript-any` | Ostrzega, gdy edycja TypeScriptu dodaje typ `any` |
| `require-tests-stop.local.md` | `require-tests-run` | Wyłączona. Blokuje zakończenie, dopóki transkrypt nie pokaże `npm test`, `pytest` albo `cargo test` |

Tabela 7. Przykładowe reguły w pluginie.

## Komendy

### `/hookify:list`

Wypisuje wszystkie reguły z trzech miejsc w tabeli z nazwą, stanem, zdarzeniem, źródłem i plikiem.
Dla każdej reguły pokazuje wzorzec i początek komunikatu, a na koniec liczbę reguł włączonych i wyłączonych.

### `/hookify:configure`

Wypisuje twoje reguły z ich obecnym stanem i pozwala wybrać te do przełączenia.
W każdej wybranej regule zmienia w pliku `enabled: true` na `enabled: false` albo odwrotnie.
Zmienia tylko linię `enabled`.

### `/hookify:help`

Wyjaśnia w Claude Code, jak działa hookify, gdzie są reguły i jak napisać wzorzec.
Pokazuje tylko prostą postać z `pattern` i nie wymienia `/hookify:review-changes`, więc `conditions` i `tool_matcher` sprawdzaj na tej stronie.

Żeby edytować albo usunąć regułę, edytuj albo usuń jej plik. Nie ma do tego komendy.

## Wymagania i ograniczenia

- hookify potrzebuje Pythona 3.9 lub nowszego, dostępnego jako `python3` w `PATH`.
- Przy błędzie niczego nie blokuje: jeśli brakuje Pythona albo hook się wywróci, akcja się wykonuje, a Claude Code pokazuje komunikat `Hookify error`.
- Plik reguły bez poprawnego frontmattera jest pomijany. Ostrzeżenie pojawia się tylko w logu debug Claude Code.
- Każde wywołanie narzędzia dwa razy uruchamia Pythona i czyta wszystkie pliki reguł. Każde uruchomienie ma limit 10 sekund, po którym Claude Code działa dalej bez odpowiedzi hookify.

## Następne kroki

- [Utwórz regułę przez `/hookify:hookify`](/pl/plugins/hookify/hookify/).
- [Sprawdź zmiany z regułami](/pl/plugins/hookify/review-changes/).
