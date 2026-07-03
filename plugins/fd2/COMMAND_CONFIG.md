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
   CI → MCP. Każde pole niesie `value` + `source` + `confidence`.
2. **Klasyfikacja pewności:** jednoznaczne → prefill; wieloznaczne (>1 kandydat) → HIL
   dezambiguacja; brak → wg polityki braków.
3. **HIL — pełny re-ask za każdym razem:** `/config` zawsze przechodzi cały HIL, detekcja
   tylko prefilluje defaulty. Wybory: tryb i ścieżki przechowywania, tryb docs
   (CONTEXT per-feature / shared), domyślny język, skille CR, `contextMode`
   (`per-app` / `per-bounded-context`) w trybie shared. Wyboru konkretnego
   bounded-contextu dla ficzera tu **nie** ma — dzieje się przy tworzeniu
   funkcjonalności (`/start`, `/from-docs`).
4. **Walidacja przed zapisem:** skrypty / komendy istnieją, skill CR dostępny, ścieżki
   storage zapisywalne, grounding MCP obecny (inaczej ostrzeżenie).
5. **Zapis** `.claude/fd-config.json` (+ utwórz `.claude/`), idempotentnie. Scaffolduj
   pusty `bounded-contexts.json`, jeśli tryb tego wymaga a plik nie istnieje.
6. **Raport:** ustawione / zdefaultowane / niewykryte.

### Polityka braków toolingu

Rozróżniamy `not-detected` (pytamy) od `confirmed-none` (zapis `null`). Krytyczne
(build / test / lint / format) niewykryte → **ostrzeżenie + jawne potwierdzenie** usera;
pole zasili CI-flow w implementacji. Po cichu nic nie zgadujemy.

### Polityka MCP

firecrawl + context7 zalecane, nie twardo wymagane; brak → ostrzeżenie +
`groundingDegraded: true` (skutki — `RESEARCHER.md` §6).

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
| contextMode (`per-app` / `per-bounded-context`) | HIL |
| Tryb docs (CONTEXT per-feature / shared) | HIL |
| Krytyczny tooling niewykryty | ostrzeżenie + potwierdzenie |
| Walidacja przed zapisem (ścieżki, skille, komendy) | block → HIL |

Bramka „brak configu" jest egzekwowana przez **inne** komendy na wejściu — tu głęboka
walidacja jest zadaniem `/config`, nie taniego sprawdzenia parsowalności.

---

## 6. Wyjście / checkpoint

Raport ustawień, następnie oddanie sterowania. Sugestia następnego kroku (`/start` lub
`/from-docs`) — bez uruchamiania.
