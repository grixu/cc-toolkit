# ISSUES_TO_FIX — przegląd specyfikacji fd2 (2026-07-03)

Wynik przeglądu kompletności i spójności zestawu spec (14 plików), zweryfikowany
względem oficjalnej dokumentacji Claude Code (workflows, sub-agents) i aktualnych
limitów modeli. Status per pozycja: `[ ]` otwarte / `[x]` rozstrzygnięte (dopisać
decyzję i miejsce zmiany).

Wszystkie sekcje (A–D) rozstrzygnięte 2026-07-04. Otwarte pozostają zadania
implementacyjne wskazane w decyzjach (m.in. pliki formatów z B4, rename katalogu z C7).

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
