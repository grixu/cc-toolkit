---
title: "Etykieta ryzyka: referencja"
description: Opcje pluginu dla etykiety ryzyka, wejścia narzędzia pr_risk i każde pole jego wyniku.
group: reference
sidebar:
  label: Etykieta ryzyka
  order: 9
---

Ta strona wymienia opcje pluginu, wejścia narzędzia `pr_risk` i pola jego wyniku. Co znaczą te wartości, wyjaśnia strona [Jak liczony jest poziom ryzyka](/pl/plugins/dev-kit/risk-assessment/how-it-works/).

## Opcje pluginu

Otwórz opcje przez `/plugin configure dev-kit@cc-toolkit`. Zmiana zaczyna działać po `/reload-plugins`.

| Opcja | Domyślnie | Co robi |
|---|---|---|
| `typesafe_api_key` | puste, czyta `TYPESAFE_API_KEY` | Klucz API TypeSafe. Bez niego narzędzie nie istnieje i nic nie jest wysyłane. |
| `typesafe_endpoint` | `https://api.typesafe.ai` | Bazowy URL API. Dopisywane jest do niego `/v1/systemone`. |
| `typesafe_model` | `jev-1.14.0` | Nazwa albo alias modelu. Przypnij wersję, żeby poziomy nie zmieniały się między wydaniami Jev. |
| `gemini_api_key` | puste, czyta `GEMINI_DECISIONS_API_KEY`, potem `GEMINI_API_KEY` | Klucz Gemini Developer API z dostępem do `gemini-decision-1`. Klucz Vertex AI nie działa: Decisions API istnieje tylko w Gemini Developer API. |
| `decision_backend` | `auto` | `auto` używa backendu, którego klucz jest ustawiony; przy obu kluczach `pr-open` pyta, którego użyć. `typesafe` albo `gemini` używa tego jednego. `both` uruchamia oba obok siebie. |
| `primary_backend` | `typesafe` | Przy obu backendach ten, którego poziom, flagi i etykieta się liczą. Poziom drugiego pojawia się obok. |
| `risk_label` | `true` | Czy `pr-open` dodaje etykietę do pull requesta. |
| `risk_label_name` | `risk: {level}` | Nazwa etykiety. `{level}` zamienia się w poziom. |
| `risk_levels` | `low`, `medium`, `high`, `critical` | Nazwy czterech poziomów, od najniższego do najwyższego. Każda liczba nazw inna niż cztery wraca do wartości domyślnej. |

Tabela 1. Opcje pluginu

## Wejścia narzędzia

Claude woła narzędzie jako `mcp__dev-kit__pr_risk`. `pr-open` woła je za ciebie, a Claude może je też wywołać, gdy zapytasz, jak ryzykowny jest branch. Nie ma dla niego komendy.

| Wejście | Wymagane | Co robi |
|---|---|---|
| `base` | tak | Branch, do którego trafi zmiana, na przykład `main`. Narzędzie liczy diff `origin/<base>...HEAD` albo `<base>...HEAD`, gdy nie ma brancha zdalnego. |
| `slices` | nie | Zmienione pliki pogrupowane według celu, każdy jako `{title, files}`. Bez tego pliki grupuje Claude Haiku. Zobacz [grupowanie plików w slice’y](/pl/plugins/dev-kit/risk-assessment/how-it-works/#krok-2-grupowanie-plików-w-slicey). |
| `context` | nie | Tytuły i opisy pull requesta i ticketu. Mówi Jev, czemu służy każdy slice, i to w nim narzędzie szuka ręcznych dowodów. Sekcja **Risk** napisana wcześniej przez `pr-open` jest usuwana przed wysłaniem. |
| `testing_policy` | nie | Zasady testowania repozytorium w kilku zdaniach. Rozstrzyga, czy slice bez testów łamie te zasady. |
| `execution_context` | nie | Do 8 wpisów z krótkimi, dokładnymi fragmentami kodu dla zmienionych plików, każdy sprawdzany względem pełnego ID commita bazy albo HEAD. Cała tablica mieści się w 8000 znaków. Dostaje je tylko zapytanie o diff pasującego slice’a. |
| `risk_policy` | nie | `calibrated-v1` (domyślnie) albo surowsze, niezwalidowane `evidence-v1`. Wpływa tylko na [fallback dwuosiowy](/pl/plugins/dev-kit/risk-assessment/reliability/#fallback-dwuosiowy). |
| `risk_experiment` | nie | `atomic-v1` dodaje pytania eksperymentalne, których odpowiedzi pojawiają się w `experimental`. Nie zmieniają poziomu. |
| `backend` | nie | `typesafe`, `gemini` albo `both`: odpowiedź użytkownika po wyniku `Backend choice needed:`. Nadpisuje `decision_backend`. |

Tabela 2. Wejścia narzędzia pr_risk

Wszystko w `context`, `testing_policy` i `execution_context` trafia do wybranego backendu, TypeSafe albo Google, razem z diffem i opisami commitów; przy `both` do każdego z nich.

## Wynik

Narzędzie zwraca JSON. Wynik zaczynający się od `Risk assessment unavailable:` znaczy, że oceny nie wykonano, a reszta tekstu podaje powód. Wynik zaczynający się od `Backend choice needed:` znaczy, że oba klucze są ustawione, a `decision_backend` ma wartość `auto`: nic nie wysłano, a wywołanie potrzebuje `backend`.

### Cała zmiana

| Pole | Co zawiera |
|---|---|
| `level` | Poziom ryzyka, jeden z czterech `risk_levels`. |
| `scorer` | `factors` albo `two-axis fallback`, gdy żadne zapytanie o czynniki nie odpowiedziało. |
| `impact.level`, `likelihood.level` | Najgorszy wpływ i najgorsze prawdopodobieństwo spośród slice’ów. |
| `complexity` | Najwyższa złożoność spośród slice’ów. |
| `evidence` | `needed`: typy ręcznych dowodów, które Jev uznaje za prawdopodobne. `provided`: te znalezione w `context`. `credited`: czy z ich powodu obniżono prawdopodobieństwo któregoś slice’a. |
| `adjustments` | Reguły, które przesunęły poziom, prostymi zdaniami. |
| `confidence`, `lowConfidence` | Zobacz [Pewność i `lowConfidence`](/pl/plugins/dev-kit/risk-assessment/reliability/#pewność-i-lowconfidence). |
| `intents` | Co robi zmiana, według zapytań o intencję. |
| `types` | Typy zmian znalezione w którymkolwiek slice’ie. |
| `flags` | Flagi ryzyka, każda jako `{key, label}`. |
| `slices` | Jeden wpis na slice, opisany niżej. |
| `label` | `enabled`, `name` etykiety dla tego poziomu i `all`, czyli wszystkie nazwy etykiet, żeby `pr-open` mógł usunąć starą. |
| `coverage` | Jak duża część zmiany została oceniona, opisane niżej. |
| `comparison` | Tylko przy obu backendach: po jednym wpisie na backend, najpierw główny, z polami `backend`, `model`, `level`, `impact`, `likelihood`, `complexity`, `confidence`, `lowConfidence`, `scorer` oraz `title`, `level`, `impact` i `complexity` każdego slice’a; albo `backend` i `error` dla tego, który zawiódł, a wynik drugiego obowiązuje. Każde porównanie jest też dopisywane do `~/.cache/dev-kit/compare.jsonl` z nazwą katalogu repozytorium, branchem, commitem i bazą, nigdy z diffem. |
| `backend`, `model`, `base`, `riskPolicy`, `slicing` | Backend (`typesafe` albo `gemini`) i model, który odpowiedział, ustalona baza, użyta polityka i skąd pochodzą slice’y (`caller`, `model` albo `size`). |

Tabela 3. Pola wyniku dla całej zmiany

### Każdy slice

Każdy wpis w `slices` zawiera `title`, `files`, `level`, `impact`, `likelihood`, `complexity`, `evidence`, `testGap`, `adjustments`, `intents`, `types` i `flags`. Slice, którego wszystkie zapytania o czynniki zawiodły, ma `factors: "missing"` i zachowuje `level`, `impact` i `likelihood` ze swojego zapytania o diff.

### Pokrycie

| Pole | Co zawiera |
|---|---|
| `requests` | Liczba wysłanych zapytań o diff. |
| `filesAssessed`, `filesNotAssessed` | Pliki przeczytane i pliki ponad limit zapytań. |
| `filesNotAssessedSample` | Do 20 plików, których nie oceniono. |
| `filesExcluded` | Lockfile'y, pliki binarne i inne pliki, które narzędzie [pomija](/pl/plugins/dev-kit/risk-assessment/how-it-works/#krok-1-odczyt-diffu). |
| `truncatedHunks` | Hunki przycięte, żeby zmieściły się w zapytaniu. |
| `factorsMissing` | Slice’y albo części podzielonego slice’a bez odpowiedzi o czynniki. |
| `partial` | Czy jakiś kod nie został przeczytany albo slice nie ma odpowiedzi o czynniki. |

Tabela 4. Pola pokrycia

## Typy zmian i flagi

Zapytanie o diff pyta o te typy zmian. Te w tabeli podnoszą flagę:

| Flaga | Podnoszona przez |
|---|---|
| Touches security | `authorization`, `authentication`, `secret_handling` |
| Changes persisted data | `schema_or_data_migration`, `data_removal_or_rewrite` |
| Changes a public contract | `api_contract` |
| Changes CI, infrastructure or deployment | `ci_cd_pipeline`, `cloud_infrastructure`, `runtime_environment` |
| Logic without tests | slice z kodem, który dodaje, zmienia albo naprawia zachowanie i nie ma testu |

Tabela 5. Flagi ryzyka i typy zmian, które je podnoszą

Pozostałe typy zmian opisują slice, nie podnosząc flagi:

- **Sygnały ryzyka:** `irreversible_external_effect`, `infrastructure_state_dependent`, `team_only_scope`, `data_access`, `dependency_added_or_removed`, `feature_flag_gated`, `ui_components`, `ui_interactions`, `build_and_dev_tooling`, `dependency_version_update`, `ai_assistant_instructions`.
- **Testy:** `unit_or_integration_tests`, `e2e_tests`, `performance_tests`, `infrastructure_tests`.
- **O czym jest duża część slice’a:** `observability`, `error_handling_and_validation`, `visual_styling`, `configuration`, `documentation`, `generated_artifacts`, `release_metadata`.

Intencje to `new_functionality`, `behavior_change`, `behavior_condition_change`, `bug_fix`, `refactor`, `rename_or_move` i `code_removal`.

## Etykiety

Gdy `risk_label` jest włączone, `pr-open` dodaje etykietę dla poziomu i usuwa każdą inną etykietę ryzyka, którą ma pull request. Brakującą etykietę tworzy raz i nigdy nie zmienia istniejącej.
