# `/grill`

Drąży i zmienia **istniejący** spec: user dopytuje temat, koryguje wymagania lub przynosi
nowe informacje. Jedyny właściciel mutacji specu po jego powstaniu — wszystkie poprawki i
re-walidacje idą tędy.

---

## 1. Cel

Wprowadzić zmianę wymagań do specu w sposób spójny z projekcją: zmiana treści → reconcile
→ chirurgiczna inwalidacja zależnych tasków → ponowna walidacja. Utrzymuje stabilne ID i
historię wersji.

---

## 2. Prekondycje

- Config poprawny; istnieje `spec.md` + manifest funkcjonalności.
- Cold-start z workspace'u (wczytuje spec, manifest, `state.json` on-demand).

---

## 3. Flow

1. **Wejście w reconcile:** na starcie policz aktualne hashe elementów i porównaj z
   manifestem (re-entry — `SPEC.md` §2.4). To wychwytuje też ręczne edycje `spec.md`
   spoza komend.
2. **Grill** (`GRILLING.md`): drążenie wokół wkładu usera; zmiany materializują się jako
   nowe / uzupełnione bloki elementów. Grill jest świadomy ID — zachowuje istniejące,
   alokuje nowe tylko dla nowych elementów. Grounding on-demand w subagentach.
3. **Reconcile-plan (HIL):** zdiffuj zmieniony spec, sklasyfikuj `modified`
   breaking / non-breaking, zmapuj na akcje wobec tasków (regen-in-place / task korygujący
   / drop / bez zmian), pokaż plan **przed apply**.
4. **Apply:** zapisz taski, zaktualizuj manifest, dopisz wpis do historii wersji specu,
   zbumpuj `spec_hash` i `state.json.specHash`.
5. **Re-walidacja (ogon):** odpal walidację specu (6 wymiarów); zapisz świeży verdykt
   związany z nowym `specHash` do `readiness.spec`.

Cross-feature: jeśli funkcjonalność konsumuje zależne spec, reconcile re-czyta ich
manifesty i drąży wersje kontraktów (`CROSS_FEATURE.md`).

---

## 4. Maszyna stanów

```
entry → guard(config) → reconcile(scan) → grill → reconcile-plan → HIL → apply → validate → checkpoint
```

`state.json.phase` bez zmian (pozostaje `spec` / dalej), aktualizuje się `specHash` i
`readiness.spec`. Zmiana breaking już-dostarczonego elementu bumpuje jego `@v` i stawia
konsumentów w `stale`.

---

## 5. Bramki

| Bramka | Typ |
|---|---|
| Brak / niepoprawny config | block |
| Reconcile-plan przed apply | HIL |
| Walidacja spec (DoR) — ogon | block → verdykt |

---

## 6. Wyjście / checkpoint

Raport: co się zmieniło (diff elementów), które taski `stale`, nowy verdykt DoR. Sugestia
następnego kroku prozą — zwykle `/to-tasks` (re-projekcja tasków) — bez uruchamiania.
