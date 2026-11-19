# fd4: cel i zasady

## Cel

fd4 to następca [fd3](../fd3/README.md). Prowadzi tę samą drogę od pomysłu do kodu (spec, zadania,
implementacja) i omija problemy, które pokazały prawdziwe przebiegi fd3.

Kształt wydania jest otwarty: nowy major fd3 albo dwa osobne pluginy. Decyzja zapada na końcu prac,
więc do tego czasu fd4 to nazwa robocza.

## Zasady nieprzekraczalne

1. **Każdy tekst dla agenta powstaje według skilla `writing-for-agents`.** Dotyczy skilli, komend,
   definicji agentów, promptów renderowanych przez workflowy i opisów, które agent czyta. Załaduj skill
   przed pisaniem i przed przeglądem takiego tekstu.
2. **Każde założenie o zachowaniu agenta ma ewaluację.** Przypuszczenie („agent pominie X”, „ta zmiana
   skróci Y”) staje się zasadą dopiero, gdy potwierdzi je ewaluacja: najpierw _red_ na obecnym
   zachowaniu, potem _green_ po zmianie. Ewaluacje mają być _tight_: wąskie, na kilku przypadkach,
   z wynikiem w minutach. Wynik i jego liczby zapisujemy przy decyzji, którą wspierają.
3. **Ewaluacje stoją na prawdziwych przebiegach fd3.** Materiał i jego obsługa są opisane w
   [`FD4_EVALUATION.md`](FD4_EVALUATION.md). Przypadek syntetyczny dokładamy tylko wtedy, gdy
   prawdziwe przebiegi danej gałęzi nie pokrywają.

## Problemy fd3, których unikamy

1. **Za duży SPEC.** SPEC jest zbyt szczegółowy i za długi.
2. **Drogie edycje SPEC.** Każda poprawka SPEC zajmuje dużo czasu i tokenów.
3. **Męczący grill.** Grillowanie trwa długo i męczy użytkownika.
4. **Rozmowa przez identyfikatory.** Agent odnosi się do numerów decyzji i kodów elementów speca,
   zamiast nazwać, o co chodzi.
5. **Rozdęty kontekst przy dużych zadaniach.** Spec dla dużego zakresu (np. całego epika) rozdyma
   kontekst sesji.
6. **Każde pytanie trafia do użytkownika.** Grill nie odróżnia pytań kluczowych od reszty. Kluczowe
   są decyzje, z których trudno się wycofać: architektoniczne, produktowe i dotyczące software
   designu. Resztę może rozstrzygnąć agent albo panel agentów, a użytkownik na końcu przegląda te
   rozstrzygnięcia i je zatwierdza.
7. **Brak TDD.** Implementacja nie pisze testów przed kodem, nawet gdy kod i setup projektu na to
   pozwalają.
8. **Za drobne zadania.** Każde zadanie to osobny subagent, worktree i walidacja, więc drobny podział
   mnoży ich liczbę.

## Wymagania

1. **SPEC zawiera listę kryteriów akceptacji (AC).** To niezbędne wejście dla pluginu
   [tester](../tester/README.md).
2. **Wymagania i założenia architektoniczne są spisane.** Gdy praca nie tworzy nowego ADR, zapisuje
   je SPEC.
3. **Pliki SPEC i zadań opisują kod, nie zawierają go.** Dozwolone są schematy, diagramy i krótki
   pseudokod.
4. **fd4 jest modem.** Wynika to z pomysłów 3 i 4: modele decyzyjne wołamy z kodu moda, a ustawienia
   użytkownika (np. nazwa słownika) mod dostaje z wypełnionymi wartościami domyślnymi.
5. **Zadania dzielimy na vertical slices.** Każde zadanie dowozi przekrój funkcjonalności przez
   wszystkie warstwy, których dotyka.
6. **Walidacja SPEC przechodzi przez zestaw soczewek.** Każda soczewka sprawdza jeden aspekt, jak w
   pluginie [code-review](../code-review/README.md).

## Nowe pomysły

1. **Szczegóły implementacji w zadaniach.** Podział na zadania przenosi szczegóły implementacyjne ze
   SPEC do plików zadań, więc poprawka dotyka mniejszego pliku.
2. **Poprawki po implementacji to zwykła edycja.** Zmiana SPEC lub zadań po implementacji to edycja
   plików, bez weryfikacji, którą przechodzi tworzenie.
3. **Model i effort zadania wybiera model decyzyjny.** Wynik trafia do pliku zadania, a implementacja
   uruchamia zadanie z tym modelem i effortem.
4. **Słownik domenowy powstaje razem ze SPEC.** Domyślnie w `GLOSSARY.md`; użytkownik może ustawić
   inną nazwę pliku.
5. **Format plików jest otwarty.** SPEC i zadania nie muszą być w markdownie; wybieramy format, który
   agent czyta najtaniej. Gdy nowy format zmieni postać AC, plugin tester dostaje jego obsługę.
6. **Doprecyzowanie wejścia zawęża research.** Agent doprecyzowuje pomysł, zadanie lub dane od
   użytkownika, gdy to zawęża stożek możliwości, a przez to zmniejsza ilość researchu. Pytania
   doprecyzowujące przechodzą ten sam podział co pytania grilla (problem 6): do użytkownika trafiają
   tylko kluczowe, a o tym, które są kluczowe, może rozstrzygać model decyzyjny.
7. **SPEC waliduje inny model niż ten, który go pisał.** Gdy dostępny jest inny harness i dostawca
   modeli, walidacja idzie do nich przez plugin [collegium](../collegium/README.md).
8. **Soczewki walidują też zadania.** Ten sam mechanizm co przy walidacji SPEC (wymaganie 6) sprawdza
   pliki zadań.

## Założenia

1. **Zadania mogą zależeć od siebie.** Powiązania między zadaniami zostają, jak w fd3.
2. **Wejście budowy SPEC.** Użytkownik podaje opis pomysłu, tickety z systemu typu Jira, pliki z
   własnym wcześniejszym researchem albo dowolne ich połączenie.
3. **Budowa SPEC ma trzy fazy:** grill, spisanie SPEC i jego walidacja.
4. **Zadania powstają ze zwalidowanego SPEC.** Opisują etapy jego implementacji.
