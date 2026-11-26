# fd3 real-runs: materiały do ewaluacji

**Co to jest:** 7 prawdziwych przebiegów fd3 w wersjach 0.5.0–0.5.3, każdy przez etapy build-spec, split-to-tasks i
implement. Dwa przypadki są z Bizwave (mailer, calendar-api), pięć z console-monorepo (user-flags,
response-body-stripping, nested-fields, impersonation, responses-api). Razem to 29 sesji, 160 zadań i 8 snapshotów
repo. Dane zebrane 18.11.2026, sesje poprawek user-flags i nested-fields dołożone 19.11.2026. 26.11.2026 doszły dwa
przypadki, w których zadania użytkownika blokowały start implementacji: panel ról w console-monorepo (fd3 0.3.0) i
agent-deck (0.5.2). Razem 9 przypadków.

**Gdzie leżą:**
- **R2:** bucket z sekretu `R2_BUCKET`, tarball `fd3/real-runs/<sha256>.tar.gz` (ok. 410 MB).
- **Przypięcie w git:** `plugins/fd3/evals/real-runs/eval-data.json`, wskazuje sha256 aktualnego tarballa.
- **Lokalnie:** `plugins/fd3/evals/real-runs/local/` (ok. 1,2 GB), folder ignorowany przez git.

**Obsługa:**

```sh
pnpm eval:data pull fd3/real-runs   # pobiera i weryfikuje dane
pnpm eval:data push fd3/real-runs   # wysyła nową wersję; potem zacommituj przypięcie
```

Klucze R2 są brane z `.r2-secrets.sh`. Gdy pliku brakuje, utworzysz go z 1Password przez
`bash scripts/r2-secrets-init.sh`.

**Struktura `local/`:**

```
README.md                     tabela przypadków, zastrzeżenia, jak przebudować
cases.jsonl                   1 wiersz na przypadek × etap: wejście, wyjście, sesje
cases/<case>/
  manifest.json               repo, ścieżka speca, sesje per etap, commity, baza
  sessions/<etap>-<id>/
    conversation.json         tury, pytania i odpowiedzi z grilla
    file-ops.json             wszystkie Write/Edit na plikach speca
    written/                  pliki odtworzone z tych zapisów (split: zadania)
    spec-as-read.md           SPEC w wersji, którą czytała sesja (split: wejście)
  git/<n>-<data>-<sha>/       pliki speca przy każdym commicie, który je zmienił
  disk/                       kopie z dysku z dnia zebrania
repos/<repo>@<sha>.tar.gz     snapshot repo na commicie bazowym
transcripts/<session-id>/     pełny transkrypt i subagenci, bez zmian
scripts/                      kolektor (collect, snapshot, index) i cases.json
```

## Baseline: problemy fd3 zmierzone na tych przebiegach

**Gdzie leży:**
- **R2:** tarball `fd4/baseline/<sha256>.tar.gz`, przypięty w `plugins/fd4/evals/baseline/eval-data.json`.
- **Lokalnie:** `plugins/fd4/evals/baseline/local/fd3/`, folder ignorowany przez git.

```sh
pnpm eval:data pull fd4/baseline
pnpm eval:data push fd4/baseline    # potem zacommituj przypięcie
```

Skrypty czytają dane z `plugins/fd3/evals/real-runs/local/`, podanej jako pierwszy argument; komendy są w `RUNS.md`,
pełny blok w sekcji „Re-running on fd4” w `REPORT.md`.

```
REPORT.md                     wyniki, metoda, pytania otwarte, jak puścić na fd4
m*.mjs, phases.mjs, …         skrypty metryk; RUNS.md: komendy uruchomień
out/                          surowe liczby i tables.md, regenerowane przy każdym uruchomieniu
labels/                       etykiety (problem 6: pytania grilla, problem 9: kroki ręczne), nie nadpisywać
```

**Zastrzeżenia:**
- Zadania responses-api i impersonation istnieją tylko jako odtworzone z transkryptów.
- W calendar 3 zadaniom brakuje jednej edycji.
- Transkrypty mogą zawierać sekrety, więc dane trzymamy wyłącznie w prywatnym buckecie.

## Progi sukcesu

Próg to mediana na tych samych 9 przypadkach fd3, odtworzonych etapami przez fd4. Bramka jakości pilnuje, żeby fd4
nie spełniał progu kosztem jakości. Cel to zwykle połowa baseline'u albo zero tam, gdzie problem ma zniknąć: przy 9
przypadkach mniejsza poprawa ginie w szumie. Progi przyjął właściciel 26.11.2026.

| metryka | baseline fd3 | próg green dla fd4 | bramka jakości |
|---|---|---|---|
| m1 rozmiar SPEC | 617 linii, ok. 19 tys. tokenów; 47% szczegółu implementacji; 27% to log walidacji | ≤ 300 linii i ≤ 9 tys. tokenów; szczegół implementacji ≤ 15%; log walidacji w SPEC 0% | każde AC z SPEC fd3 ma odpowiednik |
| m2 koszt poprawki SPEC | ok. $5 i 24 min aktywnie; do 3 dodatkowych walidacji | ≤ $2,5 i ≤ 12 min; najwyżej 1 zbiorcza walidacja na poprawkę | poprawka trafia do wszystkich dotkniętych zadań |
| m3 grill | 23 pytania + 12 przy pisaniu SPEC; 5 rund | ≤ 10 pytań na żywo; ≤ 3 rundy; 0 pytań przy pisaniu SPEC | – |
| m4 gołe identyfikatory | regex 63–75%; etykiety właściciela ok. 60% | regex ≤ 20%; 0 list gołych identyfikatorów | – |
| m5 kontekst orkiestratora | każda długa sesja dochodzi do ok. 294 tys.; 30 kompakcji w 7 przypadkach | szczyt ≤ 150 tys.; ≤ 1 kompakcja na przypadek | – |
| m6 odsiew pytań (wymaganie 13) | wszystko trafia do użytkownika; odrzuca 24–27% rekomendacji | ≥ 40% pytań rozstrzyga agent; w przeglądzie użytkownik zmienia ≤ 27% jego decyzji | na żywo tylko pytania trudne do odwrócenia (zgodność z KEY ≥ 0,8) |
| m7 TDD | 1 na 136 agentów | ≥ 80% zadań z komendą testową: test pada przed zmianą kodu | test pada z oczekiwanego powodu |
| m8 rozmiar zadań | 21 zadań na przypadek | ≤ 10 | pokrycie AC i zależności bez zmian |
| m9 kroki dla człowieka | 47 z 60 mógł zrobić agent | 0 kroków agenta przypisanych użytkownikowi; 100% ryzykownych kroków na liście zgód | – |
| m10 powtarzalne pytania | 119 pytań ze wzorców; 100 pytań „zatwierdź decyzję” | 0 pytań objętych ustawieniem; 0 pojedynczych zatwierdzeń, tylko przegląd zbiorczy | – |
| m11 blokady na starcie | 2 z 9 przypadków (panel ról: 0 z 25 zadań agenta na starcie; agent-deck: 1 z 11) | 0 zadań użytkownika blokujących start; implementacja rusza w obu przypadkach z blokadą | – |
| m12 walidacja | 122 defekty przeszły; soczewki złapałyby 60% (ocena modelu) | zmierzone w odtworzeniu: ≥ 50% defektów złapanych; 0 regresji po własnych edycjach; „nie gotowy” przy uwagach blokujących | ≥ 80% uwag soczewek to prawdziwe defekty |
| m13 subagenci i modele | 113 subagentów; narzut na starcie 66 tys.; Opus 93% kosztu | ≤ 55 subagentów; narzut ≤ 20 tys.; Opus ≤ 60% kosztu | model niższy niż Opus tylko tam, gdzie ewaluacja jakości przechodzi (wymaganie 11) |
| m14 Bash w orkiestratorze | 12% kosztu orkiestratora | ≤ 6% | – |
| całość | $149 i 351 min aktywnie na przypadek | ≤ $75 i ≤ 175 min | liczba defektów po scaleniu nie większa niż w fd3 |

- **m12 mierzy, a nie szacuje.** 60% to ocena modelu, co *złapałaby* soczewka. Green wymaga odtworzenia: soczewki fd4
  dostają SPEC z dnia walidacji (`spec-as-read.md`) i liczymy znalezione znane defekty.
- **m6 nie ma progu na trafność przewidywań.** Modele nie przewidują odrzuceń użytkownika; próg pilnuje tylko, żeby
  oddanie decyzji agentowi nie zwiększyło liczby poprawek.
- **m14 częściowo pokrywa się z m5 i m13.** Zostaje osobno, bo mierzy jedną regułę z wymagania 11: przycinanie wyniku
  komend.
