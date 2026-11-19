# fd3 real-runs: materiały do ewaluacji

**Co to jest:** 7 prawdziwych przebiegów fd3 w wersjach 0.5.0–0.5.3, każdy przez etapy build-spec, split-to-tasks i
implement. Dwa przypadki są z Bizwave (mailer, calendar-api), pięć z console-monorepo (user-flags,
response-body-stripping, nested-fields, impersonation, responses-api). Razem to 29 sesji, 160 zadań i 8 snapshotów
repo. Dane zebrane 18.11.2026, sesje poprawek user-flags i nested-fields dołożone 19.11.2026.

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
