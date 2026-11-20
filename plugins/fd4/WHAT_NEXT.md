# fd4: co dalej

Ustalenia dla etapów po podziale na zadania: implementacji i tego, co po niej. [`GOAL.md`](GOAL.md)
obejmuje drogę do zadań; tutaj odkładamy to, co ustalimy, gdy przyjdzie kolej na implementację.

## Implementacja

1. **fd4 zachowuje walidację implementacji z fd3.** W prawdziwych przebiegach działała: 4 defekty,
   które przeszły walidację SPEC, wyłapało CI przed scaleniem (baseline, metryka m12). Zostają:
   - toolchain-scout, który ustala komendy walidacji repozytorium i sprawdza je ponownie, gdy gałąź
     zmienia konfigurację CI;
   - baseline na czystej bazie, żeby odróżnić istniejące wcześniej błędy;
   - bramka CI na każdej gałęzi z ograniczoną liczbą rund poprawek;
   - kontrola wiarygodności werdyktu CI: właściwa gałąź, czyste drzewo, każda komenda skończona;
   - końcowa bramka po tym, jak poprawki przesunęły HEAD;
   - przegląd kodu soczewkami;
   - sprawdzenie, czy naprawa robi to, co zdecydował użytkownik, i nic więcej.
2. **Decyzje o naprawach waliduje inny model.** Pomysł 7 z `GOAL.md` obejmuje też decyzje o
   naprawach po przeglądzie, nie tylko SPEC i zadania.
3. **Implementacja uruchamia testy przed kodem.** Problem 7 z `GOAL.md` ma w fd3 przyczynę w
   prompcie implementacji: od 0.5.2 zabrania on uruchamiania testów, lintów i buildów („Do not run
   linters, test suites or builds”), więc test na czerwono jest niemożliwy z założenia. W baseline
   (metryka m7) tylko 1 ze 136 agentów implementacji uruchomił test, zanim napisał kod. Agent
   implementacji fd4 zaczyna od scenariuszy z pliku zadania (wymaganie 8): pisze test, uruchamia go
   na czerwono, potem pisze kod, gdy repozytorium ma komendę testów.
