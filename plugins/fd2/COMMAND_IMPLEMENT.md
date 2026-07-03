# `/implement`

Implementuje taski falami na feature branchu, walidując każdy przez AC + CI + code review.
Silnik to **dynamic workflow** owinięty w nadrzędny goal — nie `loop`.

---

## 1. Cel

Dostarczyć kod dla wszystkich tasków bardziej autonomicznie, ale ze zwalidowaniem (AC +
CI + CR), z atomowymi, rewertowalnymi commitami i samonaprawczą pętlą.

---

## 2. Prekondycje

- Config poprawny.
- **Enforcement DoR tasków (wejście):** czyta `readiness.tasks`; `blocked` lub stale →
  odmawia, kieruje do `/grill` / `/to-tasks`.
- **Rozszerzenie cross-feature:** każdy konsumowany `Y#EL@vN` musi być `delivered` w
  manifeście Y — inaczej bloker (`CROSS_FEATURE.md`). Tu spłaca się doradztwo kolejności:
  „zbuduj Y przed X".
- Cold-start z workspace'u.

---

## 3. Silnik: dynamic workflow + nadrzędny goal

- **Bez osobnego artefaktu planu** — fale liczone są **wprost z DAG-a SC on-the-fly**
  (fala = warstwa topologiczna). Mapa SC jest jedynym „planem"; nie materializujemy
  execution-planu.
- Pętla implementacji stoi na **dynamic workflows** (nie `loop`), owinięta w
  **goal / monitor**, który sprawdza: czy workflow żyje i czy wypełnił wszystkie taski +
  AC. Goal napędza kolejne iteracje.

---

## 4. Fala i bramki

**Izolacja:** jeden **worktree per task**, taski w fali równolegle, merge do feature
brancha. `state.json.waveInProgress` zaznacza falę w locie — na cold-starcie (re-entry)
`true` sygnalizuje falę przerwaną w poprzednim wywołaniu, którą goal dokańcza / sprząta
(worktree) przed ruszeniem dalej.

**Freeze specu na czas fali:** przy `waveInProgress` spec jest zamrożony — zmiany wymagań
(`/grill`) nie wchodzą w locie. Lądują w specu jako zwykła edycja i są podejmowane dopiero
przy następnym reconcile (kolejna re-entry `/implement` / `/to-tasks`), nie w trakcie
bieżącej fali. To utrzymuje falę spójną wobec jednego `spec_hash`.

**Bramki task → fala:**
- *Per task, przed merge:* walidacja AC + **lint tylko zmienionych / utworzonych plików**.
  Pass → merge do feature brancha.
- *Per fala, po merge:* pełne **CI (lint + test + build)** na feature branchu.
- *Po CI:* **code review** przez skonfigurowane skille (może być >1).

**Rewertowalność:** implementacja taska commitowana **atomowo, co kawałek**, z rationale
decyzji w treści commita → user cofa zmiany atomowo.

---

## 5. Naprawa = fala napraw w następnej iteracji

Agent walidujący przy porażce (AC / merge conflict / CI / CR finding) zwraca
**strukturalną diagnozę**: konkretna przyczyna, lokalizacja, kontekst potrzebny do
zrozumienia problemu. Kolejna iteracja workflow uruchamia falę zawierającą **wyłącznie
taski naprawcze**, każdy z: oryginalny task + zebrana diagnoza.

**Taski naprawcze** są efemerycznymi artefaktami iteracji: **nie** są nowymi węzłami SC,
nie dostają ID elementów, referują oryginalny task; commitują atomowo; wynik przywraca
status oryginału ku `implemented` + zielone bramki. Nie mylić z trwałym taskiem
korygującym (ten powstaje po shipie).

**Eskalacja:** po K nieudanych iteracjach napraw tego samego taska → **HIL** (nie pętlimy
w nieskończoność); goal raportuje nierozwiązywalny task. Próg `K` i granularność „kawałka"
commita to kandydaci do `fd-config.json`.

---

## 6. Granica mutowalności

- **W obrębie bieżącego runu** (feature branch, przed shipem): kod dostarczony we
  wcześniejszych falach jest **mutowalny** — taski naprawcze go modyfikują.
- **Kod z poprzednich runów / już w main:** **forward-only** (`SPEC.md` §2.5) — nie
  przepisujemy, domyka trwały task korygujący.
- Granica = **ship funkcjonalności** (merge feature brancha do main), nie merge taska do
  feature brancha.

---

## 7. Maszyna stanów

```
entry → guard(config) → enforce(readiness.tasks, upstream delivered)
      → reconcile(re-entry) → goal { for wave in topo(SC):
            parallel worktrees → per-task AC+lint → merge
            → per-wave CI → CR
            → on fail: diagnose → repair-wave (next iter) }
      → all tasks implemented + AC met → checkpoint
                                        └─ K-fail → HIL(escalate)
```

Task przechodzi `planned → ready → in-progress → implemented`; porażka trzyma go poza
`implemented` do czasu naprawy lub eskalacji.

---

## 8. Bramki

| Bramka | Typ |
|---|---|
| Brak / niepoprawny config | block |
| Enforcement DoR tasków + upstream `delivered` | block |
| Reconcile-plan przed apply (re-entry) | HIL |
| Per-task AC + lint zmian przed merge | block |
| Per-fala pełne CI (lint + test + build) | block |
| Post-CI code review (≥1 skill) | gate |
| K-iter fail — eskalacja | HIL |

---

## 9. Wyjście / checkpoint

Raport: zaimplementowane taski, wynik CI/CR per fala, ewentualne eskalacje. Feature branch
z całością pracy. Sugestia następnego kroku prozą — self-review całości, potem `/to-prs` —
bez uruchamiania.
