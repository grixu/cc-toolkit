# `/from-docs`

Tworzy funkcjonalność ze specu zbudowanego z **dostarczonych dokumentów** (research, ADR,
zależne spec, transkrypty, URL, kod). Trzy-etapowy: źródła → analiza → grill.

---

## 1. Cel

Zamienić materiały usera w zwalidowany, ugruntowany spec, zachowując źródła i odtwarzalną
proweniencję (efekt BYO: spec stoi na dowodach usera, bez brudzenia swojej prozy).

---

## 2. Prekondycje

- Config istnieje i jest poprawny.
- Cold-start z workspace'u.
- Wejście: ścieżki / URL-e źródeł (lub wskazanie już skopiowanych do `sources/`).

---

## 3. Flow

1. **Scaffold + ingest źródeł:** utwórz `docs/features/<slug>/` i `state.json`
   (`createdFrom: "docs"`) wg trybu z configu — w trybie shared + `per-bounded-context`
   rozwiąż BC ficzera (HIL, zapis `state.json.boundedContext`); skopiuj dostarczone
   dokumenty do `sources/`. Formaty best-effort (md / pdf / txt / transkrypt / URL / kod)
   + pierwszoklasowe: zależny FD-spec (`path + hash`) i ADR (`RESEARCHER.md` §3).
2. **Analiza (kontrakt ingest, przed grillem)** — produkuje:
   - kandydatów FR / NFR / AC,
   - agendę grilla (luki, niejasności, sprzeczności),
   - `sources-map.json` (claim → wyciąg ze źródła),
   - model domenowy `CONTEXT.md`.
3. **Grill** (`GRILLING.md`): dopełnia luki wychodząc od agendy, grounding on-demand w
   subagentach; wynik zapisany do `spec.md` (elementy z ID) + `ac-map.json`.
4. **Zapis + hash** i **walidacja (ogon)** — jak w `/start` (kroki 3–4 flow: policz hashe
   elementów + `spec_hash`, zapisz manifest i `state.json.specHash`; walidacja 6 wymiarów
   → `readiness.spec`).

### Re-run = dodawanie źródeł w trakcie

Nie ma osobnej komendy mid-flight. Dorzucenie źródła to ponowne `/from-docs`, które dzięki
deklaratywnemu rdzeniowi jest **reconcile, nie generacją od zera** (`SPEC.md` §2.4): nowe
źródło dokłada / modyfikuje kandydatów, a grillowana treść przetrwa, bo żyje w specu.
Warunek: bieżący grill jest checkpointowany do specu przed re-ingest.

---

## 4. Maszyna stanów

```
entry → guard(config) → ingest → analyze → grill → hash+persist → validate → checkpoint
   (re-run) ────────────→ reconcile(diff spec) → HIL(reconcile-plan) → apply ──┘
```

`state.json.phase`: `spec`; `createdFrom: "docs"`. Przy re-run wchodzi ścieżka reconcile
z bramką HIL na plan.

---

## 5. Bramki

| Bramka | Typ |
|---|---|
| Brak / niepoprawny config | block |
| Tryb docs (CONTEXT per-feature / shared) | HIL |
| Wybór bounded-context (tryb shared + per-BC) | HIL |
| Reconcile-plan przed apply (re-run) | HIL |
| Walidacja spec (DoR) — ogon | block → verdykt |

---

## 6. Wyjście / checkpoint

Raport: verdykt DoR, skopiowane źródła, mapa proweniencji, lokalizacje artefaktów.
Sugestia następnego kroku prozą (`/grill` albo `/to-tasks`) — bez uruchamiania.
