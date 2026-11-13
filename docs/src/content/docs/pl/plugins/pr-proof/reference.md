---
title: Dokumentacja referencyjna
description: Komendy, opcje, wejście i wyjście narzędzia proof_signals, format manifestu dowodów i pliki, które zapisuje pr-proof.
group: reference
sidebar:
  label: Referencja
  order: 6
---

## Komendy

```
/pr-proof:prepare-proof [base] [before]
/pr-proof:screenshot-proof [urls] [credentials] [files] [base] [before]
/pr-proof:terminal-proof terminal|api [urls] [credentials] [files] [base]
/pr-proof:walkthrough-video [feature, spec path or PR] [who watches and what they asked to see] [record-only]
```

| Argument | Znaczenie | Domyślnie |
|---|---|---|
| `base` | branch, do którego trafi zmiana | domyślny branch repozytorium |
| `before` | zrób też zrzuty ekranu „przed” z bazy | bez zrzutów „przed” |
| `urls` | URL działającej aplikacji; z `before` także URL stacka bazy | pyta, gdy go brakuje |
| `credentials` | gdzie leżą dane logowania użytkowników testowych, jako ścieżka albo źródło, nigdy wartość | pyta, gdy ich brakuje |
| `files` | pliki z diffu, których dotyczy dowód | wybrane z diffu |
| `terminal` albo `api` | tryb transkryptu i rodzaj wpisu w manifeście | wymagany |
| `record-only` | zgłoś wywołującemu ścieżkę zaakceptowanego wideo, zamiast kopiować je do `~/Downloads/` i dołączać do pull requesta | samodzielne dostarczenie |

Tabela 1. Argumenty. `prepare-proof` przekazuje `urls`, `credentials`, `files` i `base` skillom, które uruchamia.

Każdy skill poza `walkthrough-video` odmawia na domyślnym branchu albo przy odłączonym HEAD.

## Opcje

pr-proof pyta o nie, gdy włączasz plugin, a zmienisz je w `/config`.
Każda może zostać pusta.

| Opcja | Domyślnie | Co robi |
|---|---|---|
| `typesafe_api_key` | brak | Klucz API TypeSafe dla `proof_signals`, przechowywany jako sekret. Gdy opcja jest pusta, narzędzie czyta zmienną środowiskową `TYPESAFE_API_KEY`. |
| `typesafe_endpoint` | `https://api.typesafe.ai` | Bazowy URL API TypeSafe. |
| `typesafe_model` | `jev-1.14.0` | Nazwa albo alias modelu Jev, na przykład `jev-latest`. |
| `gemini_api_key` | brak | Klucz Gemini Developer API dla Gemini Decision (`gemini-decision-1`), przechowywany jako sekret. Gdy opcja jest pusta, narzędzie czyta `GEMINI_DECISIONS_API_KEY`, a potem `GEMINI_API_KEY`. |
| `decision_backend` | `auto` | `auto` używa backendu, którego klucz jest ustawiony, a przy obu kluczach `prepare-proof` pyta cię, którego użyć. `typesafe` albo `gemini` używa wskazanego. `both` odpytuje oba równolegle. |
| `primary_backend` | `typesafe` | Przy obu backendach ten, na którego sygnałach `prepare-proof` opiera plan; sygnały drugiego są pokazywane obok. |
| `screenshot_widths` | brak | Szerokości viewportu w pikselach, oddzielone przecinkami, na przykład `375,768,1440`. Gdy opcja jest pusta, skill używa breakpointów projektu albo 375, 768 i 1440, gdy projekt ich nie ma. |

Tabela 2. Opcje pluginu.

Bez klucza TypeSafe ani Gemini narzędzie `proof_signals` nie jest rejestrowane i nic nie opuszcza komputera.
Gdy `decision_backend` wskazuje backend bez klucza, narzędzie zwraca `Proof signals unavailable:` z nazwą brakującego klucza.

## Narzędzie `proof_signals`

`mcp__pr-proof__proof_signals` pyta model decyzyjny, jakich rodzajów dowodu potrzebuje zmiana.
Wywołuje je `prepare-proof`; ty go nie wywołujesz.

### Wejście

| Pole | Wymagane | Znaczenie |
|---|---|---|
| `base` | tak | branch, do którego trafi zmiana, na przykład `main` |
| `backend` | nie | `typesafe`, `gemini` albo `both`: twoja odpowiedź po wyniku `Backend choice needed`. Ma pierwszeństwo przed `decision_backend`. |

Tabela 3. Wejście narzędzia.

Narzędzie porównuje `origin/<base>...HEAD` albo `<base>...HEAD`, gdy origin nie ma takiego brancha.

### Co wysyła

- diffstat zakresu;
- listę zmienionych plików i ich diff, z dokumentacją wysyłaną osobno od kodu;
- żadnych opisów commitów.

Diffy lockfile'ów, zminifikowanych plików, source map, snapshotów, plików binarnych i plików w `dist/`, `build/`, `vendor/` i `node_modules/` są pomijane.
Diffstat nadal je wymienia.
Duży diff jest dzielony na maksymalnie osiem części, a część, którą model uzna za zbyt długą, jest dzielona na pół; reszta jest zgłaszana jako nieoceniona.

### Wyjście

Wynik to JSON:

```json
{
  "backend": "typesafe",
  "model": "jev-1.14.0",
  "signals": {
    "screenshots": { "signal": "suggest", "p": 0.91 },
    "video": { "signal": "uncertain", "p": 0.48 },
    "api": { "signal": "reject", "p": 0.04 },
    "terminal": { "signal": "reject", "p": 0.12 }
  },
  "noBehaviorChange": { "signal": "reject", "p": 0.03 },
  "suppressed": false,
  "coverage": { "parts": 1, "filesNotAssessed": 0, "filesExcluded": 1, "truncatedHunks": 0, "partial": false }
}
```

| Pole | Znaczenie |
|---|---|
| `backend`, `model` | kto odpowiedział |
| `signals` | dla każdego rodzaju prawdopodobieństwo `p`, że zmiana go wymaga, i sygnał: `suggest` od 0.7 w górę, `reject` od 0.3 w dół, `uncertain` pomiędzy |
| `noBehaviorChange` | sygnał, że zmiana nie zmienia zachowania programu |
| `suppressed` | `true`, gdy `noBehaviorChange` to `suggest`; zaplanowanie wbrew temu jakiegokolwiek rodzaju to odstępstwo |
| `coverage` | ile części wysłano, ile plików nie oceniono albo pominięto i ile hunków przycięto; `partial` to `true`, gdy cokolwiek zostało nieocenione |
| `comparison` | tylko przy obu backendach: jeden wpis na backend, z jego własnymi polami jak wyżej albo z `error` |

Tabela 4. Pola wyniku.

Przy kilku częściach rodzaj bierze najwyższe prawdopodobieństwo spośród części, a `noBehaviorChange` najniższe.
Dzięki temu jedna część z samą dokumentacją nie ukryje dowodu, którego potrzebuje inna część.

Przy obu backendach pola najwyższego poziomu należą do backendu głównego.
Gdy główny zawiedzie, a drugi odpowie, należą do drugiego.

Dwa inne wyniki są zwykłym tekstem:

- `Backend choice needed: …`, gdy ustawione są oba klucze, a `decision_backend` to `auto`. Nic nie zostało wysłane.
- `Proof signals unavailable: <reason>` przy każdej porażce, na przykład gdy nie ma brancha bazowego, klucz został odrzucony albo wyczerpał się limit zapytań.

### Log porównań

Przy obu backendach każde wywołanie dopisuje jedną linię JSON do `~/.cache/pr-proof/compare.jsonl`:

```json
{ "at": "2026-11-13T10:00:00.000Z", "repo": "shop", "branch": "feat/checkout", "head": "<sha>", "base": "origin/main", "results": [] }
```

`repo` to nazwa repozytorium z URL-a remote'a `origin`, tak jak w ścieżce manifestu.
`base` to ref, względem którego powstał diff, na przykład `origin/main`, a nie podana przez ciebie nazwa brancha.
`results` zawiera te same wpisy co `comparison`.
Log nigdy nie zawiera diffu.
Błąd zapisu logu nigdy nie odbiera ci sygnałów.

## Manifest dowodów

Każdy skill, który wytwarza dowód, zapisuje go w jednym pliku JSON na branch:

```
~/.cache/pr-proof/<repo>/<branch>/manifest.json
```

`<repo>` to nazwa repozytorium z URL-a remote'a `origin`, więc worktree jednego repozytorium dzielą manifest, a każdy `/` w nazwie brancha zamienia się w `%2F`.

```jsonc
{
  "version": 1,
  "head": "<full sha at the last write>",
  "base": "main",
  "entries": [
    {
      "kind": "screenshots",
      "claim": "The checkout summary shows the discount line.",
      "head": "<full sha when this entry was produced>",
      "files": ["src/checkout/Summary.tsx"],
      "media": [{ "path": "/abs/screenshots/checkout-375.png", "screen": "Checkout", "width": 375 }]
    },
    {
      "kind": "api",
      "claim": "GET /orders/:id returns the discount.",
      "head": "<full sha when this entry was produced>",
      "files": ["src/orders/routes.ts"],
      "transcript": "/abs/api.txt"
    }
  ]
}
```

| Pole | Znaczenie |
|---|---|
| `version` | `1`; `pr-open` ignoruje manifest z inną wersją i o tym informuje |
| `head` | commit przy ostatnim zapisie |
| `base` | branch bazowy, ustawiany przez skill, który tworzy manifest; kolejne skille go zachowują |
| `entries[].kind` | `video`, `screenshots`, `terminal` albo `api` |
| `entries[].claim` | jedno zdanie: co pokazuje ten dowód |
| `entries[].head` | commit, przy którym powstał wpis; według niego `pr-open` ocenia, czy wpis jest aktualny |
| `entries[].files` | pliki z diffu, których dotyczy dowód |
| `entries[].media` | obrazy albo wideo, każde z bezwzględną ścieżką `path`; zrzuty ekranu mają też `screen` i `width` |
| `entries[].transcript` | bezwzględna ścieżka transkryptu z terminala albo API |

Tabela 5. Pola manifestu. Wpis ma albo `media`, albo `transcript`.

Nowy wpis zastępuje wcześniejszy tego samego rodzaju, a pozostałe zostają.
Do manifestu trafia tylko dowód, który powstał i został zaakceptowany; porażka trafia do raportu skilla.
Pusta lista `entries` oznacza „dowód niepotrzebny”, a brak manifestu oznacza, że pr-proof nie był uruchamiany.

## Pliki, które zapisuje pr-proof

| Plik albo folder | Zawiera |
|---|---|
| `~/.cache/pr-proof/<repo>/<branch>/manifest.json` | manifest dowodów brancha |
| `~/.cache/pr-proof/<repo>/<branch>/screenshots/` | zaakceptowane zrzuty ekranu |
| `~/.cache/pr-proof/<repo>/<branch>/terminal.txt`, `api.txt` | zamaskowane i przejrzane transkrypty |
| `~/.cache/pr-proof/<repo>/<branch>/base-worktree/` | worktree bazy do zrzutów „przed”, usuwany po zatrzymaniu jego stacka |
| `~/.cache/pr-proof/compare.jsonl` | log porównań przy obu backendach |
| `~/.cache/walkthrough-video/<repo>/<feature-slug>/` | folder roboczy walkthrough, z wideo w `out/` |
| `~/Downloads/<ticket-or-PR>-<slug>.mp4` | kopia wideo dostarczona przez samodzielne uruchomienie walkthrough |

Tabela 6. Gdzie pr-proof zapisuje pliki. Nic nie trafia do repozytorium.
