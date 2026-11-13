---
title: Pewność, wyniki częściowe i awarie
description: Kiedy ufać poziomowi ryzyka mniej i co się dzieje, gdy części zmiany nie da się ocenić.
group: concepts
sidebar:
  label: Pewność i awarie
  order: 8
---

Poziom ryzyka jest tak dobry, jak to, co model zobaczył i na co odpowiedział. Ta strona wyjaśnia sygnały, że poziom zasługuje na mniejszą wagę. Wyjaśnia też, co się dzieje, gdy części zmiany nie da się odczytać albo Jev nie odpowiada. Zakłada, że znasz kroki z [Jak liczony jest poziom ryzyka](/pl/plugins/dev-kit/risk-assessment/how-it-works/).

## Pewność i `lowConfidence`

`confidence` to własna pewność Jev co do odpowiedzi o wpływ i prawdopodobieństwo dla najbardziej ryzykownego slice’a, według zapytań o diff. To niższa z tych dwóch wartości, od 0 do 1.

Wynik ustawia `lowConfidence`, gdy pewność jest poniżej 0,5 albo gdy ocena jest częściowa. `pr-open` dopisuje wtedy `Low confidence.` do pierwszej linii sekcji **Risk**.

Poziom o niskiej pewności nie jest z założenia błędny. Sprawdź go z diffem, zamiast na nim polegać.

## Oceny częściowe

Ocena jest częściowa, gdy części kodu nie przeczytano albo slice nie dostał odpowiedzi o czynniki. Wynik ustawia `coverage.partial`, a sekcja **Risk** dodaje linię taką jak `Partial assessment: 12 files and 3 cut hunks were not assessed.`

Narzędzie mieści dużą zmianę w rozmiarze zapytania do Jev na kilka sposobów:

- Slice za duży na jedno zapytanie jest dzielony według plików, a duży plik według hunków.
- Zapytanie, które Jev nadal odrzuca jako za długie, jest dzielone na pół i wysyłane ponownie, do trzech razy.
- Slice podzielony na kilka zapytań bierze ryzyko swojej najbardziej ryzykownej części i każdy typ zmiany, który znalazła którakolwiek część.
- Cała zmiana jest pakowana w najwyżej 32 zapytania o diff, zanim cokolwiek zostanie podzielone na pół. Pliki ponad ten limit nie są oceniane, a wynik wymienia do 20 z nich w `coverage.filesNotAssessedSample`.

Nie każde przycięcie czyni ocenę częściową. Dokumentacja i pliki danych w ścieżkach testów są przycinane do rozmiaru jednego zapytania, a przycięcie w nich zostawia cały kod ocenionym.

## Gdy Jev nie odpowiada

Co się dzieje, zależy od tego, które zapytanie zawiedzie:

| Nieudane zapytanie | Wynik |
|---|---|
| Zapytanie o diff albo o intencję | Ocena jest niedostępna. `pr-open` otwiera pull request bez sekcji **Risk** i bez etykiety i podaje powód w raporcie. |
| Zapytania o czynniki jednego slice’a | Slice zachowuje poziom ze swojego zapytania o diff i pokazuje `factors: "missing"`. Poziom zmiany nie spada poniżej poziomu tego slice’a. Ocena jest częściowa. |
| Wszystkie zapytania o czynniki | Poziom pochodzi z samych zapytań o diff, a `scorer` ma wartość `"two-axis fallback"`. |
| Zapytanie o politykę | Flaga „Logic without tests” zostaje. |
| Grupowanie przez Haiku | Diff jest pakowany według rozmiaru i oceniany jako jedna zmiana bez podziału. `slicing.reason` mówi dlaczego. |

Tabela 1. Co nieudane zapytanie robi z wynikiem

Slice liczy się jako brakujący dopiero wtedy, gdy zawiodły oba powtórzenia jego zapytań o czynniki. Jedno powtórzenie z odpowiedzią wystarcza do oceny.

Fallback istnieje po to, żeby awaria Jev nigdy nie oczyściła pull requesta. Slice bez odpowiedzi o czynniki nie dodawałby inaczej ryzyka, a zmiana mogłaby dostać poziom niższy niż jej rzeczywiste ryzyko.

### Fallback dwuosiowy

Bez odpowiedzi o czynniki poziom wynika z własnych odpowiedzi zapytania o diff na pytania o wpływ i prawdopodobieństwo, przez tę samą [macierz ryzyka](/pl/plugins/dev-kit/risk-assessment/how-it-works/#macierz-ryzyka). Reguły wag korygują je potem typami zmian z tego samego zapytania:

- Zmiana tego, co system wysyła na zewnątrz, na przykład wiadomości albo płatności, podnosi wpływ do severe.
- Zmiana bezpieczeństwa albo trwałych danych podnosi wpływ do severe, gdy Jev daje poważnemu skutkowi prawdopodobieństwo co najmniej 0,3.
- Zmiana zachowania podnosi wpływ co najmniej do feature, albo do minor dla zmiany, która zmienia tylko wygląd ekranu.
- Slice, który tylko przerabia albo naprawia kod interfejsu użytkownika i nie dodaje ani nie zmienia zachowania, ogranicza wpływ do minor.
- Infrastruktura, która przechowuje dane albo obsługuje ruch, podnosi wpływ do core, a prawdopodobieństwo do non-trivial.
- Zmiana, która sięga tylko lokalnego środowiska zespołu, reguł agenta albo alertów, ogranicza wpływ do minor. Ograniczenie nie działa, gdy slice dotyka sekretów, uwierzytelniania, autoryzacji albo efektów zewnętrznych, albo gdy Jev ocenia go jako severe.
- Podbicie zależności o wersję major podnosi prawdopodobieństwo do non-trivial.
- Sama zmiana nazwy albo przeniesienie ogranicza prawdopodobieństwo do simple, a slice złożony z samej dokumentacji jest ograniczony do wpływu minor i prawdopodobieństwa simple.

Wejście `risk_policy` zmienia tylko te reguły. Domyślne `calibrated-v1` zachowuje je wszystkie. Eksperymentalne `evidence-v1` usuwa obniżenia: reguły dla UI, zmiany nazwy, samej dokumentacji i wersji major, i zawęża ograniczenie dla zmian sięgających tylko zespołu.

## Czego ocena nie robi

- Nie uruchamia twojego kodu ani testów. Czyta diff.
- Nie czyta kodu spoza diffu, chyba że wywołujący przekaże krótkie fragmenty jako `execution_context`. Zmiana, której ryzyko leży w tym, jak woła ją inny kod, może dostać za niski poziom.
- Nie zna twojego ruchu, użytkowników ani procesu wdrożenia. „Kluczowy przepływ” to odczytanie kodu przez Jev.
- Nie robi review zmiany. Niski poziom mówi, że błąd kosztowałby mało albo jest mało prawdopodobny, a nie że zmiana jest poprawna.

## Jak oceniany jest scorer

Scorer czynników jest mierzony na pull requestach, którym ludzie nadali poziom ryzyka. Oznaczone dane pochodzą z prywatnych repozytoriów, więc nie ma ich w tym repozytorium. Skrypty ewaluacji są w `plugins/dev-kit/evals/pr-risk/`. Ich [README](https://github.com/grixu/cc-toolkit/blob/main/plugins/dev-kit/evals/pr-risk/README.md) wyjaśnia metrykę i sposób uruchamiania ewaluacji.

## Następne kroki

- [Etykieta ryzyka: referencja](/pl/plugins/dev-kit/risk-assessment/reference/): każde pole wyniku, łącznie z `coverage`.
- [Etykieta ryzyka](/pl/plugins/dev-kit/risk-assessment/): co pokazuje sekcja **Risk**.
