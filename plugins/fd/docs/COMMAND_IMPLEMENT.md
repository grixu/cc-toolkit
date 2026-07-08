# `/implement`

Implementuje wszystkie gotowe taski funkcjonalności w **jednym pełnocyklowym runie silnika**
(wersjonowany skrypt `scripts/wave-implement.mjs` przez tool Workflow): fale z zależności
tasków, worktree per task, szeregowy squash-merge per fala, per fala smoke (typecheck+build)
+ weryfikacja AC z ograniczoną pętlą napraw, a po ostatniej fali — PIERWSZE pełne CI, code
review całości, poprawki mechaniczne, autosquash i finalne pełne CI, wszystko wewnątrz tego
samego runu. Run wraca do głównej konwersacji **tylko** gdy
skończył, gdy wewnętrzny budżet wymusił checkpoint (auto-relaunch, bez pytania) albo gdy
decyzji naprawdę potrzebuje człowiek. Sesja przerwana w trakcie **odtwarza postęp z trailerów
gita** i relaunchuje resztę.

---

## 1. Cel

Dostarczyć kod wszystkich tasków maksymalnie autonomicznie — z walidacją (AC per task, CI per
fala, jedno CR całości przy domknięciu), z atomowymi, rewertowalnymi commitami i samonaprawczą
pętlą — przerywając userowi wyłącznie przy problemach krytycznych: luka architektoniczna w
specu, wyczerpanie iteracji napraw, judgment call z code review.

---

## 2. Prekondycje (main thread)

- Config poprawny (w tym `tooling.*` z nullable `tooling.typecheck` — zasila smoke fal).
- Wskazanie funkcjonalności: argument `<slug>` / heurystyka / HIL (`SPEC.md` §3.1).
- **Reconcile-detekcja (wejście, bez apply):** przelicz hashe + ship-detekcja
  (`SPEC.md` §2.4) — flipy shipu zapisuje skrypt
  `record-impl.mjs ship` (nigdy ręczna edycja JSON); wykryty drift specu / tasków — w tym
  rozjazd `contentHash` pliku taska (ręczna edycja generated-only — `SPEC.md` §2.6) → twardy
  block „uruchom `/to-tasks`". `/implement` niczego nie apply'uje na taskach.
- **Enforcement DoR tasków:** czyta `readiness.tasks` wobec świeżo policzonych hashy;
  `blocked` lub stale → odmawia, kieruje do `/grill` / `/to-tasks`.
- **Rozszerzenie cross-feature:** każdy konsumowany `Y#EL@vN` musi być `delivered` w
  manifeście Y — inaczej bloker; delivered liczone na żywo (`CROSS_FEATURE.md` §5).
  Tu spłaca się doradztwo kolejności: „zbuduj Y przed X".
- **Feature branch (pierwszy run: adopcja świeżo odbitego brancha, inaczej HIL):** najpierw
  **adopcja bez żadnego pytania** — user siedzący na branchu świeżo odbitym pod tę robotę ma go
  dostać jako feature branch wprost. Warunki (wszystkie): bieżący `git rev-parse --abbrev-ref
  HEAD` to branch (nie detached) różny od `prs.baseBranch`; odbity z bazy i z nią aktualny
  (`git merge-base --is-ancestor <prs.baseBranch> HEAD`); **świeży — zero własnych commitów**
  (`git rev-list --count <prs.baseBranch>..HEAD` == 0; branch z własnymi commitami może być
  niezwiązaną robotą, np. PoC — nigdy nie porywamy go po cichu); nie jest zapisany jako
  `state.json.branch` innej funkcjonalności. Adopcja = zapis bieżącej nazwy przez
  `record-impl.mjs branch <featureDir> --set <nazwa>` (nigdy ręczna edycja state.json),
  zero tworzenia, zero HIL; raport mówi „branch zaadoptowany". Inaczej dwa
  kształty HIL: branch odbity i aktualny, ale **z własnymi commitami** → pytanie [adoptuj mimo
  to / utwórz `<branchTemplate>` z bazy / inny ref]; pozostałe przypadki (na bazie / detached /
  za bazą / guard) → HIL „utwórz `<branchTemplate>` na jakiej bazie?" (opcje: `prs.baseBranch`
  default, bieżący branch, inny ref walidowany `git rev-parse --verify`). **Kolizja nazwy:**
  target `<branchTemplate>` już istnieje w gicie, albo wiszą worktree/branche `fd/<slug>/*`
  mimo `branch:null` (residuum starego przerwanego runu) → HIL [świeża nazwa z sufiksem /
  reset istniejącego do bazy / buduj na nim / stop] — nigdy cichy reuse ani clobber.
- **Recovery — odtworzenie z gita + relaunch reszty:** `waveInProgress == true` na wejściu ⇒
  **nigdy** zimny restart. Done-set liczony z trailerów
  (`git log <base>..<featureBranch> --format='%H %(trailers:key=Task,valueonly)'`) i zapisywany
  przez `record-impl.mjs record`; osierocone `fixup!` bez trailera → defensywny autosquash przed
  zaufaniem `impl.commits`; leftover branche `fd/<slug>/T-*` z breadcrumbem `Fd-Gate: pass`
  re-walidujemy tanią bramką per task → pass ⇒ merger scala, zapis `record-impl.mjs record`
  (salvage), fail / brak breadcrumba ⇒ discard; worktree kasujemy tylko dla niesalvage'owanych;
  potem **jeden świeży pełnocyklowy run** z resztą tasków (dep wskazujący scalony task = już
  zaspokojony). Wszystkie taski `implemented`, a `impl.cr` niepełny ⇒ nie ma czego
  implementować — kroki domknięcia przez fallback subagentowy, zapis identyczny.
- Cold-start z workspace'u.

---

## 3. Silnik: jeden run = pełny cykl; decyzje w głównej konwersacji

- **Bez osobnego artefaktu planu** — fale liczy silnik **wprost z `deps` tasków** (pochodna
  DAG-a SC: fala = warstwa topologiczna). Mapa SC jest jedynym „planem".
- **Zakres runu (granica):** run robi **cały cykl** wewnątrz — per fala: seryjne przygotowanie
  worktree (odbicie z feature brancha PO merge'ach poprzedniej fali), agenty taskowe
  (self-gate + breadcrumb), **szeregowy squash-merge** (fd:merger, raz na falę, kolejność
  autorytatywna), bramka fali — **dwa agenty równolegle**: smoke (`tooling.typecheck` +
  `tooling.build`, każde nie-null; oba null ⇒ GŁOŚNY skip w raporcie fali) i **weryfikator AC**
  (AC domknięte tą falą, dowód celowanym testem lub — gdy test nie może istnieć — inspekcją
  kodu; unverified = porażka `ac:<id>`), **ograniczona pętla napraw**
  (K = `implement.maxRepairIterations`; taski niescalone naprawiają się we własnych worktree,
  scalony kod — jako fixupy na feature branchu, ściśle szeregowo); po ostatniej fali —
  domknięcie (§4.1). Lint i pełne testy celowo NIE biegną między falami: oceniają stan końcowy
  i fałszywie flagują stany pośrednie (np. eksporty, których konsumenci przyjdą w późniejszej
  fali), a fałszywa czerwień karmi pętlę napraw. Agenty taskowe biegną jako subagent
  **`fd:implementer`** — obcięta lista tooli (natywne pliki/shell + wspierane MCP: `context7`,
  `firecrawl`, `codebase-memory-mcp`), żeby stały kontekst startowy każdego agenta był mały
  (run polowy: baseline 43–92k tokenów przy dziedziczeniu wszystkiego vs 21k obciętego mergera,
  re-czytany przy każdym z ~90 wywołań na agenta). Etapy mechaniczne — przygotowanie worktree,
  merger, smoke — biegną na **niskim effort** rozumowania. Main thread zostaje z:
  prekondycjami, budową args, zapisem stanu na granicach runu (przez `record-impl.mjs`,
  z trailerów `Task:`) i każdym HIL. **„Jeden run" nazywa własność wznawialności, nie
  gwarancję czasu:** cykl jest logiczny — duża funkcjonalność (dziesiątki tasków, eskalacje
  architektoniczne, limity sesji) realnie domyka się **serią launchy** z HIL pomiędzy, a każdy
  kolejny startuje dokładnie tam, gdzie trailery mówią, że skończył poprzedni.
- **Kontrakt args/zwrotu** (jedna wartość `args`; może dotrzeć jako string JSON — skrypt
  parsuje defensywnie). **Protokół launchu (obrona przed korupcją):** args powstają raz jako
  kanoniczny `<featureDir>/engine-args.json` pisany **Write toolem** — nigdy heredokiem Basha
  (swobodny tekst decyzji HIL potrafi wpaść na hooki repo, a ręczne przeklejanie JSON-a
  skorumpowało w teście polowym krawędź `serializeAfter` w self-referencję); do wywołania
  Workflow trafia zawartość pliku **verbatim**, każda zmiana = najpierw regeneracja pliku.
  `tasksCount` (= `tasks.length`) jedzie w args jako tripwire obcięcia.
  - **args:** `{ mode: "full"|"repair", featureDir, slug, repoRoot, featureBranch, baseBranch,
    tasksCount, tasks: [{ id, worktree, branch, taskFile, deps, serializeAfter?, acIds, diagnosis?,
    decision? }], gate: { lintChanged: true }, ci: { typecheck, lint, test,
    build, packageManager } (komendy `tooling.*` verbatim, null = potwierdzony brak),
    gateDebt?: { smoke, acs }, graphMcp (`true` ⇔ `mcp.detected` zawiera `codebase-memory-mcp` —
    agenty taskowe pobierają wtedy kod przez graf), worktreeSetup, worktreeCleanup,
    codeReview: { skills }, repair: { maxIterations }, close: true }`. Per task: `deps` = intra-feature producenci
    (z krawędzi sc-map), `acIds` = AC pokryte w całości, `decision` = odpowiedź człowieka przy
    relaunchu po eskalacji. `gateDebt` = czerwona resztka bramki eskalowanej fali poprzedniego
    runu (skopiowana z jej raportu fali) — silnik spłaca ją (świeży smoke + re-weryfikacja +
    pętla napraw) **przed falą 0**, żeby nowe worktree nie były cięte ze znanego-czerwonego
    brancha.
  - **zwrot (dyskryminowany po `status`):** `completed` (+ `waves`, `tasks`,
    `close: { fullCi, cr, finalCi }`) | `continue` (+ `reason`, `remaining` — budżet agentów
    wyczerpany; **zapis i natychmiastowy relaunch z resztą, zero HIL**) | `escalated`
    (+ `escalations: [{ kind, taskId?, wave?, question, options, context }]`, `remaining`;
    wpis raportu eskalowanej fali niesie `gateDebt`, gdy jej bramka skończyła na czerwono).
- **Eskalacje (jedyne przerwania w środku cyklu):** `architectural` (agent taskowy trafił na
  lukę specu z >1 sensownym rozwiązaniem — zatrzymał się zamiast zgadywać → AskUserQuestion,
  relaunch z odpowiedzią jako `decision` taska; bramka eskalowanej fali pobiegła, naprawa NIE —
  czerwony werdykt kopiuje się do `args.gateDebt` relaunchu, `--gate` folduje się tylko dla
  fal z zieloną bramką), `repair-exhausted` (fala/domknięcie/odziedziczony dług bramkowy
  czerwone po K iteracjach → user decyduje), `cr-judgment` (finding CR wymagający decyzji →
  prezentacja + plik raportu), `engine-failure` (agent nie zwrócił wyniku — silnik **nie widzi
  przyczyny**: `agent()` daje null tak samo dla killa, błędu API i limitu konta; **najpierw
  klasyfikuj**: zbieg z limitem sesji ⇒ to nie bug — branch i trailery nietknięte, raportuj
  „limit — poczekaj do resetu i relaunch", bez straszącego HIL; brak sygnału limitu ⇒ salvage
  z trailerów, relaunch reszty), `invalid-args` (walidacja args padła — self-referencja,
  niezgodny licznik; **nic nie pobiegło** → regeneruj engine-args.json i relaunch bez HIL;
  HIL dopiero, gdy błąd reprodukuje się z czystych wejść). Na **każdym** zwrocie najpierw
  utrwal postęp (trailery → `record-impl.mjs`), potem działaj wg statusu.
- **Dyrektywy agenta taskowego** (jedno źródło prawdy — skrypt osadza je verbatim, fallback
  reużywa): plik taska jest samowystarczalny (bez re-grepowania ścieżek już nazwanych w treści /
  `codeDeps`) i jest **jedynym materiałem fd** — zakaz czytania `spec.md`, cudzych tasków
  i stanu workspace'u (luka w tasku = diagnoza/eskalacja do zgłoszenia, nie licencja na
  polowanie; run polowy: 3 agenty czytały cały spec, jeden — cztery cudze taski); **pobieranie
  kodu** przy `graphMcp: true` przez graf (`search_graph`/`search_code`, `get_code_snippet`,
  `trace_path`) zamiast Grep/Glob/shellowych `cat | grep` — Read zostaje dla edytowanych plików,
  `codeDeps` i configów, a własne niezacommitowane zmiany worktree czyta się Readem/gitem, nie
  grafem (graf indeksuje checkout repo-root); **batch edits**, potem typecheck + lint **raz** na
  końcu; **stub, nie odtwarzaj**
  brakującego pliku zależności; commit atomowo z rationale; **reguła eskalacji** — spec milczy,
  a rozwiązań jest kilka ⇒ `status: "escalated"` z pytaniem/opcjami/kontekstem, zero breadcrumba;
  **finalny akt po zielonym self-gate = jeden pusty commit-breadcrumb** z trailerami
  `Task: <id>` + `Fd-Gate: pass` (self-gate fail ⇒ brak breadcrumba, `status: "failed"` + diagnoza).
- **Dostępność i fallback:** dostępność dynamic workflows wykrywa `/config`, `/implement`
  weryfikuje na wejściu. Brak (lub `implement.engine: "subagents"`) → **main thread wykonuje TEN
  SAM pełny cykl sam**, przez subagenty Agent-toolowe: izolacja worktree, te same prompty i
  bramki (taski także tu jako `fd:implementer`), szeregowe wywołania mergera, własny Bash dla CI,
  pętla napraw i kroki domknięcia —
  eskalacje stają się bezpośrednimi AskUserQuestion. Degradacja raportowana, nie blokuje.
  Orkiestracja: **czekaj bezpośrednio** na zakończenie runu / subagentów — nigdy
  foreground-`sleep`, nigdy polling plików.

---

## 4. Fala i bramki (wewnątrz runu)

**Izolacja i nazwy:** jeden **worktree per task** — ścieżka `<repo>/.fd-worktrees/<slug>/<T-id>`,
branch `fd/<slug>/<T-id>` (pochodne sluga, nie nazwy feature brancha; adopcja nic tu nie
zmienia). Nazwy prekomputuje main thread do `args.tasks`. Worktree fali tworzy silnik
**szeregowo** (równoległe `git worktree add` ścigają się na `.git/worktrees`), z tipa feature
brancha **po** merge'ach poprzedniej fali, z force-remove starych ścieżek i bootstrapem
`implement.worktreeSetup`. Sprzątanie wg `implement.worktreeCleanup` (`always` |
`keep-failed`) wykonuje merger po udanym merge'u; przy recovery sprzątanie **bramkuje** salvage.

**Merge fali = squash (szeregowo, raz na falę):** silnik woła **mergera** (`fd:merger`) raz na
falę z passing taskami w kolejności autorytatywnej; merger scala każdy branch jako **1 commit
per task** z trailerem `Task: <id>` (rationale z commitów kawałków, pusty breadcrumb
wyłączony) i raportuje per task `merged | conflict | blocked` + SHA. Zero wyścigów. Zapis
manifestu dzieje się na granicy runu, z trailerów.

**Kanoniczna tożsamość commita = trailer `Task: <id>`;** `impl.commits` to **pochodny cache**
odświeżany przez main thread na każdej granicy runu (`git log <base>..<featureBranch>`,
`%(trailers:key=Task,valueonly)`, zapis `record-impl.mjs record`); >1 commit na trailer
(konflikt autosquashu) ⇒ wszystkie SHA w tablicy taska.

**Overlap plikowy w fali** (dwa deterministyczne pre-passy main threadu przed launchem,
best-effort z `codeDeps` + ścieżek w treści). **Krawędzie WYŁĄCZNIE z overlapu konkretnego
pliku** — ścieżka katalogowa (np. `backend/src/cerbos/`) nigdy nie tworzy krawędzi, jest
kontekstem odczytu: git nie konfliktuje na dwóch różnych plikach w jednym katalogu, a
prefix-match katalogu over-serializuje cały wspólny obszar (test polowy: 54 fałszywe pary
z jednego katalogowego `codeDep`, zabity paralelizm fali). Dwa taski tworzące **ten sam nowy
plik** to nadal overlap exact-file. Pominięte pary katalogowe są nazwane w narracji launchu
(„zignorowano N par katalogowych") — nigdy ciche.
- **write ∩ write** — dwa taski piszące ten sam plik są serializowane.
- **read-after-write** — task, którego `needs` przecina `willWrite` peera bez istniejącej
  krawędzi `consumes`, jest **serializowany po peerze** (`tasks[].serializeAfter`) albo
  **odłożony do następnej fali**.
Uczciwe zastrzeżenie: mapowanie element→plik jest parsowane z treści best-effort — **główną**
gwarancją jest reguła stuba + bramki merge/CI, nie ta heurystyka. Refy `serializeAfter` między
falami silnik filtruje (kolejność fal już je gwarantuje).

**`state.json.waveInProgress`** = `true` od pierwszego launchu (zapis `record-impl.mjs phase`),
`true` przez relaunche `continue`/`escalated` (to sygnał crasha), `false` **dopiero przy
`completed` z domknięciem**; `phase = "implementing"` od pierwszego launchu.

**Freeze specu na czas runu:** przy `waveInProgress` spec jest zamrożony — zmiany wymagań
(`/grill`) lądują w specu jako zwykła edycja i podejmuje je dopiero następny `/to-tasks`
(re-entry `/implement` wykryje drift i zablokuje — `SPEC.md` §2.4), nie działający silnik.

**Trywialny ficzer:** 1 task → 1 fala z 1 taskiem — jeden worktree, zero równoległości; ten sam
silnik, cykl i bramki.

**Bramki task → fala:**
- *Per task = self-gate agenta taskowego (breadcrumbowany):* agent waliduje **AC pokryte w
  całości przez task** (jego `acIds`) + **lint tylko zmienionych plików**, po czym pisze
  breadcrumb `Fd-Gate: pass`. AC rozpięte na >1 task czekają na bramkę fali.
- *Per fala, po merge = dwa agenty równolegle:* **smoke** (`tooling.typecheck` +
  `tooling.build`, każde nie-null, w korzeniu repo — złamane typy/API to jedyna klasa błędów,
  która się kumuluje, bo worktree następnej fali tnie się z tego brancha; oba null ⇒ skip
  GŁOŚNY, nazwany w raporcie fali) oraz **weryfikator AC** (każde AC domknięte tą falą, dowód
  najsilniejszą dostępną metodą: `covered-by-test` — odpal celowany test, nigdy cały suite —
  lub `verified-by-inspection`, gdy test nie może sensownie istnieć; `unverified` = porażka
  `ac:<id>`; brakujący test dla testowalnego zachowania to unverified, nie inspekcja). Metody
  weryfikacji lądują w raporcie. Deklarację „pass" przy niezerowym exicie / niezweryfikowanym
  AC silnik zbija na fail.
- *Pętla napraw (ograniczona, w runie):* taski failed i konflikty merge naprawiają się **we
  własnych worktree** (równolegle, potem ponowny merge); czerwony smoke i niezweryfikowane AC
  siedzą na scalonym kodzie, więc naprawia je **jeden szeregowy agent na feature branchu**.
  Chirurgia commitów (agent NAJPIERW buduje mapę task→commit z trailerów `Task:`):
  naprawa w plikach jednego taska → `git commit --fixup <commit-taska>`, jeden fixup na
  winowajcę (nigdy zbiorczy commit); naprawa **cross-cutting** (pliki >1 taska lub spoza
  footprintów) → zwykły commit **integration-fix**: subject `fix(integration): …`, trailery
  `Task: <winowajca>` + `Integration-Fix: true` — wjeżdża do PR-a winowajcy po trailerze,
  nigdy nie jest autosquashowany, a czysta zmiana i adaptacje blast radius pozostają osobno
  recenzowalne; pliki utworzone przez PÓŹNIEJSZY task odłamują się na trailer tego taska
  (jeden commit rozpięty na właścicieli psuje rebase stosu PR); porażka `ac:<id>` fixupuje na
  commit taska-właściciela; **nigdy nie kasuj/nie osłabiaj testu, żeby bramka przeszła** —
  czerwony test to diagnoza. Potem re-run smoke + **re-weryfikacja WSZYSTKICH AC domkniętych
  falą** (nigdy tylko wciąż-niezweryfikowanych — naprawa mogła skasować dokładnie ten test,
  który krył AC, a żadna inna bramka nie zauważy testu, który już nie biegnie); maksymalnie
  K iteracji; wyczerpanie → `escalated`. **Przy eskalacji fali** bramka biegnie, pętla napraw
  nie (decyzja człowieka może ją unieważnić) — czerwony werdykt wraca jako `gateDebt` raportu
  fali, spłacany na starcie relaunchu (przed falą 0, ta sama pętla, to samo K).
- *Code review NIE jest bramką per fala* — jest jedno, nad całością, przy **domknięciu** (§4.1).

**Rewertowalność:** w worktree implementacja commitowana **atomowo, co kawałek**, z rationale w
treści commita; po squashu jednostką rewertu na feature branchu jest **task**.

### 4.1. Domknięcie funkcjonalności (wewnątrz runu)

Po scaleniu i zazielenieniu wszystkich fal silnik domyka funkcjonalność w tym samym runie:
1. **Pełne CI** (`tooling.lint` + `tooling.test` + `tooling.build`, bez filtrowania) —
   PIERWSZY pełny pipeline w życiu feature'a, więc czerwień jest tu bardziej prawdopodobna:
   agent napraw startuje od mapy task→commit z trailerów (atrybucja na całym diffie), a
   eksportowany-ale-nieużywany symbol mapujący się na element specu / kontrakt `produces` NIE
   jest martwym kodem (konsumenci mogą żyć w przyszłym featurze) — nigdy nie kasowany
   automatycznie. Fail ⇒ szeregowa pętla napraw na feature branchu (próg K), dalej czerwone ⇒
   `escalated`.
2. **CR całości (bramka):** silnik zapisuje `git diff <base>...<feature>` (z listą plików) do
   `<featureDir>/cr-diff.patch`; agent CR dostaje **ścieżkę pliku** i go `Read`-uje — **diff
   nigdy nie jest inline'owany**. Agent CR wywołuje **każdy** skill z `codeReview.skills` **po
   nazwie przez Skill tool** (≥1), pisze pełny raport do `<featureDir>/cr-report.md` i
   klasyfikuje findingi: `mechanical` (obiektywnie naprawialny) | `judgment` (wymaga człowieka).
   **Bez** zagnieżdżonego fan-outu i **bez** researchu sieciowego.
3. **Findingi:** `judgment` → `escalated` (po jednym na finding, z plikiem raportu);
   `mechanical` → szeregowy agent napraw na feature branchu (commity `--fixup`). Nieużywany
   eksport niosący kontrakt to zawsze `judgment`, nigdy `mechanical`.
4. **Autosquash:** `git rebase --autosquash <base>` wciąga fixupy w oryginalne commity
   (konflikt → abort rebase'u, `escalated`); silnik weryfikuje, że każdy trailer `Task:` przeżył.
5. **Finalne pełne CI** — potwierdzenie, że drzewo dalej zielone po fixach + autosquashu;
   czerwone ⇒ `escalated`.

Zwrot `completed` niesie `close: { fullCi, cr, finalCi }`; main thread zapisuje `--cr pass`,
utrwala werdykty feature-level przez `record-impl.mjs close <featureDir> --full-ci pass
--cr pass --final-ci pass` (blok `state.close`, na którym bramkuje `/to-prs`; zapis
przyrostowy — eskalowane domknięcie utrwala to, co już pobiegło), odświeża `impl.commits`
z po-autosquashowych trailerów, flipuje `waveInProgress = false`
i raportuje. `phase` **zostaje `implementing`** — flip do `shipped` to nadal robota detekcji
shipu (`SPEC.md` §2.4), po merge feature brancha do `baseBranch`.

**Wznowienie:** wejście z wszystkimi taskami `implemented` i niepełnym `impl.cr` ⇒ kroki
domknięcia przez fallback subagentowy (silnik potrzebuje tasków), zapis identyczny.

---

## 5. Naprawa (wewnątrz runu)

Agent walidujący przy porażce (AC / merge conflict / CI / CR finding) zwraca **strukturalną
diagnozę**: konkretna przyczyna, lokalizacja, kontekst. Silnik dzieli naprawy: taski
**niescalone** (failed self-gate, konflikt merge) → agent naprawczy w worktree oryginalnego
taska (równolegle, ponowny merge przez mergera); **scalony kod** (czerwone CI, mechaniczne
findingi CR) → **jeden szeregowy agent na feature branchu**, fixupami.

**Naprawy są efemeryczne:** nie są nowymi węzłami SC, nie dostają ID elementów, referują
oryginalny task. Na feature branch wchodzą jako **fixup do commita swojego taska** — przy
domknięciu autosquash wciąga je w oryginalny commit (drzewo końcowe identyczne, więc werdykt CI
pozostaje ważny); konflikt autosquashu → osobny commit z tym samym trailerem `Task:` (partycja
`/to-prs` obejmuje wtedy >1 commit taska). Wyjątek: naprawa **cross-cutting** ląduje jako
jawny commit `fix(integration): …` z trailerami `Task: <winowajca>` + `Integration-Fix: true`
— celowo poza autosquashem; partycja `/to-prs` wciąga go do PR-a winowajcy po trailerze.

**Rekonsyliacja SHA:** na każdej granicy runu (i po autosquashu) `impl.commits` jest przeliczany
z trailerów i zapisywany przez `record-impl.mjs record` — SHA się zmieniają, więc cache w
manifeście trzeba odświeżyć.

**Eskalacja:** po K nieudanych iteracjach napraw (K = `implement.maxRepairIterations`; obejmuje
też pętlę przy domknięciu) → zwrot `escalated` (`repair-exhausted`) → **HIL** w main thread.
Nigdy pętla bez końca.

---

## 6. Granica mutowalności

- **W obrębie bieżącego runu** (feature branch, przed shipem): kod dostarczony we
  wcześniejszych falach jest **mutowalny** — naprawy go modyfikują.
- **Po zakończonej implementacji** (wszystkie taski `implemented` / `shipped`): kod jest
  **forward-only** (`SPEC.md` §2.5) — ścieżka grill → to-tasks → implement jest dla tej
  funkcjonalności zamknięta; zmiany domyka nowa funkcjonalność.
- Ship funkcjonalności (merge feature brancha do main) wykrywa mechanicznie detekcja
  shipu (`SPEC.md` §2.4, krok 1) i zapisuje `record-impl.mjs ship`.

---

## 7. Maszyna stanów

```
entry → guard(config) → reconcile-detect(hashe + ship) ──drift──→ block(„/to-tasks")
      → enforce(readiness.tasks, upstream delivered)
      → feature branch (pierwszy run: adopcja świeżo odbitego | HIL [własne commity / baza / kolizja nazwy])
      → recovery(waveInProgress): done-set z trailerów + defensywny autosquash + salvage → relaunch reszty
      → record-impl phase(implementing, waveInProgress=true)
      → run = Workflow(scripts/wave-implement.mjs, args={tasksCount, tasks+deps+acIds, ci=tooling,
              gateDebt?, close:true})
              │  na starcie: walidacja args (self-ref/licznik → zwrot invalid-args, nic nie pobiegło)
              │    → spłata gateDebt (świeży smoke + re-weryfikacja AC + pętla napraw) przed falą 0
              │  wewnątrz runu, per fala:
              │    prepare worktrees (szeregowo, z tipa po merge'ach) → agenty taskowe (self-gate+breadcrumb)
              │    → merger (raz na falę, squash serial) → smoke (typecheck+build) ∥ weryfikacja AC
              │      (exit-code / verdict reconciliation)
              │    → pętla napraw ≤K (worktree | feature-branch: fixupy + commity integration-fix;
              │      re-weryfikacja WSZYSTKICH AC fali) → następna fala
              │    (eskalacja fali: bramka biegnie, naprawa nie — czerwień wraca jako gateDebt)
              │  po ostatniej fali: pełne CI → CR (skille, diff z pliku) → mechanical fixes
              │    → autosquash → finalne pełne CI
              ▼
      zwrot: completed ──▶ record(trailery, --gate/--cr) → record-impl close → waveInProgress=false → raport
             continue  ──▶ record(trailery) → relaunch(remaining) [bez HIL]
             escalated ──▶ record(trailery) → klasyfikacja: limit sesji→„czekaj i relaunch" (bez HIL)
                           | invalid-args→regeneracja engine-args.json + relaunch (bez HIL)
                           | HIL(architectural[+gateDebt do args] | repair-exhausted | cr-judgment
                                | engine-failure→salvage) → relaunch(remaining+decision)
      | fallback (brak Workflow / engine=subagents): main thread wykonuje ten sam cykl subagentami
```

Task wchodzi z `/to-tasks` jako `ready`; silnik go przepracowuje, a main thread zapisuje
`implemented` z trailera na najbliższej granicy runu (`in-progress` istnieje dla
obserwowalności; przy zapisie na granicach może zostać przeskoczony). `shipped` ustawia dopiero
detekcja shipu po merge do main (`SPEC.md` §2.4). Porażka trzyma taska poza `implemented` do
czasu naprawy lub eskalacji.

---

## 8. Bramki

| Bramka | Gdzie | Typ |
|---|---|---|
| Brak / niepoprawny config | wejście | block |
| Migracja schematu (niższy → apply; wyższy → halt) | wejście | HIL / block |
| Wybór funkcjonalności (>1, brak dopasowania) | wejście | HIL |
| Wybór bazy brancha (pierwszy run) | wejście | HIL (pomijany przy adopcji świeżo odbitego brancha) |
| Adopcja brancha z własnymi commitami | wejście | HIL |
| Kolizja nazwy feature brancha / residuum `fd/<slug>/*` | wejście | HIL |
| Niejednoznaczny ship (np. squash-merge) | wejście, reconcile krok 1 | HIL |
| Drift specu / tasków w detekcji (bez apply) | wejście | block |
| Enforcement DoR tasków + upstream `delivered` | wejście | block |
| Niejednoznaczny upstream `delivered` (squash-merge) | wejście, cross-feature | HIL |
| Re-check bramki salvage przy recovery | wejście | block (per task) |
| Per-task AC (pokryte w całości) + lint zmian = self-gate | w runie, fala | block |
| Per-fala smoke (typecheck + build; oba `null` ⇒ głośny skip) | w runie, fala | block |
| Per-fala weryfikacja AC (test lub inspekcja; unverified ⇒ naprawa) | w runie, fala | block |
| Bramka eskalowanej fali (biegnie; naprawa odroczona jako `gateDebt`) | w runie, fala | block (spłata przy relaunchu) |
| Spłata gateDebt (odziedziczona czerwień, przed falą 0) | w runie, wejście | block |
| Rekonsyliacja werdyktu (pass + niezerowy exit / unverified AC ⇒ fail) | w runie, fala + domknięcie | block |
| Walidacja args (`invalid-args`: self-ref, licznik) | launch → wczesny zwrot | auto-regeneracja + relaunch (bez HIL) |
| Luka architektoniczna znaleziona przez agenta taskowego | w runie → wczesny zwrot | HIL |
| Wyczerpanie K iteracji napraw (fala, domknięcie lub gateDebt) | w runie → wczesny zwrot | HIL |
| Pełne CI przy domknięciu | w runie, domknięcie | block |
| Code review całości przy domknięciu (≥1 skill) | w runie, domknięcie | gate |
| Finding CR typu judgment | w runie → wczesny zwrot | HIL |
| Checkpoint budżetu agentów | w runie → wczesny zwrot | auto-relaunch (bez HIL) |

---

## 9. Wyjście / checkpoint

Raport: zaimplementowane taski (z SHA commitów `Task: <id>`); per-fala status smoke'a (w tym
**głośne skipy**) + werdykty AC z **metodą, która dowiodła każdego AC** (test / inspekcja)
i ile iteracji napraw zużyto; ewentualne checkpointy `continue` (policz je — inaczej są dla usera niewidoczne); na
wznowionej sesji — które taski **salvage'owane** vs **re-run**; wynik **domknięcia** (pełne CI +
CR całości: findingi + plik raportu); eskalacje i ich rozstrzygnięcia; czy run zdegradował do
subagentów. Feature branch z całością pracy jako liniowa historia 1-commit-per-task (plus
ewentualne jawne commity `Integration-Fix`, każdy na trailerze swojego winowajcy). Sugestia
następnego kroku prozą — self-review całości, potem `/to-prs` — bez uruchamiania.
