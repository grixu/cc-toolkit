# `/implement`

Implementuje taski falami na feature branchu, walidując każdy przez AC + CI + code review.
Silnikiem fali jest **dynamic workflow**; nadrzędny goal to logika promptu komendy w
głównej konwersacji — nie prymityw platformy.

---

## 1. Cel

Dostarczyć kod dla wszystkich tasków bardziej autonomicznie, ale ze zwalidowaniem (AC +
CI + CR), z atomowymi, rewertowalnymi commitami i samonaprawczą pętlą.

---

## 2. Prekondycje

- Config poprawny.
- Wskazanie funkcjonalności: argument `<slug>` / heurystyka / HIL (`SPEC.md` §3.1).
- **Reconcile-detekcja (wejście, bez apply):** przelicz hashe + ship-detekcja
  (`SPEC.md` §2.4); wykryty drift specu / tasków → twardy block „uruchom `/to-tasks`".
  `/implement` niczego nie apply'uje na taskach.
- **Enforcement DoR tasków:** czyta `readiness.tasks` wobec świeżo policzonych hashy;
  `blocked` lub stale → odmawia, kieruje do `/grill` / `/to-tasks`.
- **Rozszerzenie cross-feature:** każdy konsumowany `Y#EL@vN` musi być `delivered` w
  manifeście Y — inaczej bloker; delivered liczone na żywo (`CROSS_FEATURE.md` §5).
  Tu spłaca się doradztwo kolejności: „zbuduj Y przed X".
- **Feature branch:** pierwszy run tworzy branch wg `implement.branchTemplate` (default
  `feat/<slug>`) i zapisuje `state.json.branch`; kolejne runy pracują na zapisanym.
- Cold-start z workspace'u.

---

## 3. Silnik: workflow per fala + goal w głównej konwersacji

- **Bez osobnego artefaktu planu** — fale liczone są **wprost z DAG-a SC on-the-fly**
  (fala = warstwa topologiczna). Mapa SC jest jedynym „planem"; nie materializujemy
  execution-planu.
- **Goal** to logika promptu komendy w głównej konwersacji, nie prymityw platformy.
  Workflow nie przyjmuje inputu usera w trakcie runu, więc **każda fala i każda iteracja
  napraw = osobny run Workflow**; goal ocenia wynik każdego runu (fala domknięta?
  wszystkie taski + AC wypełnione?) i decyduje: kolejna fala / fala napraw / checkpoint.
  Bramki HIL żyją **między runami**, w main thread.
- **Dostępność i fallback:** dostępność dynamic workflows (wersja Claude Code, plan,
  `disableWorkflows`) wykrywa `/config`, a `/implement` weryfikuje na wejściu. Brak →
  **degradacja do subagentów**: taski fali uruchamiane równolegle przez Agent tool z
  izolacją worktree, bramki i stan identyczne; degradacja jest raportowana, nie blokuje.
  Tryb subagentowy można też wymusić configiem (`implement.engine: "subagents"`).

---

## 4. Fala i bramki

**Izolacja:** jeden **worktree per task**, taski w fali równolegle, merge do feature
brancha. `state.json.waveInProgress` zaznacza falę w locie.

**Merge taska = squash:** feature branch dostaje **1 commit per task**, z trailerem
`Task: <id>` i rationale decyzji zebranym w body; granularne commity kawałków zostają w
worktree. Jednostką rewertu na feature branchu jest task, a liniowa historia
1-commit-per-task w kolejności topologicznej jest tym, co `/to-prs` tnie na stos
(`COMMAND_TO_PRS.md` §4). Sprzątanie worktree po tasku wg `implement.worktreeCleanup`
(`always` | `keep-failed`); recovery po restarcie sprząta zawsze.

**Overlap plikowy w fali:** przed startem fali goal liczy przewidywany footprint plikowy
per task (`codeDeps` + pliki wskazane w treści taska, best-effort); taski o przecinających
się footprintach są **serializowane wewnątrz fali** (kolejny startuje z feature brancha po
merge poprzedniego), rozłączne biegną równolegle. Footprint to heurystyka — konflikt,
który się prześliźnie, i tak łapie bramka merge → fala napraw. Run workflow nie przeżywa
restartu sesji, więc recovery zakłada zimny start: `true` na wejściu (re-entry) ⇒ goal
**sprząta worktree i uruchamia falę ponownie jako nowy run** od stanu z dysku (manifest +
statusy tasków) — nie „dokańcza" starego runu.

**Freeze specu na czas fali:** przy `waveInProgress` spec jest zamrożony — zmiany wymagań
(`/grill`) nie wchodzą w locie. Lądują w specu jako zwykła edycja i podejmuje je dopiero
następny `/to-tasks` (re-entry `/implement` wykryje drift i zablokuje — `SPEC.md` §2.4),
nie bieżąca fala. To utrzymuje falę spójną wobec jednego `spec_hash`.

**Bramki task → fala:**
- *Per task, przed merge:* walidacja **AC pokrytych w całości przez task** + **lint tylko
  zmienionych / utworzonych plików**. Pass → merge do feature brancha. AC rozpięte na >1
  task (`covers` wiele-do-wielu) nie są tu weryfikowalne — czekają na bramkę fali.
- *Per fala, po merge:* pełne **CI (lint + test + build)** na feature branchu + walidacja
  **AC domykanych tą falą** — tych, których ostatni task-producent właśnie się scalił
  (AC rozpięty na wiele fal domyka się w fali ostatniego producenta).
- *Po CI:* **code review** przez skonfigurowane skille (może być >1).

**Rewertowalność:** w worktree implementacja commitowana **atomowo, co kawałek**, z
rationale w treści commita; po squashu jednostką rewertu na feature branchu jest **task**
(rationale kawałków przeżywa w body commita taska).

---

## 5. Naprawa = fala napraw w następnej iteracji

Agent walidujący przy porażce (AC / merge conflict / CI / CR finding) zwraca
**strukturalną diagnozę**: konkretna przyczyna, lokalizacja, kontekst potrzebny do
zrozumienia problemu. Kolejna iteracja workflow uruchamia falę zawierającą **wyłącznie
taski naprawcze**, każdy z: oryginalny task + zebrana diagnoza.

**Taski naprawcze** są efemerycznymi artefaktami iteracji: **nie** są nowymi węzłami SC,
nie dostają ID elementów, referują oryginalny task; wynik przywraca status oryginału ku
`implemented` + zielone bramki. Na feature branch wchodzą jako **fixup do commita swojego
taska** — przy domknięciu fali napraw autosquash wciąga go w oryginalny commit (drzewo
końcowe identyczne, więc verdykt CI fali pozostaje ważny); konflikt autosquashu → osobny
commit z tym samym trailerem `Task:` (partycja `/to-prs` obejmuje wtedy >1 commit taska).
Nie mylić z trwałym taskiem korygującym (ten powstaje po shipie).

**Eskalacja:** po K nieudanych iteracjach napraw tego samego taska → **HIL** (nie pętlimy
w nieskończoność); goal raportuje nierozwiązywalny task. Próg `K` =
`implement.maxRepairIterations` w `fd-config.json`; granularność commita na feature
branchu jest stała (1 commit = task, §4) — kawałki żyją w worktree.

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
entry → guard(config) → reconcile-detect(hashe + ship) ──drift──→ block(„/to-tasks")
      → enforce(readiness.tasks, upstream delivered)
      → goal (main thread) { for wave in topo(SC):
            run = Workflow(fala) | fallback: subagenty + worktree
                  [worktrees (overlap → serializacja) → per-task AC+lint
                   → squash-merge → per-wave CI + AC domykane falą → CR]
            → pass → next wave | fail → diagnoza → run(fala napraw)
            → HIL między runami }
      → all tasks implemented + AC met → checkpoint
                                        └─ K-fail → HIL(escalate)
```

Task przechodzi `planned → ready → in-progress → implemented`; `shipped` ustawia dopiero
detekcja shipu po merge do main (`SPEC.md` §2.4). Porażka trzyma taska poza `implemented`
do czasu naprawy lub eskalacji.

---

## 8. Bramki

| Bramka | Typ |
|---|---|
| Brak / niepoprawny config | block |
| Drift specu / tasków w detekcji (bez apply) | block |
| Enforcement DoR tasków + upstream `delivered` | block |
| Per-task AC (pokryte w całości) + lint zmian przed merge | block |
| Per-fala pełne CI (lint + test + build) + AC domykane falą | block |
| Post-CI code review (≥1 skill) | gate |
| K-iter fail — eskalacja | HIL |

---

## 9. Wyjście / checkpoint

Raport: zaimplementowane taski, wynik CI/CR per fala, ewentualne eskalacje. Feature branch
z całością pracy. Sugestia następnego kroku prozą — self-review całości, potem `/to-prs` —
bez uruchamiania.
