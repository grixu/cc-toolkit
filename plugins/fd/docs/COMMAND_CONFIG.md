# `/config`

Wykrywa stack projektu, zbiera decyzje usera i zapisuje `.claude/fd-config.json` —
warunek wstępny każdej innej komendy. Idempotentna: zawsze aktualizuje plik i zawsze
przechodzi pełny HIL (detekcja tylko prefilluje).

---

## 1. Cel

Jedna definicja konfiguracji z defaultami: język, tryb i ścieżki przechowywania,
tooling (build / lint / test / format), wykryte MCP, skille CR, parametry dekompozycji,
modelu PR i walidacji. Schemat pliku — `config.example.jsonc`.

---

## 2. Prekondycje

Brak — `/config` jest wejściem do systemu. To jedyna komenda, która działa bez
istniejącego configu. Pozostałe komendy przy braku / niepoprawnym / niezgodnym
(`schema`) pliku zatrzymują się z komunikatem „uruchom `/config`".

---

## 3. Flow (6 faz)

0. **Wczytanie** istniejącego `.claude/fd-config.json`, jeśli jest (prefill).
1. **Detekcja** (kolejność): stack → menedżer pakietów → build / lint / test / format →
   CI → MCP (osiągalne jako toole w tej sesji — patrz Polityka MCP) → dostępność dynamic
   workflows (`implement.engine` default `workflow`, chyba że workflow są **znane jako
   niedostępne**, np. jawne `disableWorkflows`; `workflow` sam spada do subagentów at runtime;
   **bez shell-probe** — nie wykrywamy wersji Claude Code ani planu) → obecność `node`
   (twardy wymóg skryptów pluginu, niezależny od stacku projektu — `IMPLEMENTATION.md` §1).
   Każde pole niesie `value` + `source` + `confidence`.
2. **Klasyfikacja pewności:** jednoznaczne → prefill; wieloznaczne (>1 kandydat) → HIL
   dezambiguacja; brak → wg polityki braków.
3. **HIL — pełny re-ask za każdym razem:** `/config` zawsze przechodzi cały HIL, detekcja
   tylko prefilluje defaulty. Wszystkie pytania bezwarunkowe są **zbatchowane w możliwie
   najmniej wywołań AskUserQuestion** (narzędzie przyjmuje max 4 pytania na wywołanie;
   nie prompt per pole). Pytania bezwarunkowe:
   - **tryb przechowywania** (`per-feature` / `shared`) + `featuresRoot` — gdzie żyją
     spec + taski + manifest;
   - **lokalizacja docs** — jawne, zawsze zadawane pytanie *gdzie żyją `CONTEXT.md` i ADR-y?*
     (opcje z detekcji), zapis do `storage.docs`, **odsprzężone od trybu przechowywania**
     (spec per-feature + wspólny `adrRoot` jest legalny). Semantyka: `per-feature` →
     w katalogu ficzera (`contextFile`/`adrRoot` ignorowane); `per-app` → wspólny
     `contextFile` (+ opcjonalny `adrRoot`); `per-bounded-context` → `boundedContextsFile`
     (+ opcjonalny `adrRoot`);
   - **domyślny język** (`language.default`) — przy języku o gęstszej tokenizacji
     (np. polski) zaproponuj `tasks.charsPerToken` `3`–`3.5` zamiast `4`, żeby estymator
     tokenów nie kłamał;
   - **skille CR** (`codeReview.skills`, ≥1);
   - **budżet kontekstu taska** (`tasks.maxContextTokens`) — pułap na złożony plik taska
     + skopiowane zależności; opcje: `250000` (default / rekomendowane — modele z oknem
     ≥512k, np. Opus 4.8), `120000`, `40000` (małe okna / konserwatywnie).

   Follow-upy warunkowe (tylko gdy odpowiedzi je wyzwolą): tryb `shared` wymaga
   `storage.shared.*` (`contextMode` `per-app` / `per-bounded-context` + ścieżki);
   lokalizacja docs `per-bounded-context` wymaga `storage.docs.boundedContextsFile`.

   Reszta pokręteł jest **zdefaultowana BEZ pytania** (pozostałe `tasks.*`, `implement.*`,
   `prs.*`, `validation.*`) i wylistowana w raporcie fazy 6 do wglądu. Każda wartość **non-default**,
   którą model wybiera za usera (np. niepuste `implement.worktreeSetup`), musi być albo
   jawną opcją w zbatchowanym pytaniu, albo oflagowana do potwierdzenia — **nigdy po cichu**.

   Wyboru konkretnego bounded-contextu dla ficzera tu **nie** ma — dzieje się przy tworzeniu
   funkcjonalności (`/start`, `/from-docs`).
4. **Walidacja przed zapisem:** wyniki detekcji z fazy 1 są **reużywane** (bez ponownego
   `node --version` ani re-detekcji menedżera pakietów) — nowa robota tego kroku to
   zapisywalność ścieżek + stempel `detectedAt`. Sprawdzenia: skrypty / komendy istnieją
   (w tym `implement.worktreeSetup`), `node` obecny (inaczej block — bez niego nie działa
   hasher ani projekcje), ścieżki storage zapisywalne (w tym katalogi `storage.docs`),
   grounding MCP obecny (inaczej ostrzeżenie). Dla każdego skilla CR:
   1. rozwiąż jego definicję — frontmatter `SKILL.md` (skille) lub pliku komendy (skille-slash);
   2. odrzuć każdy z `disable-model-invocation: true` — taki skill jest nieosiągalny i dla
      Skill toola, i dla preloadu → re-ask;
   3. zapisz **kanoniczne, wywoływalne id**: goła nazwa dla skilla top-level
      (`quality-review`), a `plugin:skill` **tylko** dla skilla plugin-scoped (`fd:grill`).
      Nigdy nie emituj podwojonego `name:name`, chyba że `name` to naprawdę para plugin/skill.

   Przykład poprawnej listy: `["quality-review", "comment-review", "fd:grill"]`; źle:
   `["quality-review:quality-review", "comment-review:comment-review"]` — takie podwojone
   id nie wskazują żadnej realnej pary plugin/skill.

   Proponuje też dodanie komend `tooling.*` do allowlisty uprawnień — workflow fali w
   `/implement` działa w `acceptEdits` i dziedziczy allowlistę, a komenda spoza niej potrafi
   zatrzymać run promptem w środku.
5. **Zapis** `.claude/fd-config.json` (+ utwórz `.claude/`), idempotentnie. Scaffolduj
   pusty `bounded-contexts.json`, jeśli tryb tego wymaga a plik nie istnieje.
6. **Raport:** ustawione / zdefaultowane / niewykryte.

### Polityka braków toolingu

Rozróżniamy `not-detected` (pytamy) od `confirmed-none` (zapis `null`). Krytyczne
(build / test / lint / format) niewykryte → **ostrzeżenie + jawne potwierdzenie** usera;
pole zasili CI-flow w implementacji. Po cichu nic nie zgadujemy.

### Polityka MCP

`mcp.detected` to zbiór serwerów grounding/graph osiągalnych **jako toole w tej sesji**
(firecrawl, context7, codebase-memory-mcp): czytamy namespace narzędzi już obecnych w sesji
(każdy serwer wystawia toole `mcp__<server>__*`), **nie** shell-pingujemy ani nie spawnujemy
nic do ich testu. firecrawl + context7 zalecane, nie twardo wymagane; brak → ostrzeżenie.
`groundingDegraded` nie jest polem configu — to flaga pochodna liczona at runtime z
faktycznej osiągalności narzędzi; `mcp.detected` jest snapshotem-prefillem / fallbackiem
(`RESEARCHER.md` §6).

### Rejestr bounded contextów

Osobny, user-editable plik `<featuresRoot>/bounded-contexts.json` — **poza**
`fd-config.json`, żeby user dodawał BC bez dotykania configu. Używany tylko w trybie
`shared` + `contextMode: per-bounded-context`. Przy tworzeniu funkcjonalności plugin
proponuje BC po dotykanym kodzie (`match`), user potwierdza (HIL); zapis w
`state.json.boundedContext`. Funkcjonalność należy do **dokładnie jednego** BC;
cross-cutting → wybór primary albo rozbicie. Kształt pliku — `config.example.jsonc`.

---

## 4. Maszyna stanów

```
entry → load → detect → classify → HIL → validate ──ok──→ write → report → done
                                          └──fail──→ HIL (popraw / potwierdź brak)
```

Stan trwały: sam plik `fd-config.json`. Idempotencja = zbieżny plik przy tych samych
odpowiedziach. Brak stanu per-feature.

---

## 5. Bramki

| Bramka | Typ |
|---|---|
| Lokalizacja docs — gdzie żyją `CONTEXT.md`/ADR-y (per-feature / per-app / per-bounded-context → `storage.docs`) | HIL |
| `storage.shared.contextMode` (`per-app` / `per-bounded-context`), tylko tryb shared | HIL |
| Krytyczny tooling niewykryty | ostrzeżenie + potwierdzenie |
| Brak `node` (wymóg skryptów pluginu) | block → HIL |
| Walidacja przed zapisem (ścieżki, skille, komendy) | block → HIL |

Bramka „brak configu" jest egzekwowana przez **inne** komendy na wejściu — tu głęboka
walidacja jest zadaniem `/config`, nie taniego sprawdzenia parsowalności.

---

## 6. Wyjście / checkpoint

Raport ustawień, następnie oddanie sterowania. Sugestia następnego kroku (`/start` lub
`/from-docs`) — bez uruchamiania.
