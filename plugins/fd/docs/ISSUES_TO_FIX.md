# ISSUES_TO_FIX — przegląd specyfikacji fd2 (2026-07-03)

Wynik przeglądu kompletności i spójności zestawu spec (14 plików), zweryfikowany
względem oficjalnej dokumentacji Claude Code (workflows, sub-agents) i aktualnych
limitów modeli. Status per pozycja: `[ ]` otwarte / `[x]` rozstrzygnięte (dopisać
decyzję i miejsce zmiany).

Wszystkie sekcje (A–D) rozstrzygnięte 2026-07-04. Otwarte pozostają zadania
implementacyjne wskazane w decyzjach (m.in. pliki formatów z B4, rename katalogu z C7).

**Runda 2 (2026-07-04): sekcje E–G** — znaleziska drugiego przeglądu (platforma po
scaleniu komend ze skillami, luki modelu, ryzyka implementacyjne). Wszystkie
rozstrzygnięte 2026-07-04; zmiany naniesione na zestaw spec tego samego dnia.

---

## A. Luki logiczne w modelu

### A1. Nikt nie ustawia `shipped` / `delivered` ⛔

- [x] Model opiera się na statusach, których żadna komenda nie ustawia:
  - `SPEC.md` §2.3: „task shipped jest immutable" — ale `shipped` nie występuje w
    maszynie stanów taska ani w żadnym flow.
  - `SPEC.md` §4.4: `delivered` elementu ⇔ producent shipped → element nigdy nie
    wyjdzie z `pending`.
  - `CROSS_FEATURE.md` §5: DoR `/implement` X wymaga `delivered` w manifeście Y —
    warunek nigdy niespełnialny; cross-feature martwy od pierwszego dnia.
  - Granica forward-only (§2.5, merge do main) niewykrywalna → reconcile nie odróżni
    regen-in-place od trwałego taska korygującego.
- Proces kończy się na `/to-prs` (branche); merge do main robi człowiek poza pluginem —
  łańcuch stanu się urywa.
- **Decyzja (2026-07-04): wariant (b) + HIL przy niejednoznaczności (squash-merge).**
  Ship-detekcja = krok 1 reconcile: osiągalność `impl.commits` z `baseBranch` → flip
  `implemented → shipped`, `pending → delivered` + `deliveredHash`; nieosiągalne, ale
  podejrzenie scalenia → HIL. Cross-feature DoR liczy delivered na żywo (read-only),
  bo manifest Y może być nieodświeżony. Zmiany: `SPEC.md` §2.3/§2.4/§2.5/§5.5,
  `CROSS_FEATURE.md` §5, `COMMAND_STATUS.md` §4, `COMMAND_IMPLEMENT.md` §7.

### A2. Sprzeczna własność mutacji tasków między komendami ⛔

- [x] `SPEC.md` §2.4 (reconcile z krokiem „Apply: zapisz taski") dzielony przez 4 komendy;
  `COMMAND_GRILL.md` krok 4 każe `/grill` zapisywać taski; `COMMAND_TO_TASKS.md` §7 mówi
  „taski generowane-only" (domena `/to-tasks`); `COMMAND_IMPLEMENT.md` ma bramkę
  „Reconcile-plan przed apply (re-entry) HIL".
- Konsekwencja: mutacja tasków przez `/grill`/`/implement` rusza `tasksHash` → verdykt
  `readiness.tasks` staje się stale, a `SPEC.md` §5.3 zakazuje cichej re-walidacji przez
  konsumenta → `/implement` w logicznym impasie (enforcement wymaga świeżego verdyktu,
  własny reconcile go unieważnia). Dodatkowo kolejność `enforce → reconcile` w maszynie
  `/implement` jest odwrócona: wykrycie staleness wymaga przeliczenia hashy (pół-reconcile).
- **Decyzja (2026-07-04): przyjęte jak proponowano.** Reconcile rozdzielony na detekcję
  (wspólną) i apply o zakresie per komenda: `/grill` + `/from-docs` (re-run) → spec +
  manifest + markowanie stale; `/to-tasks` → jedyny zapis plików tasków; `/implement` →
  detect-only, drift = block, bramka „Reconcile-plan HIL" usunięta, kolejność maszyny
  naprawiona (detekcja → enforce). Zmiany: `SPEC.md` §2.4/§5.5, `COMMAND_GRILL.md`
  (nagłówek, flow 4), `COMMAND_TO_TASKS.md` §7, `COMMAND_IMPLEMENT.md` §2/§7/§8,
  `COMMAND_FROM_DOCS.md` §3.

### A3. `ac-map.json` łamie zasadę projekcji ⚠️

- [x] `SPEC.md` §2.1: mapy AC = „projekcja, liczona, nie autorowana ręcznie", ale
  `GRILLING.md` §1 wymienia `ac-map.json` jako wyjście grilla (decyzja semantyczna).
  W efekcie ac-map jest drugim źródłem prawdy: zmiana mapowania AC↔FR nie rusza
  `spec_hash` → omija inwalidację i walidację pokrycia.
- **Decyzja (2026-07-04): fix zastosowany.** Linia `covers:` w bloku AC (wchodzi w hash
  bloku); `ac-map.json` = projekcja liczona skryptem. Zmiany: `BUILDING_SPEC.md` §2/§5,
  `GRILLING.md` §1/§2, `SPEC.md` §4.1.

### A4. Brak wskazania funkcjonalności i nazwy feature brancha ⚠️

- [x] Żaden `COMMAND_*` nie definiuje, skąd komenda wie, o którą funkcjonalność chodzi
  przy >1 katalogu w `docs/features/` (`/grill`, `/to-tasks`, `/implement`, `/to-prs`,
  `/status`). Cold-start wyklucza kontekst sesji. Do zdefiniowania: argument komendy
  (slug), heurystyka po branchu, albo HIL-wybór z listy.
- [x] Nazwa feature brancha nigdzie nie jest specyfikowana; `state.json` nie wiąże
  feature z branchem — `/implement` nie wie, na czym pracować, `/to-prs` z czego wycinać.
- **Decyzja (2026-07-04):** opcjonalny argument `<slug>` + fallback: jedyna
  funkcjonalność → auto; dopasowanie po `state.json.branch`; inaczej wybór z listy (HIL)
  — nowa `SPEC.md` §3.1 + linia w prekondycjach komend per-feature. Branch:
  `implement.branchTemplate` (default `feat/{slug}`); pierwszy `/implement` tworzy branch
  i zapisuje `state.json.branch`, `/to-prs` czyta stamtąd. Zmiany: `SPEC.md` §3.1/§4.4/§5.5,
  `config.example.jsonc`, `COMMAND_IMPLEMENT.md` §2, `COMMAND_TO_PRS.md` §2 (+ prekondycje
  `/grill`, `/to-tasks`, `/status`).

### A5. Mniejsze niespójności logiczne

- [x] `/grill` jako „jedyny właściciel mutacji specu" (nagłówek `COMMAND_GRILL.md`)
  przeczy re-runowi `/from-docs` (też mutuje spec przez reconcile→apply). Przeformułować.
  → Przeformułowane: `/grill` = interaktywna ścieżka mutacji, druga = re-run `/from-docs`;
  obie przez wspólny blok grilla + reconcile (`COMMAND_GRILL.md` nagłówek, `SPEC.md` §5.3).
- [x] Enum `phase` w `state.json` niezdefiniowany — jedyna znana wartość `"spec"`;
  brak listy wartości i właścicieli przejść (`tasks`? `implementing`? `shipped`?).
  → Zdefiniowane: `spec | tasks | implementing | shipped` + właściciele przejść
  (`SPEC.md` §4.4).
- [x] `idCounters` nie obejmuje `T` — numeracja tasków też musi być append-only
  (identityKey rozwiązuje tożsamość, nie alokację numerów po dropie).
  → Dopisane: `T` w `idCounters`, alokacja append-only (`SPEC.md` §4.3/§4.4).
- [x] Cykl życia waivera nieokreślony: czy waiver na check przeżywa re-walidację po
  zmianie specu (nowy `validatedHash`), czy człowiek waivuje od nowa? Różnica między
  „waiver raz" a „waiver przy każdym grillu".
  → Decyzja (2026-07-04): waiver ginie z `validatedHash`; re-walidacja przed nadpisaniem
  verdyktu porównuje stare `waivedChecks` z nowymi failami i proponuje ponowienie jednym
  potwierdzeniem — zero cichego dziedziczenia (`SPEC.md` §5.2).

---

## B. Konflikty z platformą Claude Code (poparte dokumentacją)

### B1. Grill nie może być subagentem ⛔

- [x] `GRILLING.md` nazywa grill „współdzielonym agentem" prowadzącym interaktywną pętlę.
  Docs (code.claude.com/docs/en/sub-agents): „The following tools […] aren't available
  to subagents, even when listed in the `tools` field: **AskUserQuestion**, EnterPlanMode,
  ExitPlanMode […]".
- **Fix:** grill = współdzielony blok instrukcji komendy w main thread (np. plik w
  `references/` doładowywany przez komendy), NIE definicja w `agents/`. Bramki HIL w
  walidacji analogicznie: subagent walidacyjny zwraca listę wątpliwości, pytanie zadaje
  komenda w main thread.
- Uwagi: fan-out RESEARCHER-a z main thread wspierany; nested subagenty wymagają `Agent`
  w `tools`. Plugin-subagenty nie wspierają frontmatter `hooks`, `mcpServers`,
  `permissionMode` („for security reasons").
- **Decyzja (2026-07-04): fix zastosowany.** Grill = współdzielony blok w main thread,
  dystrybuowany jako plik `references/`; subagent walidacyjny zwraca pass/fail +
  wątpliwości, pytania HIL (waiver, martwe symbole) zadaje komenda. Researcher z
  subagenta walidacji = nested (subagent walidacji musi mieć `Agent` w `tools`).
  Zmiany: `GRILLING.md` (nagłówek, §2), `SPEC.md` §3/§5.3/§7, `RESEARCHER.md` §1.

### B2. Dynamic workflow nie może HIL-ować w trakcie runu ⛔

- [x] `COMMAND_IMPLEMENT.md` §3: silnik „dynamic workflow owinięty w nadrzędny goal"
  z bramkami HIL w środku. Docs (code.claude.com/docs/en/workflows): „**No mid-run user
  input** — Only agent permission prompts can pause a run. For sign-off between stages,
  run each stage as its own workflow".
- **Fix architektury:** pętla „goal" żyje w głównej konwersacji komendy; każda fala
  (lub iteracja napraw) = osobny run Workflow; HIL-e między runami. „Goal/monitor" nie
  jest prymitywem Claude Code — nazwać wprost jako logikę promptu komendy.
- [x] Dostępność: „Dynamic workflows require Claude Code **v2.1.154 or later** […] all
  paid plans […] On Pro, turn them on from the Dynamic workflows row in `/config`";
  wyłączalne przez `disableWorkflows` (także org-wide). → `/config` fd2 wykrywa
  dostępność; `COMMAND_IMPLEMENT` definiuje fallback (sekwencyjne subagenty per task)
  albo twardy block.
- [x] Uprawnienia w fali: „The subagents the workflow spawns always run in `acceptEdits`
  mode and inherit your tool allowlist […] Shell commands […] that aren't in your
  allowlist can still prompt you mid-run." → komendy CI z `tooling.*` proponować do
  allowlisty w kroku walidacji `/config`.
- [x] Przerwanie sesji: „If you exit Claude Code while a workflow is running, the next
  session starts the workflow fresh." → recovery `waveInProgress` musi zakładać zimny
  restart (sprzątanie worktree + re-run fali od stanu z dysku), nie „dokończenie" runu.
- **Decyzja (2026-07-04): goal w głównej konwersacji + fallback subagentowy.** Każda
  fala / iteracja napraw = osobny run Workflow; HIL między runami; „goal" nazwany wprost
  logiką promptu komendy. Dostępność wykrywa `/config` (krok detekcji), `/implement`
  weryfikuje na wejściu; brak → degradacja do Agent tool + izolacja worktree
  (ostrzeżenie, nie block). Allowlista: `/config` proponuje `tooling.*` w kroku
  walidacji. Recovery `waveInProgress` = zimny start: sprzątnięcie worktree + nowy run
  fali od stanu z dysku. Zmiany: `COMMAND_IMPLEMENT.md` (nagłówek, §3/§4/§7),
  `COMMAND_CONFIG.md` §3 (kroki 1 i 4).

### B3. Default `maxContextTokens: 250000` nierealny ⚠️

- [x] Fakty: okno 1M (Fable 5, Opus 4.6–4.8, Sonnet 5/4.6), Haiku 4.5 = 200K;
  max output 128K (Haiku 64K). Konsekwencje dla 250k-tokenowego pliku taska:
  1. niegenerowalny jednym przebiegiem (250k > 128K max output),
  2. ~25% okna 1M zanim agent przeczyta kod; na modelu 200K nie mieści się wcale,
  3. nie do zreview'owania przez człowieka (~1 MB md), a `COMMAND_TO_TASKS.md` §7
     zakłada „user recenzuje",
  4. claim „estymacja za darmo" pomija brak tokenizera w Claude Code — zdefiniować
     estymator (skrypt, ~chars/4) w SPEC/konfigu.
- **Rekomendacja:** default 30–60k tokenów + jawna definicja estymatora.
- **Decyzja (2026-07-04): default `40000` + estymator `tokeny ≈ ⌈znaki/4⌉` liczony
  skryptem na złożonym pliku.** Zmiany: `config.example.jsonc`, `SPEC.md` §6,
  `COMMAND_TO_TASKS.md` §4 (kaskada + „Szacowanie budżetu").
- **Decyzja (2026-07-07, po testach polowych): powrót do defaultu `250000` + budżet
  staje się jawnym pytaniem HIL w `/fd:config` (opcje 250k / 120k / 40k).** Target to
  Opus 4.8 i inne modele z oknem ≥512k — plik taska + zależności zajmuje najwyżej połowę
  okna. Kontrargumenty z 2026-07-04 obsłużone inaczej: generacja pliku i tak przebiega
  falami (nie jednym przebiegiem), a użytkownik małego okna wybiera niższy pułap w
  pytaniu configowym. Estymator i bramka splitu bez zmian.

### B4. Skille mattpocock — niezdefiniowana dystrybucja ⚠️

- [x] `GRILLING.md` §3 podaje URL-e do github.com/mattpocock/skills; u użytkownika
  pluginu tych skilli nie będzie, a plugin nie ma mechanizmu zależności od cudzych
  skilli. Runtime fetch odpada (kruchy, sprzeczny z własną zasadą groundingu).
- **Do decyzji:** (a) vendor do `plugins/fd2/skills/` (sprawdzić licencję), (b) własna
  reimplementacja, (c) wpisanie samych formatów (CONTEXT-FORMAT, ADR-FORMAT) do
  `references/`. Wybór determinuje strukturę pluginu.
- **Decyzja (2026-07-04): wariant (c).** Własne `CONTEXT-FORMAT.md` / `ADR-FORMAT.md` +
  destylat metodyki grilla w `references/` pluginu; URL mattpocock zostaje jako
  atrybucja. Pliki formatów do napisania przy implementacji (D1). Zmiany: `GRILLING.md`
  §3/§4, `RESEARCHER.md` §3.

### B5. Hashowanie Merkle — brak narzędzia i normalizacji ⛔ (ryzyko implementacyjne #1)

- [x] Rdzeń (§2.2, §5.2, §5.4) stoi na deterministycznych hashach, ale skrypt jest
  przewidziany tylko dla `sc-map.json`. LLM nie policzy wiarygodnie sha256 — hasher musi
  być skryptem (`scripts/`, preferencja repo: Bash > Node > Python), wołanym przez każdą
  komendę (także `/status` przy raportowaniu staleness).
- [x] Brak definicji normalizacji treści bloku (trailing whitespace, puste linie, CRLF,
  nagłówek z kotwicą w treści czy poza nią) → fałszywe stale w całym grafie.
- **Do dopisania w SPEC.md:** algorytm ekstrakcji bloku (od kotwicy do następnej),
  normalizacja, kanoniczna serializacja `input_hash` (sortowanie kluczy), definicja
  rollupu.
- **Decyzja (2026-07-04): hasher w Node.js** (`scripts/`, zero zależności; świadome
  odstępstwo od Bash-first — determinizm normalizacji Unicode i JSON). Wołany na wejściu
  przez każdą komendę, także `/status` (read-only). Kontrakt w nowej `SPEC.md` §2.6:
  ekstrakcja bloku od kotwicy do nagłówka o poziomie ≤ (nagłówek w treści bloku),
  normalizacja (CRLF→LF, trailing ws, kolaps pustych linii, trim, NFC), SHA-256 UTF-8,
  kanoniczny JSON (sortowane klucze, kompakt) dla `input_hash`, rollupy
  `spec_hash`/`tasksHash` (pusty zbiór → `null`). Zmiany: `SPEC.md` §2.2/§2.6,
  `COMMAND_STATUS.md` §4.

---

## C. Problemy procesowe / edge case'y

- [x] **C1. `/to-prs`: „liniowa historia" zbyt optymistyczna.** Fale napraw dokładają
  commity taska A po commitach B/C → commity taska nieciągłe → partycja na stacked
  branches wymaga cherry-picków z reorderingiem → konflikty. Brak zdefiniowanej
  strategii merge taska do feature brancha (ff / merge commit / squash). Rozważyć:
  squash-merge per task + commity naprawcze squashowane do „swojego" taska.
  **Decyzja (2026-07-04): squash-merge per task + autosquash napraw.** Merge taska =
  1 commit z trailerem `Task:` (rationale w body, kawałki zostają w worktree); naprawa =
  fixup wciągany autosquashem przy domknięciu fali (drzewo końcowe identyczne → verdykt
  CI ważny; konflikt → osobny commit z trailerem). `/to-prs`: reorder-rebase całych
  commitów tasków pod grupowanie (konflikt → HIL), branche PR = pointery w liniową
  historię, po rebase aktualizacja `impl.commits` w manifeście — SHA spójne ze
  ship-detekcją (A1). Zmiany: `COMMAND_IMPLEMENT.md` §4/§5/§7/§8, `COMMAND_TO_PRS.md`
  §4/§6/§7, `SPEC.md` §5.5.
- [x] **C2. Fale nie uwzględniają overlapu plikowego.** `/implement` planuje fale czysto
  topologicznie z SC; dwa taski tej samej fali na tych samych plikach = przewidywalny
  konflikt merge. Tanie ulepszenie: serializacja tasków o przecinających się zbiorach
  plików w obrębie fali (dane w `codeDeps`/`produces`).
  **Decyzja (2026-07-04): serializacja po footprintcie.** Goal liczy przewidywany
  footprint plikowy per task (`codeDeps` + treść taska, best-effort); przecinające się →
  serializacja wewnątrz fali, rozłączne równolegle; heurystyka — resztę łapie bramka
  merge → fala napraw. Zmiany: `COMMAND_IMPLEMENT.md` §4/§7.
- [x] **C3. Per-task walidacja AC przy `covers` wiele-do-wielu.** AC rozpięte na kilka
  tasków nieweryfikowalne przed merge reszty fali. Doprecyzować: co sprawdza bramka per
  task, a co per fala (pełne AC).
  **Decyzja (2026-07-04): per task = AC pokryte w całości przez task; per fala = AC
  domykane falą** (te, których ostatni producent właśnie się scalił; AC wielo-falowe
  domyka fala ostatniego producenta). Zmiany: `COMMAND_IMPLEMENT.md` §4/§8,
  `SPEC.md` §5.5.
- [x] **C4. `groundingDegraded` z `mcp.detected`** to snapshot z `/config`; MCP mogą
  dojść/zniknąć później. Liczyć at runtime z faktycznie dostępnych narzędzi; config jako
  fallback.
  **Decyzja (2026-07-04): jak proponowano.** Flaga pochodna liczona at runtime z
  osiągalności firecrawl/context7 w sesji; `mcp.detected` = snapshot-prefill/fallback.
  Zmiany: `RESEARCHER.md` §6, `COMMAND_CONFIG.md` (polityka MCP), `config.example.jsonc`.
- [x] **C5. Źródła-URL w `sources/`** — zdefiniować format snapshotu (scrape do md?
  URL + hash treści?); bez tego check „odwołania wczytywalne" nieokreślony dla web-źródeł.
  **Decyzja (2026-07-04): snapshot md + metadane.** Scrape (firecrawl) do
  `sources/web/<slug>.md` z frontmatterem `{url, retrievedAt, contentHash}` (hash wg
  kontraktu §2.6); walidacja czyta snapshot offline; drift-check = ewentualne przyszłe
  rozszerzenie. Zmiany: `RESEARCHER.md` §5, `SPEC.md` §4.1.
- [x] **C6. Bounded context przy cross-feature** — feature należy do dokładnie 1 BC, ale
  konsumuje elementy z innego BC; którego `CONTEXT.md` używa grill? Nieopisane.
  **Decyzja (2026-07-04): tylko własny BC.** Grill/taski X używają `CONTEXT.md` własnego
  BC; konsumpcja cross-BC przechodzi przez wersjonowany kontrakt `Y#EL@vN` (treść
  kopiowana — samodzielność); researcher może read-only zajrzeć do specu/manifestu Y.
  Zmiany: `CROSS_FEATURE.md` §1.
- [x] **C7. Kolizja nazw komend z v1** (`feature-delivery` i `fd2` zainstalowane razem):
  `/start`, `/implement` kolidują → prefiks plugin-name psuje UX z dokumentów.
  Zaplanować migrację/deprecjację v1 albo nazwy typu `/fd:start`.
  **Decyzja (2026-07-04): plugin `fd` + deprecjacja v1.** Docs potwierdzają: komendy
  pluginów są zawsze namespace'owane `/nazwa-pluginu:komenda` („cannot conflict with
  other levels") — twardej kolizji brak. Namespace v2 = `fd` (`/fd:start`…); w
  dokumentach skróty `/grill` = `/fd:grill`; katalog `plugins/fd2/` → do zmiany nazwy
  przy implementacji (D1); v1 `feature-delivery` deprecated w marketplace przy release
  v2 + nota migracyjna w README. Zmiany: `SPEC.md` §3.
- [x] **C8. `config.example.jsonc` niekompletny:** brak sekcji `implement` (próg `K`,
  granularność commita — wskazane w `COMMAND_IMPLEMENT.md` jako kandydaci), polityki
  sprzątania worktree, nazwy feature brancha (A4), fallbacku workflow (B2).
  **Decyzja (2026-07-04):** dopisane `implement.maxRepairIterations` (K, default 3),
  `implement.engine` (`workflow` z auto-fallbackiem | `subagents` wymuszony),
  `implement.worktreeCleanup` (`always` | `keep-failed`); `branchTemplate` był z A4.
  Granularność commita nie jest knobem — po C1 stała (1 commit = task na feature
  branchu, kawałki w worktree). Zmiany: `config.example.jsonc`,
  `COMMAND_IMPLEMENT.md` §3/§4/§5.

---

## D. Braki kompletności zestawu dokumentów

- [x] **D1. Mapowanie spec → struktura pluginu.** Które `COMMAND_*` → `commands/*.md`;
  GRILLING/RESEARCHER → `agents/` czy `references/` (po B1: grill = references,
  researcher = agents); jakie skrypty w `scripts/`. Pierwsza rzecz potrzebna do
  implementacji.
  **Decyzja (2026-07-04): komendy jako `commands/*.md`** (tylko jawne wywołanie — bez
  auto-inwokacji skilli; docs: „Skills are directories with SKILL.md; commands are
  simple markdown files"). Pełna struktura `plugins/fd/`: commands/ (8 destylatów),
  agents/ (researcher + jeden validator parametryzowany wymiarem), references/
  (GRILLING, BUILDING_SPEC, CROSS_FEATURE, formaty), scripts/ (hasher, project-maps,
  estimate-tokens, migrate), schemas/, tests/, evals/ — nowy `IMPLEMENTATION.md` §1.
- [x] **D2. Schematy JSON artefaktów:** `sources-map.json` (jawnie otwarty,
  `RESEARCHER.md` §5), `sc-map.json`, `ac-map.json` — ten sam rygor co
  `feature.lock.json` / `state.json` (czytane/pisane przez skrypty i wiele komend).
  **Decyzja (2026-07-04):** kanoniczne kształty wszystkich trzech zdefiniowane w
  `IMPLEMENTATION.md` §2 (klucze angielskie, `generatedFrom` wiąże projekcję z
  wejściem); każdy artefakt dostaje JSON Schema w `schemas/`, walidowane przez skrypty
  przy odczycie i zapisie.
- [x] **D3. Migracja schematu stanu.** `"schema": 1` wszędzie; brak reguły zachowania
  przy `schema` wyższym/niższym (błąd? migracja? skrypt migracyjny?).
  **Decyzja (2026-07-04): auto-migracja w górę + block w dół.** Niższy `schema` →
  forward-only łańcuch migracji (`scripts/migrations/`, backup + raport + HIL) jako
  część wejścia komendy; wyższy → twardy block „zaktualizuj plugin". Workspace'y v1
  poza migracją (inny produkt, świeży start). `IMPLEMENTATION.md` §3.
- [x] **D4. Strategia testowania pluginu:** golden-testy skryptów (hasher, reconcile,
  dekompozytor) + scenariusze e2e (np. promptfoo).
  **Decyzja (2026-07-04): piramida golden + smoke e2e.** Deterministyka (hasher przypadek
  po przypadku z kontraktu §2.6, projekcje, estymator, migracje) = golden na `node:test`
  bez zależności; e2e = promptfoo wg działającego wzorca `plugins/comment-review/evals/`
  (prompty naturalnojęzykowe, asercje po artefaktach na dysku, nie po `skill-used`);
  3 scenariusze smoke: /config, /start, staleness. `IMPLEMENTATION.md` §4.
- [x] **D5. Trywialny ficzer:** nazwać zachowania zdegenerowane — np. `/to-prs` dla
  1 taska → 1 PR (nie stack).
  **Decyzja (2026-07-04): nazwane u właścicieli** — trywialny spec → 1 task
  (`COMMAND_TO_TASKS.md` §4), 1 task → 1 fala / 1 worktree (`COMMAND_IMPLEMENT.md` §4),
  1 task/grupa → pojedynczy PR bez stacka (`COMMAND_TO_PRS.md` §5), pusty zbiór tasków →
  `tasksHash: null` (`SPEC.md` §2.6); skorowidz w `IMPLEMENTATION.md` §5.

---

## E. Konflikty z platformą — runda 2 (poparte dokumentacją)

### E1. ⛔ Komendy są domyślnie model-invokable

- [x] Docs: custom commands scalone ze skillami („Custom commands have been merged into
  skills"); „By default, Claude can invoke any skill that doesn't have
  `disable-model-invocation: true` set" — dotyczy też komend pluginów. Założenie D1
  („proste pliki md wywołuje wyłącznie user") nieaktualne — model mógłby sam łamać zakaz
  auto-chainingu. `user-invocable: false` steruje tylko widocznością w menu, nie
  dostępem Skill toola.
- **Decyzja (2026-07-04):** `disable-model-invocation: true` we frontmatterze wszystkich
  8 komend. Zmiany: `IMPLEMENTATION.md` §1, `SPEC.md` §5.1.

### E2. ⚠️ `${CLAUDE_PLUGIN_ROOT}` nieudokumentowany w treści komend

- [x] W treści skilla/komendy udokumentowaną substytucją jest `${CLAUDE_SKILL_DIR}`;
  `${CLAUDE_PLUGIN_ROOT}` dotyczy hooków / MCP / komend skryptowych.
- **Decyzja (2026-07-04):** referencje z treści komend przez `${CLAUDE_SKILL_DIR}`.
  Zmiany: `IMPLEMENTATION.md` §1.
- **ERRATA (2026-07-06):** decyzja błędna — w treści komend pluginowych
  `${CLAUDE_SKILL_DIR}` jest pusty (istnieje tylko w SKILL.md); cztery testowe uruchomienia
  przez `--plugin-dir` potwierdziły brak substytucji. Właściwa zmienna to
  `${CLAUDE_PLUGIN_ROOT}` (plugins-reference). Wszystkie komendy poprawione.

### E3. Deprecacja v1 w marketplace — odpuszczone

- [x] Schemat marketplace nie ma pola `deprecated` (najbliższe: `renames`,
  `defaultEnabled`).
- **Decyzja (2026-07-04): nie ruszamy v1** — v2 to osobny produkt. Usunięte zdanie o
  deprecacji ze `SPEC.md` §3.

### E4. ⚠️ Miejsce wykonania skilli CR w fali

- [x] Subagenty mają Skill tool domyślnie („Subagents can still invoke unlisted …
  skills through the Skill tool"); skill z `disable-model-invocation: true` jest
  programowo niewywoływalny (ani Skill tool, ani preload). Preload przez frontmatter
  `skills:` nie pasuje do dynamicznej listy z configu (statyczny plik agenta).
- **Decyzja (2026-07-04):** agent CR w runie fali wywołuje skille z `codeReview.skills`
  po nazwie przez Skill tool; `/config` waliduje istnienie **i wywoływalność** (brak
  flagi). Zmiany: `COMMAND_IMPLEMENT.md` §4, `COMMAND_CONFIG.md` §3.

### E5. ℹ️ Argumenty pozycyjne 0-indeksowane

- [x] `$0` = pierwszy argument, `$1` = drugi — inaczej niż w shellu.
- **Decyzja (2026-07-04):** odnotowane jako gotcha w `IMPLEMENTATION.md` §1.

---

## F. Luki modelu — runda 2

### F1. ⛔ Treść pliku taska poza łańcuchem Merkle

- [x] `input_hash` liczy tylko produces / consumes / covers — edycja body taska
  niewykrywalna; „generated-only" niewymuszalne, `/implement` wykonałby zmanipulowaną
  treść przy świeżym verdykcie.
- **Decyzja (2026-07-04):** `contentHash` pliku taska w manifeście (zapis w apply
  `/to-tasks`, kontrakt normalizacji §2.6); rozjazd = drift tasków → block w
  `/implement`. Zmiany: `SPEC.md` §2.6/§4.4, `COMMAND_TO_TASKS.md` §7,
  `COMMAND_IMPLEMENT.md` §2.

### F2. Równoległa mutacja workspace'u podczas fali — out-of-scope

- [x] Freeze fali (`waveInProgress`) nie jest egzekwowany bramką w `/grill` /
  `/to-tasks`; lock bez właściciela.
- **Decyzja (2026-07-04): out-of-scope.** Nie zakładamy równoczesnych sesji mutujących
  ten sam workspace; detekcja driftu na wejściu `/implement` wystarcza. Bez zmian.

### F3. ⚠️ `input_hash` refów cross-feature: sprzeczność hash vs wersja

- [x] `SPEC.md` §2.6 (hash z manifestu) vs `CROSS_FEATURE.md` §3 (wersje) — nie do
  pogodzenia; przy samej wersji skopiowana treść kontraktu dryfuje po cichu.
- **Decyzja (2026-07-04): wersja + hash.** Do `input_hash` wchodzi bieżący hash
  elementu z manifestu Y (live-read; spoza workspace'u — hash z pinu `upstream`);
  `@vN` niesie semantykę breaking. Kopie w taskach w markerach `fd:copy` (ref + hash);
  odświeża wyspecjalizowany subagent copy-refresher w apply `/to-tasks`.
  Zmiany: `SPEC.md` §2.6, `CROSS_FEATURE.md` §1/§3, `COMMAND_TO_TASKS.md` §3/§7,
  `IMPLEMENTATION.md` §1.

### F4. ⚠️ `/to-prs` bez bramki kompletności

- [x] Prekondycja „implementacja ukończona" bez mechanizmu — można wyciąć stos z
  na wpół zaimplementowanego brancha.
- **Decyzja (2026-07-04):** twarda bramka na wejściu: wszystkie taski
  `implemented` / `shipped`. Zmiany: `COMMAND_TO_PRS.md` §2/§6/§7, `SPEC.md` §5.5.

### F5. ⚠️ Ship-detekcja vs squash-merge (dominująca polityka repo)

- [x] „Treść wygląda na scaloną" bez definicji mechanicznej; przy „squash and merge"
  HIL odpalałby się per task — regularna udręka, nie wyjątek.
- **Decyzja (2026-07-04):** mechanika = `git patch-id` / `git cherry`; HIL zbiorczy
  (jedna decyzja dla wielu tasków); ten sam przypadek w live-check delivered
  cross-feature → HIL, nie ślepy bloker. Zmiany: `SPEC.md` §2.4, `CROSS_FEATURE.md` §5.

### F6. ⚠️ Zakres po zakończonej implementacji + commity self-review

- [x] „Pełna pętla feedbacku ludzkiego CR — do domknięcia"; „trwały task korygujący"
  nieoperacjonalizowany (brak mechaniki brancha/PR dla rundy 2).
- **Decyzja (2026-07-04): ścieżki grill → to-tasks → implement po zakończonej
  implementacji jawnie NIE wspieramy** — zmiany domyka nowa funkcjonalność; guard na
  wejściu `/grill` i re-run `/from-docs`; reconcile: zmiana elementu `delivered` =
  block. Self-review usera na feature branchu = wspierany wkład: fixupy → autosquash,
  zwykłe commity → HIL przypisania w `/to-prs`; re-projekcja `/to-prs` domyka pętlę
  ludzkiego CR. Zmiany: `SPEC.md` §2.3/§2.4/§2.5/§5.5, `COMMAND_IMPLEMENT.md` §5/§6,
  `COMMAND_TO_PRS.md` §2/§4/§5/§6/§7, `COMMAND_GRILL.md` §2/§5,
  `COMMAND_FROM_DOCS.md` §2/§5, `CROSS_FEATURE.md` §6.

### F7. ℹ️ Staleness wobec pól `state.json` zamiast świeżych hashy

- [x] Literalne porównanie z `state.json.specHash` przepuszczałoby ręczne edycje
  (pole samo jest wtedy nieaktualne).
- **Decyzja (2026-07-04):** staleness zawsze wobec świeżo policzonego rollupu (hasher
  na wejściu). Zmiany: `SPEC.md` §5.4, `COMMAND_TO_TASKS.md` §2, `COMMAND_STATUS.md` §3.

### F8. ℹ️ Wskazanie funkcjonalności dla re-run `/from-docs`; generacja i kolizja sluga

- [x] §3.1 nie obejmowało re-run `/from-docs`; slug bez mechanizmu generacji i obsługi
  kolizji przy scaffoldzie.
- **Decyzja (2026-07-04):** re-run `/from-docs` w regule §3.1; wspólny generator sluga
  (krótki, opisowy kebab-case) dla `/start` / `/from-docs`; kolizja → HIL (re-run
  istniejącej / inny slug). Zmiany: `SPEC.md` §3.1/§5.5, `COMMAND_START.md` §3/§5,
  `COMMAND_FROM_DOCS.md` §2/§3/§5.

### F9. ℹ️ Właściciele przejść `ready` / `in-progress`

- [x] Maszyna stanów taska definiowała właściciela tylko dla `shipped`.
- **Decyzja (2026-07-04):** `ready` ustawia `/to-tasks` po passie DoR tasków;
  `in-progress` — `/implement` (goal) na starcie fali. Zmiany: `SPEC.md` §2.3,
  `COMMAND_TO_TASKS.md` §7, `COMMAND_IMPLEMENT.md` §7.

---

## G. Ryzyka implementacyjne — runda 2

### G1. ⚠️ Współbieżne merge i zapisy manifestu w fali

- [x] Równoległe merge'e do jednego feature brancha (wyścig o branch) i równoległe
  zapisy `feature.lock.json` (last-writer-wins) — spec nie wskazywał właściciela.
- **Decyzja (2026-07-04):** merge'e szeregowo w dedykowanym subagencie-mergerze
  (zoptymalizowany pod konflikty); manifest pisze wyłącznie goal w main thread
  (single-writer, na podstawie strukturalnych wyników runu).
  Zmiany: `COMMAND_IMPLEMENT.md` §4, `IMPLEMENTATION.md` §1.

### G2. ⚠️ Niezadeklarowany wymóg Node.js

- [x] Cały deterministyczny rdzeń to Node, a projekt usera może go nie mieć.
- **Decyzja (2026-07-04):** wymóg jawny — README + detekcja i walidacja `/config`
  (brak `node` → block). Zmiany: `COMMAND_CONFIG.md` §3/§5, `IMPLEMENTATION.md` §1.

### G3. ℹ️ Bootstrap worktree

- [x] Świeży worktree bez `node_modules` / `.env` → lint i CI padają przed startem.
- **Decyzja (2026-07-04):** `implement.worktreeSetup` — lista komend uruchamianych na
  świeżym worktree przed startem taska. Zmiany: `config.example.jsonc`,
  `COMMAND_IMPLEMENT.md` §4, `COMMAND_CONFIG.md` §3.

### G4. ℹ️ Estymator znaki/4 kalibrowany pod angielski

- [x] Dla polskiego ~3–3.5 znaka/token — budżet przekraczany o 30–50%.
- **Decyzja (2026-07-04):** `tasks.charsPerToken` (default 4; `/config` proponuje
  3–3.5 wg `language.default`). Zmiany: `config.example.jsonc`,
  `COMMAND_TO_TASKS.md` §4.

### G5. ℹ️ Gramatyka kotwicy ID i słownik KIND niezdefiniowane

- [x] Bez formalnego wzorca dowolny nagłówek `[A-Z]+-\d+` stawałby się elementem,
  a literówka w KIND po cichu zakładała nowy rodzaj.
- **Decyzja (2026-07-04):** regex kotwicy w §2.6
  (`^(#{1,6}) ([A-Z]{2,10})-([1-9][0-9]*) — `); słownik KIND = klucze `idCounters`;
  nieznany KIND → HIL w walidacji „Spójność strukturalna" (akceptacja → dopis do
  `idCounters`). Zmiany: `SPEC.md` §2.6/§4.3, `IMPLEMENTATION.md` §4.

### G6. ℹ️ Ciche wyłączenie wymiaru walidacji w configu

- [x] Waiver ma pełną ceremonię, a wycięcie wymiaru z `validation.dimensions` w
  ręcznie edytowalnym, commitowanym configu osłabiało bramkę bez śladu.
- **Decyzja (2026-07-04):** widoczność zamiast zakazu — verdykt zapisuje
  `dimensionsRun`, `/status` i raport walidacji pokazują różnicę wobec pełnego
  zestawu. Zmiany: `SPEC.md` §5.4, `BUILDING_SPEC.md` §5, `COMMAND_STATUS.md` §3.

---

## H. Testy polowe — runda 2 (decyzje rundy 3, 2026-07-07)

### H1. Silnik implement obsługiwał jedną falę na run; user chce pełnego cyklu

- [x] Run polowy: Workflow robił tylko taski jednej fali; merge/CI/repair/CR orkiestrował
  main thread między runami (dużo tur, dużo cache-read, HIL-e w środku cyklu).
- **Decyzja (2026-07-07):** jeden run `wave-implement.mjs` = pełny cykl (fale z `deps` →
  merger raz na falę → CI → pętla napraw ≤K → domknięcie: pełne CI → CR → fixy →
  autosquash → finalne CI). Zwroty `completed | continue | escalated`; do HIL trafiają
  wyłącznie: `architectural`, `repair-exhausted`, `cr-judgment` (+ `engine-failure`).
  Writer stanu zostaje w main thread na granicach runu; księgą wewnątrz runu są trailery
  `Task:`. Checkpoint `continue` = auto-relaunch bez pytania.

### H2. Zakres CI per fala

- [x] Runda 2 zawęziła per-wave CI do dotkniętych pakietów; user opisał cykl z pełnym CI.
- **Decyzja usera (2026-07-07):** knob `implement.ciScope: "full"|"scoped"`,
  **default `full`**; domknięcie zawsze full. Cichy default (raport fazy 6 configa).

### H3. Adopcja brancha porywała nie-swoją robotę

- [x] Run polowy: user stał na branchu PoC z 11 własnymi commitami — heurystyka rundy 2
  zaadoptowałaby go po cichu, gdyby był up-to-date z bazą; do tego kolizja nazwy
  `feat/<slug>` po starym przerwanym runie była nieobsłużona.
- **Decyzja usera (2026-07-07):** cicha adopcja TYLKO świeżo odbitego brancha
  (`git rev-list --count <base>..HEAD` == 0); branch z własnymi commitami → HIL z opcją
  adopcji. Kolizja nazwy / residuum `fd/<slug>/*` → HIL (sufiks / reset / build-on / stop).

### H4. Bramki HIL w to-tasks rozstrzygane przez model

- [x] Run polowy: 17 martwych symboli i blocking doubt (`sha256:pending`) domknięte
  auto-resolve — spec oznaczał je jako HIL; fałszywy blocking doubt wynikał z walidacji
  na stanie sprzed apply.
- **Decyzja usera (2026-07-07):** blocking doubts → **zawsze HIL** (model nigdy sam);
  martwe symbole → auto-klasyfikacja walidatora (advisory/blocking) z obowiązkowym
  ujawnieniem w raporcie. Dwufazowy apply (`apply.mjs fill` przed walidatorami) usuwa
  systemowy fałszywy doubt; placeholder ustandaryzowany jako `sha256:pending`.

### H5. Brak shipowanych writerów stanu (hand-roll z hardcode'ami)

- [x] Oba runy hand-rollowały mutacje `feature.lock.json`/`state.json` (inline node ~6×,
  scratchpadowe skrypty z `idCounters.T=28` i wklejonym `tasksHash`; ryzyko zaniżenia
  liczników append-only na re-runie).
- **Decyzja (2026-07-07):** trzy shipowane skrypty jako jedyni writerzy:
  `build-manifest.mjs` (projektor manifestu, append-only liczniki, producenci, historia),
  `apply.mjs` (seed-state / fill / finalize / readiness-spec / reconcile — `validatedHash`
  zawsze liczy skrypt), `record-impl.mjs` (chirurgiczny patcher implement/ship, zero
  recompute). Zmiany: `SPEC.md` §4.4, wszystkie komendy.

### H6. @v-bump vs BLOCK na delivered — rozstrzygnięcie

- [x] Teksty brzmiały sprzecznie: „dotknięcie delivered → BLOCK (nowa funkcjonalność)"
  vs „breaking change delivered bumpuje `@v`".
- **Decyzja (2026-07-07):** BLOCK jest bramką domyślną; bump `@v` to mechanizm wykonywany
  WYŁĄCZNIE przez `apply.mjs reconcile` z planu zatwierdzonego HIL-em — kolejność, nie
  sprzeczność. Doprecyzowane w `from-docs.md`, `grill.md`, `to-tasks.md`.

---

## I. Testy polowe — runda 3 (config + from-docs, 2026-07-07)

Runda merytorycznie czysta: config wzorcowy (92k ctx, wszystkie poprawki rundy 3
potwierdzone), from-docs dowiózł spec DoR-ready (284 elementy, 6/6 wymiarów), wszystkie
shipowane skrypty użyte poprawnie. Problemy dotyczą dyscypliny wykonania i rozmiaru
kontekstu (main thread 93k → 456k tok).

### I1. Fan-out analityków w 3 wiadomościach mimo kontraktu "ONE message" (S2)

- [x] 6 analityków poszło w 3 wiadomościach (2+2+2), a narracja twierdziła "dispatched in
  one message"; walidatorzy w tym samym runie poszli poprawnie 6-w-1 i 3-w-1 — zawodzi
  sekcja Analysis, nie mechanizm. Do tego 2× `ls analysis/` (polling zakazany przez spec).
- **Fix (2026-07-07):** protokół dispatchu w `from-docs.md` krok 3: najpierw domknięta
  pełna lista plastrów, potem JEDNA wiadomość z całym fan-outem; podzielony dispatch =
  złamanie kontraktu, narracja niezgodna z realnym kształtem wiadomości = podwójne;
  jawny zakaz `ls`/`Glob` na `analysis/` w trakcie. Mirror w `COMMAND_FROM_DOCS.md`.

### I2. Jednorazowy 21k-znakowy builder sources-map pisany inline (S3)

- [x] Model napisał w main thread `build-sources-map.mjs` (21 277 znaków, ~5,3k tok na
  stałe w kontekście, bug escapowania naprawiany w 2 edycjach) — brakowało shipowanego
  writera `sources-map.json`.
- **Fix (2026-07-07):** shipowany `scripts/build-sources-map.mjs` — jedyny writer
  `sources-map.json` (merge + dedupe rekordów z plików danych, walidacja schematu przed
  zapisem, `--seed` przy scaffoldzie); grill akumuluje kompletne rekordy i utrwala je
  jednym wywołaniem w kroku Persist. Golden testy. `SPEC.md` §4.4 rozszerzony.

### I3. Skrypty czytane zamiast uruchamiane

- [x] Obserwacja usera przez rundy: model czyta źródła `.mjs` do kontekstu zamiast
  wykonywać one-linery; dotychczasowy zapis ("do not read their source") ginął w akapicie
  o ścieżkach.
- **Fix (2026-07-07):** wydzielony blok **Script contract** ostemplowany identycznie na
  początku wszystkich 8 komend: skrypty są WYKONYWANE (stdout JSON = cały interfejs; zły
  argument → usage error = dokumentacja), czytanie źródła tylko przy diagnozie nieudanego
  wykonania (jawnie zgłoszone), zakaz reimplementacji inline — brakująca zdolność to luka
  do zgłoszenia. `@`-inlinowanie współdzielonego pliku odrzucone: nieudokumentowane w
  aktualnych docs pluginów (zweryfikowano 2026-07-07).

### I4. Bloat kontekstu from-docs — pozostałe źródła (backlog, decyzja usera: nie teraz)

- [ ] Main czyta całe SA-1..6 (+44k tok), zwroty walidatorów z pełnymi cytatami także dla
  PASS (~13,5k), narracja/re-derivacje (~165k output). Kierunki: sekcja "grill agenda" w
  SA czytana zamiast całości, kompaktowe werdykty walidatorów (dowody na dysk, czytane
  tylko dla FAIL), dyscyplina narracyjna. Diagramy przebiegu:
  `docs/field-tests/r3-from-docs-*.mmd`.

---

## J. Grill 2026-07-08 — bramka fali: smoke + weryfikacja AC zamiast pełnego CI

### J1. Pełny CI per fala przykładał kryteria stanu końcowego do stanów pośrednich

- [x] Motywacja (trzy naraz): czas ścienny (czysty przebieg W fal = W+2 pełne pipeline'y),
  tokeny palone przez pętle repair odpalane fałszywą czerwienią, oraz semantyka — lint na
  wczesnych falach flaguje wyeksportowane-ale-nieużywane fundamenty, których konsumenci
  przychodzą w falach 2+; agent naprawczy „naprawia" to najchętniej kasując fundament.
- **Decyzja usera (2026-07-08), ODWRACA H2 (default `full` per fala z 2026-07-07):**
  między falami biegną równolegle DWA agenty: **smoke** = `tooling.typecheck` +
  `tooling.build` (każde nie-null; oba null ⇒ głośny skip w raporcie, nigdy cichy pass)
  oraz **weryfikator AC** domkniętych falą (celowany test lub inspekcja kodu, gdy test nie
  może istnieć; `unverified` → pętla repair jako `ac:<id>`, fixup na commit
  taska-właściciela). Pełny pipeline (lint+testy+build) wyłącznie na domknięciu.
  Knob `implement.ciScope` USUNIĘTY w całości (bez knoba — zawsze smoke); nowy nullable
  `tooling.typecheck` z detekcją w `/config`. Wpis tutaj jest po to, żeby runda 5 nie
  kręciła się w kółko: full→scoped→full→smoke to koniec wahadła, zmiana ma uzasadnienie
  semantyczne, nie tylko kosztowe.
- Utwardzenie close (pierwszy pełny CI w życiu feature'a): prompt agenta napraw buduje
  mapę task→commit z trailerów `Task:`; jeden `--fixup` na winowajcę (chirurgia commitów
  pod `/to-prs`); eksport niosący kontrakt spec/`produces` nigdy nie jest kasowany
  automatycznie (CR: zawsze `judgment`). Świadomie zaakceptowane ryzyka: semantyczna
  kolizja równoległych tasków wychodzi dopiero na close; osobny limit K dla close
  odrzucony do czasu testu polowego.

---

## K. Testy polowe — runda 3 (implement, 2026-07-07/08)

Run: sesja 7baed842, feature `cerbos-authz-phase2-org-migration` (39 tasków / 143 AC /
9 fal) na repo console-test-fd. 5 launchy silnika, ~11h49m wall (w tym ~5,5h nocnego
limitu konta i 2× HIL po ~40 min), ~8,9M tok, 62 agenty. Wynik: 28/39 tasków
zmerge'owanych, close nie zbiegł ani razu. Redesign J1 wjechał W TRAKCIE sesji (edycja
silnika między runem 2 a 4), więc run jest mimowolnym testem A/B obu bramek na tej samej
feature — i **potwierdza J1 na wszystkich trzech filarach**: (a) stary model na wave 0
dał 20 errorów `import/no-unused-modules` na fundamentach bez konsumentów i 3 iteracje
repair (sufit K), w tym repair, który SKASOWAŁ test AC-67, żeby przejść `ci:test`; nowy
model na analogicznej fali: smoke pass, 0 repair, a jedyny repair fali 1 był
konstruktywny (dodał brakujące testy, `--fixup` na commit taska-właściciela); (b) merger
squashował z trailerem `Task:` i wyciętym breadcrumbem `Fd-Gate`, naprawy szły wyłącznie
jako `--fixup <commit-taska>`, zero konfliktów w całym runie. Diagramy przebiegu:
`docs/field-tests/r3-implement-*.mmd`.

### K1. ⚠️ Limit sesji klasyfikowany jako `engine-failure` z mylącą eskalacją

- [x] Dwa launche (runy 3 i 5) padły na „You've hit your session limit · resets <t>";
  silnik zgłosił to człowiekowi jako „Worktree preparation failed — fix the working
  copy" oraz „A wave gate agent died" — obie diagnozy fałszywe, poprawną akcją było
  „poczekaj do resetu i relaunch, stan roboczy nietknięty". Każdy agent bez wyniku jest
  dziś traktowany jak engine-failure. Przy dużych feature'ach (godziny compute) limit to
  scenariusz częsty, nie wyjątkowy.
- **Decyzja (grill 2026-07-08): oba poziomy — pierwotny kierunek „rozpoznawać sygnaturę
  w treści błędu" jest NIEWYKONALNY w silniku** (`agent()` zwraca gołe `null` dla killa,
  błędu API i limitu jednakowo; treść błędu widzi tylko main thread w notyfikacji).
  Fix: (a) silnik — wszystkie teksty eskalacji `engine-failure` przepisane na uczciwe
  (wspólna stała `NO_RESULT`: „kill / błąd API / limit konta — przyczyna niewidoczna;
  branch i trailery nietknięte, relaunch bezpieczny; przy zbiegu z limitem poczekaj do
  resetu"); (b) main thread (`implement.md`, Eskalacje) — przy engine-failure NAJPIERW
  klasyfikacja: sygnatura limitu w notyfikacji workflow lub własny limit sesji ⇒ raport
  „to limit, nie bug — czekaj do resetu i relaunch", bez HIL; salvage tylko bez sygnału
  limitu.

### K2. ⚠️ Fala eskalująca merguje przechodzące taski bez bramki

- [x] Gdy fala kończy się eskalacją architektoniczną, merger merguje taski przechodzące
  (run 2: 4 taski, run 4: 3 taski), ale smoke/weryfikacja AC tej fali już nie biegnie —
  na feature branchu ląduje kod niezgejtowany falowo. Teoretycznie łapie to close, ale
  close może nie zbiec nigdy (tu: 0/5 launchy); `/to-prs` nie ma bramki kompletności
  (F4), więc shippowałby taski częściowo zgejtowane. Main thread poprawnie NIE foldował
  `--ci pass` dla tych fal — stan mówi prawdę, ale kod i tak leży w branchu.
- **Decyzja (grill 2026-07-08): sama bramka, bez naprawy + dług do relaunchu.** Przy
  eskalacji fali smoke ∥ AC-verify biegną normalnie (chyba że nic się nie zmergowało —
  wtedy prosto do człowieka), werdykt ląduje w raporcie fali, ale pętla napraw NIE
  startuje (decyzja człowieka może ją unieważnić). Czerwona resztka wraca jako
  `gateDebt` wpisu raportu fali; main thread kopiuje ją do `args.gateDebt` relaunchu,
  a silnik spłaca dług PRZED falą 0 (świeży smoke + re-weryfikacja + standardowa pętla
  napraw, to samo K; wyczerpanie → `repair-exhausted`) — nowe worktree nigdy nie tną
  się ze znanego-czerwonego brancha. Fold `--gate` tylko dla fal z zieloną bramką.

### K3. ⚠️ Fixupy cross-cutting zwijają obce pliki w commit jednego taska

- [x] Naprawa regresu integracyjnego po zmianie schematu (T-001, `globalRoles String[]`)
  zwinęła poprawki 6 plików downstream — w tym spoza footprintu T-001 — w jeden
  `--fixup` na commit T-001. Atrybucja autosquash formalnie poprawna, ale PR taska
  z `/to-prs` wchłania zmiany obcych obszarów → granica task↔PR się rozmywa.
- **Decyzja (grill 2026-07-08): jawne commity integration-fix.** Ustalenie z eksploracji:
  „puchnięcie PR-a winowajcy" jest częściowo WYMOGIEM, nie bugiem — niezmiennik
  buildability `/to-prs` żąda, by łamiąca zmiana i adaptacje jej blast radius lądowały
  w tym samym PR-ze. Kontrakt: naprawa w plikach JEDNEGO taska → `--fixup` jak dotąd
  (`ac:<id>` zawsze); naprawa cross-cutting → zwykły commit `fix(integration): …` z
  trailerami `Task: <winowajca>` + `Integration-Fix: true` — do PR-a winowajcy wciąga
  go istniejąca reguła partycji „wszystkie commity z trailerem" (zero zmian w kroku
  absorb), autosquash go nie dotyka, czysta zmiana i adaptacje pozostają osobno
  recenzowalne; pliki utworzone przez PÓŹNIEJSZY task → podział naprawy per właściciel
  (commit rozpięty na właścicieli psuje rebase stosu). Zmiany: `featureRepairPrompt`,
  `implement.md` (pętla napraw), `to-prs.md` + mirrory.

### K4. ⚠️ Korupcja args przy inline-paste + crash na self-ref `serializeAfter`

- [x] Run 1 padł w 0s: `serializeAfter cycle: T-025 -> T-025` — kanoniczny
  `engine-args.json` był czysty, korupcja powstała przy ręcznym wklejaniu 14 KB args
  inline do wywołania Workflow. Do tego engine rzucił niezłapany wyjątek (stack trace
  w wyniku Workflow) zamiast strukturalnego `{status:'failed', reason}`.
- **Decyzja (grill 2026-07-08): odrzucanie strukturalne + protokół launchu; kierunek
  „filtrować self-ref" ODRZUCONY** (cichy filtr maskuje korupcję i gubi realną krawędź
  serializacji — silnik nie zna intencji), a „ścieżka pliku zamiast inline" jest
  niewykonalna (skrypt workflow nie ma dostępu do filesystemu). Fix: parseArgs +
  scheduleWaves w try/catch → zwrot `escalated` z nowym kind `invalid-args` (nic nie
  pobiegło; regeneruj engine-args.json i relaunch bez HIL); tripwire'y korupcji w
  parseArgs (deklarowany `tasksCount` vs `tasks.length`, format `T-\d+` refów, jawny
  błąd na self-ref w deps/serializeAfter); protokół launchu w `implement.md`:
  engine-args.json pisany Write toolem (nigdy heredoc — patrz K7c), do Workflow trafia
  zawartość pliku verbatim, zmiana = najpierw regeneracja pliku.

### K5. ⚠️ Katalogowe `codeDeps` over-serializują footprint

- [x] Wspólny katalogowy dep (`backend/src/cerbos/`) prefix-matchował footprinty
  wszystkich tasków → 54 fałszywe pary serialize; paralelizm uratowała dopiero ręczna
  interwencja main threadu (filtracja do 5 realnych par exact-file). Heurystyka wisi na
  przytomności LLM-a, nie na regule.
- **Decyzja (grill 2026-07-08): exact-file only, katalog = sygnał.** Krawędzie
  `serializeAfter` powstają wyłącznie z overlapu konkretnego pliku (git nie konfliktuje
  na różnych plikach w katalogu; hazard read-after-write na poziomie obszaru kryją już
  krawędzie deps/consumes + defer-to-next-wave); ścieżka katalogowa nigdy nie tworzy
  krawędzi, pominięte pary katalogowe są nazwane w narracji launchu. Wariant „shipowany
  skrypt liczący pary" odrzucony: wejście (mapowanie element→plik) i tak ekstrahuje LLM
  z treści taska — skrypt utwardzałby tylko ostatni krok nad rozmytymi danymi. Zmiany:
  `implement.md` (footprint) + mirror.

### K6. ℹ️ „Pełny cykl w jednym runie" nierealny dla dużej feature

- [x] 39 tasków = realnie 5 launchy: 1 crash args, 2 eskalacje architektoniczne
  (T-010 Cerbos ESM-only, T-021/T-036), 2 limity konta; close (pierwszy pełny CI → CR →
  autosquash → finalny CI) nie zbiegł ani razu. Obietnica „one full delivery cycle"
  myli oczekiwania — cykl jest logiczny, nie fizyczny (co silnik zresztą wspiera:
  relaunch z remaining działał bezbłędnie, stan odtwarzany z trailerów git).
- **Fix (grill 2026-07-08, bez zmian mechaniki):** `implement.md` (intro + Run boundary),
  README i `COMMAND_IMPLEMENT.md` mówią wprost: „jeden run" nazywa własność
  wznawialności — duża feature realnie domyka się serią launchy z HIL pomiędzy, każdy
  startuje tam, gdzie trailery mówią, że skończył poprzedni.

### K7. ℹ️ Drobne rysy z runu

- [x] **Regres pokrycia po repair:** stary gate złapał skasowany test (AC-67 „green but
  not covered"); scoped re-weryfikacja (`stillUnverified`) z redesignu stworzyła ślepy
  punkt — AC raz `covered-by-test` nigdy nie wracało do sprawdzenia, a skasowanego testu
  nie widzi ani smoke, ani full CI na close (test, który nie biegnie, jest „zielony").
  **Decyzja (grill 2026-07-08): pełna re-weryfikacja WSZYSTKICH AC fali co iterację
  repair** (świadome cofnięcie optymalizacji; fala domyka średnio kilkanaście AC, koszt
  mały) + twardy zakaz „nigdy nie kasuj/nie osłabiaj testu, żeby bramka przeszła" w obu
  promptach repair (worktree i feature-branch).
- [x] **`record-impl.mjs`:** brak subkomendy adopcji brancha; przeciążony fold
  `--ci pass`. **Decyzja (grill 2026-07-08): rename + blok close** (plugin
  niepublikowany, zero kosztu migracji): per-task `impl.ci` → `impl.gate`
  (flaga `--gate`; gate = bramka fali, celowo nie „ci"), nowy feature-level
  `state.close = { fullCi, cr, finalCi }` z verbem `record-impl close` (zapis
  przyrostowy — eskalowane domknięcie utrwala, co pobiegło), `/to-prs` dostał twardą
  prekondycję `state.close.finalCi == "pass"` (domyka kawałek F4), nowy verb
  `record-impl branch --set` dla adopcji/utworzenia brancha (koniec ręcznych Editów
  state.json). Zmiany: record-impl.mjs + testy, feature-lock/state schematy, fixtures,
  implement.md/to-prs.md + mirrory, SPEC §4.4/§5.5.
- [x] **Decyzje HIL przez Bash-heredoc:** tekst decyzji T-021 zawierał „npm install" →
  hook `block-npm-usage` zablokował heredoc. **Fix (grill 2026-07-08):** protokół
  launchu w `implement.md` — engine-args.json (z tekstami decyzji w środku) pisany
  wyłącznie Write toolem; swobodny tekst człowieka nigdy nie przechodzi przez treść
  polecenia Bash.

### K8. ℹ️ Return silnika wciągany w całości do main threadu

- [x] Dwa największe skoki kontekstu sesji to odczyt returnów Workflow: +54k (160→214k)
  i +51k (306→357k) — ponad 40% całego przyrostu main threadu w ~12h. Analiza
  workflow-vs-subagenty na tym runie: orkiestracja przez Workflow to ledwie ~7%
  konsumpcji limitu (147 wywołań API main threadu vs 4141 agentów silnika; 24,9M vs
  519M cache read), więc jedyny istotny koszt Workflow po stronie main threadu to
  właśnie tłusty return — ta sama klasa problemu co I2/I4.
- **Kierunek:** silnik pisze pełny raport runu na dysk (per-task wyniki, werdykty bramek,
  diagnozy repair), a return niesie wskaźnik + minimalne podsumowanie (status, fale,
  taski id→status→commit, eskalacje z pytaniami); main thread czyta z pliku wybiórczo —
  tylko kontekst eskalacji i sekcje fail, nigdy całość przy `completed`.
- **Fix (2026-07-08):** `wave-implement.mjs` — każde wyjście z `run()` przechodzi przez
  `finish()`: agent `report:write` (effort low, Write tool — nigdy heredoc) utrwala pełny
  payload do `<featureDir>/impl-run-report.json` (skrypt Workflow nie ma dostępu do fs),
  a zwrot to `slimReturn()`: taski `{id, status, headSha}`, fale ze statusami bramek bez
  per-AC detali, `close.cr` = werdykt + `findingsCount` + `reportFile`; eskalacje i
  `gateDebt` zostają w zwrocie w całości (HIL/relaunch bez odczytu pliku). Padnięty
  writer ⇒ fallback: stary tłusty return z `report: null`. Wczesny `invalid-args`
  (przed parseArgs) celowo bez raportu. Main thread czyta raport wybiórczo
  (`jq`/`node -e`), przy czystym `completed` wcale. Testy: slimReturn ×2,
  reportWritePrompt, source-level (0× `return payload(`, 3× `finish(payload(`,
  eskalacje przez finish, fallback obecny); mirrory implement.md/COMMAND_IMPLEMENT/README.

### K9. ℹ️ Wszystkie agenty silnika biegną na modelu/effort sesji

- [x] ~93% konsumpcji limitu w runie to agenty silnika (519M cache read, śr. ~65 wywołań
  API na agenta), a etapy mechaniczne — merger (skryptowa sekwencja squash-merge'ów),
  smoke (odpal 2 komendy, zraportuj exit code), prepare-wave — biegną na pełnym modelu
  i effort sesji tak samo jak task-agenty. Docs workflows: „Every agent in a workflow
  uses your session's model unless the script routes a stage to a different one";
  `agent()` przyjmuje `opts.model` i `opts.effort`.
- **Kierunek:** w `wave-implement.mjs` routować etapy mechaniczne na `effort: 'low'`
  (ew. tańszy model) — merger, smoke, prepare-wave; task-agenty, repair, AC-verify i CR
  zostają na modelu sesji. Wymaga testu polowego, czy jakość mergera (konflikt-checki,
  trailery) nie siada na niższym tierze — dopiero potem ewentualny cichy default.
- **Fix (2026-07-08):** `wave-implement.mjs` — `effort: 'low'` na spawnach prepare-wave,
  mergera i smoke'a (krok diff miał je już wcześniej); task-agenty, repair, AC-verify,
  CR i close-CI bez zmian (model/effort sesji). Bez knoba w configu — cichy default do
  zweryfikowania testem polowym (jakość mergera). Test source-level pilnuje routingu.

### K10. ⚠️ Baseline task-agentów dominuje limit; eksploracja shellem zamiast grafu

- [x] Anatomia kontekstu 31 task-agentów (runy 2+4): prompt delegacyjny to ~2k znaków,
  ale baseline startowy (system prompt + odziedziczone schematy WSZYSTKICH
  tooli/MCP sesji + CLAUDE.md targetu) = 43k tok w runie 2 → 92k w runie 4; przy
  medianie 93 wywołań API na agenta baseline × wywołania = 42–63% całego cache read
  silnika — sam wzrost baseline'u tłumaczy większość różnicy kosztu run 4 vs run 2.
  Dowód lokalizacji: merger (custom agent z obciętą listą tooli) miał stały baseline
  21k w OBU runach — przyrost żyje w dziedziczonych schematach narzędzi. Doczytywanie:
  480k znaków skumulowanej eksploracji shellem (`cat`/`grep`/`ls` — największa klasa),
  całe pliki po 36k znaków czytane niezależnie przez 5 agentów; naruszenia
  self-contained: 3× cały spec.md (T-004/T-014/T-016), 11× cudze task files (T-036 aż
  cztery). Własny output agenta (reasoning nieobecny w transkrypcie, ale liczony
  i kumulowany) ~35k tok średnio, do 83k (T-028).
- **Kierunek (decyzje usera 2026-07-08):** (a) dedykowany typ agenta dla task-agentów
  à la `fd:merger` — obcięta lista tooli natywnych + wyłącznie wspierane MCP:
  `context7`, `firecrawl`, `codebase-memory-mcp` (baseline ~92k → kilkadziesiąt %
  mniej); (b) pobieranie kodu w promptach task-agentów wymuszone przez
  `codebase-memory-mcp` (`search_graph`/`get_code_snippet`/`trace_path`/`search_code`)
  zamiast Read/Grep/shellowych `cat|grep` — celowane snippety na poziomie symbolu
  zamiast całych 36k-plików i shellowych polowań; Read zostaje dla znanego pliku przed
  edycją i dla configów; dostępność MCP wykrywa `/config`, przy braku fallback na toole
  natywne; ŚWIADOMIE ODRZUCONE: batching odczytów w mniejszą liczbę wywołań (zapełnia
  kontekst agenta na raz → niestabilność pracy) oraz snippety kodu w ekstraktach tasków
  (lepszą metodą pobierania jest graf); (c) zakaz czytania spec.md i cudzych task files
  zostaje i wymaga utwardzenia w prompcie task-agenta (dziś umowa, nie bramka).
  Routing effort/model etapów mechanicznych: patrz K9.
- **Fix (2026-07-08):** (a) nowy subagent `agents/implementer.md` — `tools:` ograniczone
  do Bash/Read/Write/Edit/Grep/Glob + wzorce server-level `mcp__codebase-memory-mcp`,
  `mcp__context7`, `mcp__firecrawl` (pole `mcpServers` w agentach pluginów jest
  ignorowane; allowlist `tools` wystarcza dla serwerów już skonfigurowanych w sesji);
  silnik spawni taski i worktree-repairy z `agentType: 'fd:implementer'`, fallback
  subagentowy tak samo. (b) nowy arg silnika `graphMcp` (main thread ustawia z
  `mcp.detected`), blok „Code retrieval" w `taskPrompt` + protokół grafu w definicji
  agenta (z zastrzeżeniem: graf indeksuje checkout repo-root, własne zmiany worktree
  przez Read/git). (c) zakaz spec.md / cudzych tasków / stanu workspace'u dopisany do
  TASK_CONTRACT (osadzany verbatim w każdym prompcie). Testy: parseArgs.graphMcp, oba
  warianty taskPrompt, routing agentType/effort source-level; mirrory implement.md /
  COMMAND_IMPLEMENT.md / README / CHANGELOG.

---

## Mocne strony (bez zmian)

- Rozdział manifest (commitowany, autorytatywny) / meta / frontmatter-pointer.
- Dwupoziomowa detekcja stale w cross-feature (tripwire `specHash` + wersja kontraktu).
- Twarde bramki binarne + waiver tylko-ludzki.
- „Dekompozycja dry-run" jako obiektywny test under-specified.
- Zakaz auto-chainingu + cold-start (spójne z kompaktowaniem kontekstu między komendami).

## Źródła weryfikacji

- https://code.claude.com/docs/en/workflows — ograniczenia dynamic workflows (no mid-run
  user input, wersja ≥2.1.154, acceptEdits + allowlist, brak resume po restarcie sesji,
  `disableWorkflows`).
- https://code.claude.com/docs/en/sub-agents — narzędzia niedostępne w subagentach
  (AskUserQuestion…), nested subagenty, ograniczenia frontmatter plugin-subagentów.
- Katalog modeli Claude API (2026-06) — okna kontekstu (1M / 200K Haiku), max output
  (128K / 64K Haiku).
- https://code.claude.com/docs/en/skills — scalenie komend ze skillami,
  `disable-model-invocation`, argumenty (`$N` 0-based), `${CLAUDE_SKILL_DIR}` (runda 2).
- https://code.claude.com/docs/en/sub-agents — Skill tool w subagentach, preload
  `skills:`, `isolation: worktree` (runda 2).
- https://code.claude.com/docs/en/plugins-reference + /en/plugin-marketplaces — zakres
  `${CLAUDE_PLUGIN_ROOT}`, brak pola `deprecated` (najbliższe: `renames`) (runda 2).
- https://code.claude.com/docs/en/tools-reference — brak tokenizera dla skryptów
  (potwierdzenie estymatora) (runda 2).
