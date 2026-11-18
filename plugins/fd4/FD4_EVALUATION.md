# fd3 real-runs: materiały do ewaluacji

**Co to jest:** 7 prawdziwych przebiegów fd3 w wersjach 0.5.0–0.5.3, każdy przez etapy build-spec, split-to-tasks i
implement. Dwa przypadki są z Bizwave (mailer, calendar-api), pięć z console-monorepo (user-flags,
response-body-stripping, nested-fields, impersonation, responses-api). Razem to 25 sesji, 160 zadań i 8 snapshotów
repo. Dane zebrane 18.11.2026.

**Gdzie leżą:**
- **R2:** bucket z sekretu `R2_BUCKET`, obiekt `fd3/real-runs/b41d11ed….tar.gz` (ok. 367 MB).
- **Przypięcie w git:** `plugins/fd3/evals/real-runs/eval-data.json`, wskazuje sha256 tarballa.
- **Lokalnie:** `plugins/fd3/evals/real-runs/local/` (ok. 1,1 GB), folder ignorowany przez git.

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

**Zastrzeżenia:**
- Zadania responses-api i impersonation istnieją tylko jako odtworzone z transkryptów.
- W calendar 3 zadaniom brakuje jednej edycji.
- Transkrypty mogą zawierać sekrety, więc dane trzymamy wyłącznie w prywatnym buckecie.
