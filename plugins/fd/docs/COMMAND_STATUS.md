# `/status`

Read-only wgląd w stan funkcjonalności. Jedyna czysto read-only komenda — zero mutacji.

---

## 1. Cel

Re-orientacja: „gdzie jestem, co dalej". Umotywowana cold-startem między komendami — po
skompaktowaniu kontekstu `/status` pozwala odzyskać obraz bez uruchamiania niczego, co
zmienia stan.

---

## 2. Prekondycje

- Config poprawny.
- Wskazanie funkcjonalności: argument `<slug>` / heurystyka / HIL (`SPEC.md` §3.1).
- Istnieje workspace funkcjonalności (`state.json` + artefakty). Komenda tylko czyta.

---

## 3. Zakres

Składa obraz z artefaktów na dysku:

- **Readiness** — verdykty `readiness.spec` i `readiness.tasks` (ready / blocked + faile /
  waivery), z informacją, czy verdykt jest aktualny wobec świeżo policzonych hashy (czy
  nie stale) oraz które wymiary walidacji przebiegły (`dimensionsRun` — różnica wobec
  pełnego zestawu jest raportowana).
- **Taski** — stany: `planned` / `ready` / `in-progress` / `implemented` / `shipped` /
  `stale` / `dropped`; które `delivered`.
- **Graf SC** — mapa zależności wewnątrz funkcjonalności + **widok programu** (DAG
  funkcjonalności) liczony z refów `upstream` (`CROSS_FEATURE.md`).
- **Stan bramek** — które bramki przejściowe są otwarte / zablokowane.
- **Sugerowany następny krok** — prozą, **bez uruchamiania** (spójne z zasadą „podpowiadaj,
  nie proponuj uruchomienia").

---

## 4. Maszyna stanów

```
entry → guard(config) → read(state, manifest, maps) → hash(read-only) → compute(program view) → render → done
```

Brak zapisu, brak przejść stanu funkcjonalności, brak reconcile. Hashe do raportu
staleness liczy skrypt-hasher (`SPEC.md` §2.6) — samo liczenie jest read-only. `/status` nigdy nie
markuje niczego jako stale ani nie flipuje `shipped` / `delivered` (to pull przy
reconcile w komendach mutujących — `SPEC.md` §2.4) — pokazuje manifest as-is i
potencjalny wpływ.

---

## 5. Wyjście

Zwięzły raport stanu + jedna sugestia następnego kroku. Sterowanie od razu wraca do usera.
