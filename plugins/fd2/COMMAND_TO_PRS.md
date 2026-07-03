# `/to-prs`

Wycina z feature brancha stos PR-ów do **ludzkiego** code review — drugiej, realnej bramki
merge-do-main (obok automatycznego CR w pętli implementacji). Istnieje po to, by ludzki
przegląd był wykonalny przy kilku–kilkudziesięciu PR.

---

## 1. Cel

Zamienić liniową historię feature brancha w czytelny stos PR-ów, zachowując atomowe
commity per task + rationale, tak by reviewer widział ślad decyzji i mógł mergować
bottom-up.

---

## 2. Prekondycje

- Config poprawny.
- Implementacja ukończona i po self-review całości.
- Istnieją: feature branch, mapa SC (`sc-map.json`), manifest.
- Cold-start z workspace'u.

---

## 3. Model

Integracja odbyła się najpierw na jednym feature branchu (`COMMAND_IMPLEMENT.md`); tu
osobną komendą **wycinamy** z niego branche PR. `/to-prs` nie wystawia PR-ów siłą —
dostarcza branche (opcjonalnie otwiera PR).

- **Stacked:** PR-y jako stos, `PR_n` bazuje na `PR_{n-1}`, baza stacka = `baseBranch`
  (default `main`). Review i merge **bottom-up**.
- **Kolejność stacka** = linearyzacja (topo-sort) DAG-a SC: fundament na dole, capability
  slice wyżej.

---

## 4. Grupowanie

- **Auto (default):** spójny slice = reuse hybrydy dekompozycji. Fundament → dolne PR-y,
  każda zdolność → PR. Daje „kilka–kilkadziesiąt PR".
- **Manualny (pętla HIL):** dev przypisuje taski do PR-ów; **co krok walidujemy
  składalność**; pętla trwa, aż wszystkie taski przypisane i stos poprawny.

### Niezmiennik składalności (buildability)

Dla stosu `[PR_1..PR_m]` (dół → góra): dla każdego taska `t ∈ PR_i` **wszystkie** jego
zależności (producent konsumowanych elementów + `codeDeps` + taski dotykające tych samych
plików) leżą w `PR_j`, `j ≤ i`. Przypisanie to poprawna warstwa topologiczna, a każdy PR
buduje się na tym, co pod nim. Wybór dewelopera łamiący niezmiennik (forward-reference,
rozjazd plikowy) → **krok odrzucony** z wyjaśnieniem, dev wybiera ponownie.

**Dlaczego to tanie:** commity już istnieją liniowo na feature branchu (wave-merge ustawił
kolejność topologiczną). Stos = partycja tej liniowej historii na PR-owe kawałki, z
zachowaniem atomowych commitów per task + rationale.

---

## 5. Edge cases

- **Overlap plikowy** dwóch slice'ów → wspólny PR albo sąsiedztwo w stosie (w stacked
  wystarczy kolejność).
- **Fundament o dużym fan-oucie** → na dole stosu; wszystko powyżej zależy naturalnie.
- **Task za duży na review nawet sam** → sygnał, że powinien być rozbity w dekompozycji →
  feedback do `/to-tasks` / `/grill`.
- **Praca niezależna serializowana przez stacked** → akceptowany koszt wyboru stacked.
- **Ludzki CR żąda zmian w niskim PR** → propaguje w górę stosu (rebase); zmiany wracają
  jako edycja feature brancha (grill / fix-task) → re-projekcja `/to-prs`. *(pełna pętla
  feedbacku ludzkiego CR — do domknięcia.)*

---

## 6. Maszyna stanów

```
entry → guard(config) → read(branch, SC, manifest) → linearize(topo SC)
      → group (auto | manual-HIL) → assert(buildability) ──fail──→ HIL(re-assign)
      → produce PR branches (+ optional open PR, + optional per-PR CI) → checkpoint
```

**Idempotencja:** `/to-prs` jest re-projekcją — zmiana feature brancha (np. po review) i
ponowne odpalenie odświeża stos.

---

## 7. Bramki

| Bramka | Typ |
|---|---|
| Brak / niepoprawny config | block |
| Manual PR grouping | HIL |
| Niezmiennik składalności (buildability) | block |
| Per-PR CI (`verifyPerPrCi`) | opcjonalny block |

---

## 8. Wyjście / checkpoint

Raport: stos PR-ów (kolejność, przypisanie tasków), branche gotowe do review. Sugestia
prozą: review i merge bottom-up; przy zmianach z CR — powrót przez `/grill` i re-projekcja.
