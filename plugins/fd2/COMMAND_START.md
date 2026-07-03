# `/start`

Tworzy nową funkcjonalność ze specu zbudowanego z **tematu** podanego przez usera. Pomija
ingest dokumentów (to domena `/from-docs`) — idzie prosto w grill.

---

## 1. Cel

Z tematu (i opcjonalnego override języka w prompcie) wyprodukować zwalidowany spec oraz
scaffold katalogu funkcjonalności, gotowy do `/to-tasks`.

---

## 2. Prekondycje

- Config istnieje i jest poprawny (inaczej halt „uruchom `/config`").
- Cold-start z workspace'u — komenda nie polega na kontekście poprzedniej komendy.

---

## 3. Flow

1. **Scaffold funkcjonalności:** ustal `slug`, utwórz `docs/features/<slug>/` wg trybu z
   configu; zainicjuj `state.json` (`phase: "spec"`, `createdFrom: "topic"`, `language`)
   i pusty `feature.lock.json`. W trybie shared + `per-bounded-context` — rozwiązanie BC
   (HIL).
2. **Grill** (`GRILLING.md`): temat → agenda → drążenie luk / niejasności / sprzeczności,
   z groundingiem on-demand w subagentach (`RESEARCHER.md`) i kontekstem kodu projektu.
   Wynik: `spec.md` (elementy z ID), `ac-map.json`, `CONTEXT.md`, wpisy do
   `sources-map.json`.
3. **Zapis + hash:** policz hashe elementów i `spec_hash`; zapisz manifest (init historii
   wersji specu) i `state.json.specHash`.
4. **Walidacja (ogon):** odpal walidację specu w osobnych czystych subagentach (6
   wymiarów — `BUILDING_SPEC.md` §5); zapisz verdykt związany z `specHash` do
   `readiness.spec`.

---

## 4. Maszyna stanów

```
entry → guard(config) → scaffold → grill → hash+persist → validate → checkpoint
```

`state.json.phase`: `spec` po zakończeniu. `readiness.spec.verdict` ∈ `ready | blocked`.
Verdykt jest związany z `validatedHash`; ręczna edycja specu poza komendami rozjeżdża
hash i unieważnia verdykt.

---

## 5. Bramki

| Bramka | Typ |
|---|---|
| Brak / niepoprawny config | block |
| Wybór bounded-context (tryb shared) | HIL |
| Walidacja spec (DoR) — ogon | block → verdykt |

---

## 6. Wyjście / checkpoint

Raport: verdykt DoR (ready / blocked + faile), lokalizacje artefaktów. Sugestia
następnego kroku prozą — `/grill` (gdy blocked lub user chce drążyć) albo `/to-tasks`
(gdy ready) — **bez uruchamiania**. Sterowanie wraca do usera; komenda zatrzymuje się na
granicy.
