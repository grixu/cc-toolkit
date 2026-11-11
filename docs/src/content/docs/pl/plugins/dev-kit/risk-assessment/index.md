---
title: Etykieta ryzyka
description: Co znaczy etykieta ryzyka, którą pr-open dodaje do pull requesta, co pokazuje sekcja Risk, co opuszcza twój komputer i jak ją włączyć.
group: concepts
sidebar:
  label: Etykieta ryzyka
  order: 6
---

Reviewer, który otwiera pull request, nie pozna po tytule, jak uważnie go czytać.
[`/dev-kit:pr-open`](/pl/plugins/dev-kit/pr-open/) odpowiada na to, zanim reviewer otworzy diff.
Ocenia ryzyko brancha, gdy otwiera albo odświeża pull request, kończy opis sekcją **Risk** i dodaje etykietę, na przykład `risk: high`.

Ta strona wyjaśnia, co widzisz i jak włączyć etykietę.
[Jak liczony jest poziom ryzyka](/pl/plugins/dev-kit/risk-assessment/how-it-works/) wyjaśnia ocenę.
[Pewność, wyniki częściowe i awarie](/pl/plugins/dev-kit/risk-assessment/reliability/) wyjaśnia, kiedy ufać poziomowi mniej.

## Co znaczy poziom ryzyka

Poziom ryzyka to jedna z czterech wartości: `low`, `medium`, `high` albo `critical`.
Łączy dwa pytania o zmianę:

- **Wpływ (impact):** jeśli zmiana zawiera błąd, jak zły jest najgorszy skutek po wdrożeniu?
- **Prawdopodobieństwo (likelihood):** jak prawdopodobne jest, że zmiana zawiera błąd?

Duża zmiana nie jest z założenia ryzykowna.
Zmiana nazwy w setkach plików jest mechaniczna, więc jej prawdopodobieństwo zostaje niskie.
Dziesięć linii zmieniających, kto może czytać dane klientów, może dostać `high` albo `critical`.

| Poziom | Czego wymaga od reviewera |
|---|---|
| `low` | Błąd byłby nieszkodliwy albo kosmetyczny, albo zmiana jednej funkcji jest mechaniczna. Wystarczy szybka lektura. |
| `medium` | Błąd mógłby zepsuć jedną funkcję, albo mechaniczna edycja dotyka czegoś ważniejszego. Przeczytaj logikę. |
| `high` | Nietrywialna logika mogłaby zepsuć kluczowy przepływ, zawiła logika mogłaby zepsuć funkcję, albo mała edycja mogłaby wyrządzić poważną szkodę. Przejrzyj linia po linii i sprawdź, jak to przetestowano. |
| `critical` | Błąd mógłby ujawnić albo utracić dane, albo wywołać skutki, których revert nie cofnie, a logika nie jest trywialna. Poproś drugiego reviewera. |

Tabela 1. Cztery poziomy ryzyka

Poziom pochodzi z modelu, [Jev od TypeSafe](https://docs.typesafe.ai/introduction), więc traktuj go jako dowód, a nie werdykt.
`pr-open` cytuje go tak, jak go dostał, i nigdy go nie koryguje.

## Co widzisz na pull requeście

`pr-open` kończy opis sekcją **Risk** taką jak ta:

```markdown
## Risk

**high** · impact core · complexity interacting logic · confidence 0.61 · assessed by jev-1.14.0

- Changes a public contract

| Slice | Risk | Impact | Complexity | Evidence | What it does | Change types |
|---|---|---|---|---|---|---|
| Order export endpoint | **high** | core | interacting logic | api_dump missing | new_functionality | api_contract, data_access |
| Export docs | **low** | none | edits | — | new_functionality | documentation |
```

Czytaj ją od góry:

- **Pierwsza linia** podaje poziom całej zmiany, jej wpływ i złożoność oraz pewność modelu. `Low confidence.` na końcu tej linii znaczy, że poziom zasługuje na mniejszą wagę.
- **Punkty** to flagi ryzyka: bezpieczeństwo, trwałe dane, publiczne kontrakty, CI albo infrastruktura oraz logika bez testów. Flaga wskazuje, na co patrzeć. Nie ustala poziomu.
- **Tabela** ma jeden wiersz na slice, od najbardziej ryzykownego. Slice to jeden cel zmiany, na przykład funkcja, poprawka albo refaktor, razem z kodem, testami i dokumentacją.
- **Evidence** wymienia ręczny dowód, który pokazałby, że slice działa: wideo, zrzuty ekranu albo zapytanie i odpowiedź API (`api_dump`). Każdy jest oznaczony jako `provided` albo `missing`. `test gap` znaczy, że slice zmienia zachowanie i nie ma testu, choć dałoby się go napisać.
- **Linie pod tabelą** wymieniają reguły, które przesunęły poziom slice’a, na przykład „likelihood lowered one step: the description carries the manual evidence this low-stakes change needs”.

Etykieta podąża za poziomem.
Gdy odświeżenie zmienia poziom, `pr-open` zamienia starą etykietę na nową.

## Co opuszcza twój komputer

Ocena wysyła do API TypeSafe:

- diff brancha względem bazy, bez lockfile'ów, plików binarnych i innych plików, które narzędzie [pomija](/pl/plugins/dev-kit/risk-assessment/how-it-works/#krok-1-odczyt-diffu);
- opisy commitów;
- `context`, który przekazuje `pr-open`: tytuł i opis pull requesta oraz tytuł i opis podlinkowanego ticketu, jeśli je przeczytał;
- zasady testowania repozytorium, gdy `pr-open` znalazł je w `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING` albo w CI;
- krótkie fragmenty kodu, gdy wywołujący przekaże `execution_context`.

Gdy `pr-open` nie pogrupuje plików w slice’y sam, narzędzie prosi o to Claude Haiku, na twoim koncie Claude Code.
Haiku dostaje ścieżki plików, liczby linii, nagłówki hunków i opisy commitów, ale nie diff.

Bez klucza API TypeSafe nic nie jest wysyłane.
Narzędzie nie istnieje, a `pr-open` podaje `Risk: not assessed`.

## Włącz ją

Etykieta ryzyka wymaga Claude Code w wersji 2.1.287 lub nowszej, który ładuje moda pluginu, i klucza API [TypeSafe](https://docs.typesafe.ai/introduction).
Klucz ustawisz na jeden z dwóch sposobów:

- Wyeksportuj `TYPESAFE_API_KEY` w powłoce, z której uruchamiasz Claude Code.
- Albo uruchom `/plugin configure dev-kit@cc-toolkit` i wpisz go jako opcję **TypeSafe API key**. Claude Code przechowuje go w systemowym magazynie poświadczeń, a ma on pierwszeństwo przed zmienną.

Klucz ustawiony albo zmieniony w trakcie sesji zaczyna działać po `/reload-plugins`.
[Etykieta ryzyka: referencja](/pl/plugins/dev-kit/risk-assessment/reference/) wymienia pozostałe opcje, na przykład nazwę etykiety i wersję modelu.

Narzędzie stojące za etykietą to `pr_risk` (`mcp__dev-kit__pr_risk`).
Nie ma dla niego komendy: woła je `pr-open`, a Claude może je też wywołać, gdy zapytasz, jak ryzykowny jest branch.

## Popraw ocenę

- **Najpierw napisz opis.** Opis mówi modelowi, czemu ma służyć każdy slice, na przykład dodaniu funkcji albo naprawie błędu.
- **Dołącz ręczne dowody.** Zrzut ekranu, wideo, link do Looma albo zapytanie i odpowiedź w bloku kodu mogą obniżyć prawdopodobieństwo slice’a o niskiej stawce o jeden stopień. Nowe pull requesty rzadko je mają, więc po ich dołączeniu uruchom `pr-open` ponownie, żeby odświeżyć sekcję **Risk**.
- **Trzymaj testy obok kodu, który testują.** Plik testu w zmianie o pasującej nazwie liczy się jako test tego pliku.
- **Opisz zasady testowania** w `CLAUDE.md`, `AGENTS.md` albo `CONTRIBUTING`. Slice, którego twoje zasady nie każą testować, na przykład Terraform albo UI testowany tylko end-to-end, traci wtedy flagę „Logic without tests”.

## Następne kroki

- [Jak liczony jest poziom ryzyka](/pl/plugins/dev-kit/risk-assessment/how-it-works/): slice’y, zadawane pytania i reguły oceny.
- [Pewność, wyniki częściowe i awarie](/pl/plugins/dev-kit/risk-assessment/reliability/): co znaczy wynik częściowy albo o niskiej pewności.
- [Etykieta ryzyka: referencja](/pl/plugins/dev-kit/risk-assessment/reference/): opcje pluginu, wejścia narzędzia i pola wyniku.
