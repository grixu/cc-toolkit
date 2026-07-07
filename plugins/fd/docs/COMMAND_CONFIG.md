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
     spec + taski + manifest; **ścieżka featuresRoot pada TUTAJ** (custom przez „Other") —
     treść pytania ma to mówić wprost, bo następne pytanie dotyczy wyłącznie docs;
   - **lokalizacja docs** — jawne, zawsze zadawane pytanie *gdzie żyją `CONTEXT.md` i ADR-y?*
     To **nie** jest ścieżka speców/tasków (ta padła wyżej; ścieżka wpisana tu przez pomyłkę
     → follow-up rekonsyliacyjny, nie ciche zgadywanie). Opcje z detekcji, zapis do
     `storage.docs`, **odsprzężone od trybu przechowywania** (spec per-feature + wspólny
     `adrRoot` jest legalny). Semantyka: `per-feature` → w katalogu ficzera
     (`contextFile`/`adrRoot` ignorowane); `per-app` → wspólny `contextFile` (+ opcjonalny
     `adrRoot`); `per-bounded-context` → `boundedContextsFile` (+ opcjonalny `adrRoot`);
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

   Reszta pokręteł jest **zdefaultowana BEZ pytania** (pozostałe `tasks.*`, `implement.*`
   — w tym `implement.ciScope: "full"` — `prs.*`, `validation.*`) i wylistowana w raporcie
   fazy 6 do wglądu. Każda wartość **non-default**,
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
   1. **źródłem prawdy o wywoływalności jest lista skilli osiągalnych w sesji** (to, co
      Skill tool faktycznie widzi), NIE filesystem — `SKILL.md` w cache'u pluginów /
      checkoutcie marketplace'u niczego nie dowodzi, a skill dostarczany przez sesję może
      w ogóle nie mieć pliku na dysku. Zapisz id **dokładnie w formie z listy sesji**;
      bez przeczesywania `$HOME`/cache'ów za definicjami;
   2. frontmatter `SKILL.md` (lub pliku komendy) czytaj **wyłącznie** pod kątem
      `disable-model-invocation: true` — taki skill jest nieosiągalny → re-ask; definicji
      brak na dysku, ale skill jest na liście sesji → zostaje (lista sesji wygrywa),
      odnotuj w raporcie;
   3. **kanoniczne, wywoływalne id** = forma z listy sesji: goła nazwa dla skilla top-level
      (`code-review`), `plugin:skill` dla plugin-scoped (`fd:grill`). Plugin, którego skill
      nazywa się jak plugin, legalnie daje podwojone id (`quality-review:quality-review`) —
      to normalna forma takich pluginów, nie błąd.

   Przykład poprawnej listy: `["code-review", "quality-review:quality-review", "fd:grill"]`;
   źle: gołe `"quality-review"`, gdy sesja listuje tylko `quality-review:quality-review` —
   id spoza listy sesji nie rozwiąże się w `/implement`.

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
