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
