# `/implement`

Implementuje taski falami na feature branchu: AC + scoped CI per fala, jedno code review
całości przy domknięciu funkcjonalności. Silnikiem fali jest **dynamic workflow** (wersjonowany
skrypt `scripts/wave-implement.mjs`); nadrzędny goal to logika promptu komendy w głównej
konwersacji — nie prymityw platformy. Sesja przerwana w trakcie fali **wznawia resztę** fali,
salvage'ując ukończone-lecz-niescalone branche tasków.

---

## 1. Cel

Dostarczyć kod dla wszystkich tasków bardziej autonomicznie, ze zwalidowaniem (AC + scoped
CI per fala, jedno CR całości przy domknięciu), z atomowymi, rewertowalnymi commitami i
samonaprawczą pętlą.

---

## 2. Prekondycje

- Config poprawny.
- Wskazanie funkcjonalności: argument `<slug>` / heurystyka / HIL (`SPEC.md` §3.1).
- **Reconcile-detekcja (wejście, bez apply):** przelicz hashe + ship-detekcja
  (`SPEC.md` §2.4); wykryty drift specu / tasków — w tym rozjazd `contentHash` pliku
  taska (ręczna edycja generated-only — `SPEC.md` §2.6) → twardy block „uruchom
  `/to-tasks`". `/implement` niczego nie apply'uje na taskach.
- **Enforcement DoR tasków:** czyta `readiness.tasks` wobec świeżo policzonych hashy;
  `blocked` lub stale → odmawia, kieruje do `/grill` / `/to-tasks`.
- **Rozszerzenie cross-feature:** każdy konsumowany `Y#EL@vN` musi być `delivered` w
  manifeście Y — inaczej bloker; delivered liczone na żywo (`CROSS_FEATURE.md` §5).
  Tu spłaca się doradztwo kolejności: „zbuduj Y przed X".
- **Feature branch (pierwszy run = HIL bazy):** dla pierwszego runu **HIL** (`AskUserQuestion`)
  „utwórz `<branchTemplate>` na jakiej bazie?" — opcje: `prs.baseBranch` (default / rekomendowane),
  bieżący branch git (jeśli różny), inny ref (walidacja `git rev-parse --verify`). Branch tworzony
  na **wybranej** bazie, `state.json.branch` zapisany; kolejne runy pracują na zapisanym. HIL jest
  stały — odpala się na pierwszym `/implement` każdej funkcjonalności.
- **Recovery — wznowienie reszty + salvage:** `waveInProgress == true` na wejściu ⇒ **nigdy** zimny
  restart całej fali (patrz §4). Done-set (taski `implemented`, których `impl.commits` są osiągalne z
  tipa feature brancha) pomijamy; leftover branche `fd/<slug>/T-*` z breadcrumbem `Fd-Gate: pass`
  re-walidujemy tanią bramką per task → pass ⇒ merger scala, main thread zapisuje inkrementalnie
  (salvage), fail / brak breadcrumba ⇒ discard; worktree kasujemy tylko dla niesalvage'owanych; potem
  przeliczamy fale i uruchamiamy resztę.
- Cold-start z workspace'u.

---

## 3. Silnik: workflow per fala + goal w głównej konwersacji

- **Bez osobnego artefaktu planu** — fale liczone są **wprost z DAG-a SC on-the-fly**
  (fala = warstwa topologiczna). Mapa SC jest jedynym „planem"; nie materializujemy
  execution-planu.
- **Goal** to logika promptu komendy w głównej konwersacji, nie prymityw platformy.
  Workflow nie przyjmuje inputu usera w trakcie runu, więc **każda fala i każda iteracja
  napraw = osobny run Workflow**; goal ocenia wynik każdego runu i decyduje: kolejna fala /
  fala napraw / domknięcie. Bramki HIL żyją **między runami**, w main thread.
- **Zakres runu (granica):** run robi **wyłącznie** implementację tasków + self-gate per task
  + trwały commit-breadcrumb. Serial merge, inkrementalny zapis manifestu, scoped CI i (przy
  domknięciu) CR robi **main thread** między runami.
- **Wersjonowany skrypt:** run fali odpala **shipowany** skrypt `scripts/wave-implement.mjs`
  przez tool **Workflow** (`scriptPath`) — to skrypt dynamic-workflow wołający harnessowe
  `agent()`; **nigdy** uruchamiany przez `node`. Komenda przekazuje **jedną** wartość `args`, która
  może dotrzeć do skryptu jako **string JSON** — skrypt parsuje **defensywnie** (string ⇒
  `JSON.parse`, walidacja pól). Kontrakt:
  - **args:** `{ mode: "implement"|"repair", wave, featureBranch, tasks: [{ id, worktree, branch,
    taskFile, serializeAfter?, diagnosis? }], gate: { acIds, lintChanged: true } }`,
  - **zwrot:** `{ tasks: [{ id, status: "passed"|"failed", changedFiles, headSha, gate, diagnosis? }] }`.
- **Dyrektywy agenta taskowego** (jedno źródło prawdy — skrypt osadza je verbatim, fallback
  reużywa): plik taska jest samowystarczalny (bez re-grepowania ścieżek już nazwanych w treści /
  `codeDeps`); **batch edits**, potem typecheck + lint **raz** na końcu; **stub, nie odtwarzaj**
  brakującego pliku zależności (właściciel = task-producent — tylko minimalny stub kontraktu);
  commit atomowo z rationale; **finalny akt po zielonym self-gate = jeden pusty commit-breadcrumb**
  z trailerami `Task: <id>` + `Fd-Gate: pass` (self-gate fail ⇒ brak breadcrumba, `status: "failed"`
  + diagnoza).
- **Dostępność i fallback:** dostępność dynamic workflows (wersja Claude Code, plan,
  `disableWorkflows`) wykrywa `/config`, `/implement` weryfikuje na wejściu. Brak →
  **degradacja do subagentów** przez Agent tool z izolacją worktree — **ten sam** kontrakt
  args/zwrotu, te same prompty i bramki; degradacja raportowana, nie blokuje. Tryb subagentowy
  wymuszalny configiem (`implement.engine: "subagents"`). Orkiestracja: goal **czeka bezpośrednio**
  na zakończenie runu / subagentów — nigdy foreground-`sleep`, nigdy polling plików.

---

## 4. Fala i bramki

**Izolacja i nazwy:** jeden **worktree per task** — ścieżka `<repo>/.fd-worktrees/<slug>/<T-id>`,
branch `fd/<slug>/<T-id>`. Świeży worktree bootstrapują komendy `implement.worktreeSetup` (np.
`pnpm install`) przed startem taska; sprzątanie po tasku wg `implement.worktreeCleanup`
(`always` | `keep-failed`). Przy recovery sprzątanie **bramkuje** salvage: worktree
salvage'owanego taska żyje do jego merge'a, niesalvage'owane kasujemy.

**Merge taska = squash (szeregowo, zapis inkrementalny):** feature branch dostaje **1 commit per
task**, z trailerem `Task: <id>` i rationale zebranym w body (pusty breadcrumb wyłączony z
rationale); granularne commity kawałków zostają w worktree. Merge'e wykonuje **szeregowo
subagent-merger**, wołany przez main thread **po jednym tasku** — po każdym merge main thread
zapisuje `impl.commits` i status `implemented` **zanim** ruszy następny (pojedynczy pisarz stanu,
inkrementalnie). Jednostką rewertu na feature branchu jest task; liniowa historia 1-commit-per-task
jest tym, co `/to-prs` tnie na stos (`COMMAND_TO_PRS.md` §4).

**Kanoniczna tożsamość commita = trailer `Task: <id>`;** `impl.commits` to **pochodny cache**
przeliczany z trailerów po każdym autosquashu (`git log <base>..<featureBranch>`,
`%(trailers:key=Task,valueonly)`); >1 commit na trailer (konflikt autosquashu) ⇒ wszystkie SHA w
tablicy taska.

**Overlap plikowy w fali** (dwa deterministyczne pre-passy, best-effort z `codeDeps` + ścieżek w
treści):
- **write ∩ write** — dwa taski piszące ten sam plik są serializowane.
- **read-after-write** — task, którego `needs` (jego `codeDeps` + importy / ścieżki w treści)
  przecina `willWrite` peera (ścieżki, które peer nazywa dla swoich elementów) bez istniejącej
  krawędzi `consumes`, jest **serializowany po peerze** (`tasks[].serializeAfter`) albo **odłożony
  do następnej fali** (gdzie peer jest już scalony).
Uczciwe zastrzeżenie: mapowanie element→plik jest parsowane z treści best-effort — **główną**
gwarancją jest reguła stuba + bramki merge/CI, nie ta heurystyka.

**`state.json.waveInProgress`** = `true` od startu pierwszej fali, `false` **dopiero przy
domknięciu** funkcjonalności; `phase = "implementing"` od startu pierwszej fali.

**Freeze specu na czas fali:** przy `waveInProgress` spec jest zamrożony — zmiany wymagań
(`/grill`) lądują w specu jako zwykła edycja i podejmuje je dopiero następny `/to-tasks` (re-entry
`/implement` wykryje drift i zablokuje — `SPEC.md` §2.4), nie bieżąca fala.

**Trywialny ficzer:** 1 task → 1 fala z 1 taskiem — jeden worktree, zero równoległości; silnik i
bramki bez zmian (run workflow albo pojedynczy subagent w fallbacku).

**Bramki task → fala:**
- *Per task = self-gate agenta taskowego (breadcrumbowany):* w runie agent waliduje **AC pokryte w
  całości przez task** + **lint tylko zmienionych plików**, po czym pisze breadcrumb `Fd-Gate: pass`.
  AC rozpięte na >1 task czekają na bramkę fali.
- *Per fala, po merge = SCOPED CI:* suma zmienionych plików commitów scalonych w tej fali
  (`git diff --name-only`) → mapowanie na paczki workspace'u (`pnpm-workspace.yaml` /
  `package.json#workspaces` / `turbo.json`, best-effort) → **filtrowane** `tooling.*` (np. `--filter`)
  **tylko** gdy mapowanie pewne, inaczej **fallback do pełnego** `tooling.lint` + `tooling.test` +
  `tooling.build`. Plus walidacja **AC domykanych tą falą**. Zapis `impl.ci`.
- *Code review NIE jest bramką per fala* — jest jedno, nad całością, przy **domknięciu** (§4.1).

**Rewertowalność:** w worktree implementacja commitowana **atomowo, co kawałek**, z rationale w
treści commita; po squashu jednostką rewertu na feature branchu jest **task**.

### 4.1. Domknięcie funkcjonalności

Gdy **wszystkie** taski są `implemented`, domykamy funkcjonalność (raz, w main thread):
1. **Pełne CI** (`tooling.lint` + `tooling.test` + `tooling.build`) na feature branchu — fail ⇒ fala
   napraw, potem powrót tutaj.
2. **CR całości (bramka):** lista plików `git diff --name-only <base>...<feature>` + diff zapisane do
   **pliku**; agent CR dostaje **ścieżkę pliku** i go `Read`-uje — **diff nigdy nie jest inline'owany**
   w prompt. Agent CR wywołuje **każdy** skill z `codeReview.skills` **po nazwie przez Skill tool**
   (≥1); **bez** zagnieżdżonego fan-outu i **bez** researchu sieciowego. Findingi zasilają pętlę napraw.
3. **Finalna fala napraw** (jeśli są findingi) → commity `--fixup` → `git rebase --autosquash` →
   rekonsyliacja `impl.commits` z trailerów.
4. **Ponowne pełne CI** — potwierdzenie, że drzewo dalej zielone po fixupach.
5. **Zapis i raport:** `impl.cr = pass` dla każdego taska, `waveInProgress = false`. `phase`
   **zostaje `implementing`** — flip do `shipped` to nadal robota detekcji shipu (`SPEC.md` §2.4), po
   merge feature brancha do `baseBranch`.

**Wznowienie:** wejście z wszystkimi taskami `implemented` i niepełnym `impl.cr` ⇒ brak fali do
odpalenia — wchodzimy w domknięcie od **kroku 2**.

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
Taski naprawcze istnieją wyłącznie wewnątrz `/implement` — po zakończonej implementacji
zmiany domyka nowa funkcjonalność (`SPEC.md` §2.5).

**Rekonsyliacja SHA:** po **każdym** autosquashu `impl.commits` jest przeliczany z trailerów
(`git log <base>..<featureBranch>`, `%(trailers:key=Task,valueonly)`) — SHA się zmieniają, więc
cache w manifeście trzeba odświeżyć; trailer zostawiony na >1 commicie zapisuje wszystkie te SHA
w tablicy taska.

**Eskalacja:** po K nieudanych iteracjach napraw tego samego taska → **HIL** (nie pętlimy
w nieskończoność); goal raportuje nierozwiązywalny task. Próg `K` =
`implement.maxRepairIterations` w `fd-config.json`; granularność commita na feature
branchu jest stała (1 commit = task, §4) — kawałki żyją w worktree. K obejmuje też falę napraw
przy domknięciu (§4.1).

---

## 6. Granica mutowalności

- **W obrębie bieżącego runu** (feature branch, przed shipem): kod dostarczony we
  wcześniejszych falach jest **mutowalny** — taski naprawcze go modyfikują.
- **Po zakończonej implementacji** (wszystkie taski `implemented` / `shipped`): kod jest
  **forward-only** (`SPEC.md` §2.5) — ścieżka grill → to-tasks → implement jest dla tej
  funkcjonalności zamknięta; zmiany domyka nowa funkcjonalność.
- Ship funkcjonalności (merge feature brancha do main) wykrywa mechanicznie detekcja
  shipu (`SPEC.md` §2.4, krok 1).

---

## 7. Maszyna stanów

```
entry → guard(config) → reconcile-detect(hashe + ship) ──drift──→ block(„/to-tasks")
      → enforce(readiness.tasks, upstream delivered)
      → feature branch (pierwszy run: HIL bazy)
      → recovery(waveInProgress): done-set skip + salvage(breadcrumb→re-gate→merge|discard)
      → goal (main thread) { for wave in topo(SC):
            run = Workflow(scripts/wave-implement.mjs) | fallback: subagenty + worktree
                  [worktrees (overlap → serializacja) → per-task self-gate (AC+lint) → breadcrumb]
            → main thread: per-task squash-merge (merger) + zapis inkrementalny
                           → per-fala SCOPED CI (fallback pełne) + AC domykane falą
            → pass → next wave | fail → diagnoza → run(fala napraw) → autosquash + rekonsyliacja SHA
            → HIL między runami }
      → all tasks implemented → domknięcie: pełne CI → CR całości (≥1 skill, diff po ścieżce)
                                → fala napraw → pełne CI → impl.cr=pass, waveInProgress=false
                                └─ K-fail → HIL(escalate)
```

Task wchodzi z `/to-tasks` jako `ready`; goal ustawia `in-progress` na starcie fali i
`implemented` po zielonym self-gate **i** merge'u tego taska; `shipped` ustawia dopiero detekcja
shipu po merge do main (`SPEC.md` §2.4). Porażka trzyma taska poza `implemented` do czasu naprawy
lub eskalacji.

---

## 8. Bramki

| Bramka | Gdzie | Typ |
|---|---|---|
| Brak / niepoprawny config | wejście | block |
| Migracja schematu (niższy → apply; wyższy → halt) | wejście | HIL / block |
| Wybór funkcjonalności (>1, brak dopasowania) | wejście | HIL |
| Wybór bazy brancha (pierwszy run) | wejście | HIL |
| Niejednoznaczny ship (np. squash-merge) | wejście, reconcile krok 1 | HIL |
| Drift specu / tasków w detekcji (bez apply) | wejście | block |
| Enforcement DoR tasków + upstream `delivered` | wejście | block |
| Niejednoznaczny upstream `delivered` (squash-merge) | wejście, cross-feature | HIL |
| Re-check bramki salvage przy recovery | wejście | block (per task) |
| Per-task AC (pokryte w całości) + lint zmian = self-gate | fala | block |
| Per-fala CI — scoped (fallback pełne) + AC domykane falą | fala | block |
| K-iter fail — eskalacja | pętla napraw | HIL |
| Pełne CI przy domknięciu | domknięcie | block |
| Code review całości przy domknięciu (≥1 skill) | domknięcie | gate |

---

## 9. Wyjście / checkpoint

Raport: zaimplementowane taski (z SHA commitów `Task: <id>`); per-fala CI z informacją **czy poszło
scoped, czy fallbackiem pełnym**; na wznowionej sesji — które taski **salvage'owane** vs **re-run**;
wynik **domknięcia** (pełne CI + CR całości); ewentualne eskalacje; czy run zdegradował do subagentów.
Feature branch z całością pracy jako liniowa historia 1-commit-per-task. Sugestia następnego kroku
prozą — self-review całości, potem `/to-prs` — bez uruchamiania.
