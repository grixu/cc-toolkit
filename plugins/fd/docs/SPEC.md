# feature-delivery (fd2) — Specyfikacja

Plugin do Claude Code prowadzący pojedynczą funkcjonalność (*feature*) od pomysłu lub
dostarczonych dokumentów, przez zwalidowaną specyfikację i samodzielne zadania, aż po
zaimplementowany i dostarczony w stacked-PR kod.

Ten dokument jest **kręgosłupem**: definiuje model rdzeniowy, strukturę katalogu
funkcjonalności, schemat identyfikatorów, pliki stanu oraz architekturę bramek jakości.
Pliki komend (`COMMAND_*.md`) i bloków współdzielonych (`BUILDING_SPEC.md`,
`GRILLING.md`, `RESEARCHER.md`, `CROSS_FEATURE.md`) opisują szczegóły, referując
pojęcia stąd — nie powtarzają ich.

---

## 1. Idea

Punktem wyjścia jest obserwacja, że agentowa implementacja jest przewidywalna dokładnie
w tym stopniu, w jakim przewidywalna jest specyfikacja, z której wychodzi. Plugin
adresuje kilka powtarzalnych słabości takiego procesu:

- **Spec bywa zbyt ogólny** — implementacja staje się loterią. Dlatego spec jest
  kompletnym, czytelnym dla człowieka kontraktem wymagań (FR / NFR / AC) i podlega
  twardej walidacji przed przejściem dalej.
- **Spec bazuje na samej wiedzy modelu** — dlatego każde zewnętrzne twierdzenie jest
  gruntowane w kodzie projektu, dokumentacji (context7) i sieci (firecrawl), a
  proweniencja jest zapisywana.
- **Zmiana wymagań rozjeżdża artefakty** — dlatego spec jest jedynym źródłem prawdy, a
  taski, mapy i kod są jego projekcją; zmiana specu uruchamia chirurgiczną
  rekoncyliację, nie regenerację od zera.
- **Człowiek traci kontrolę nad autonomicznym procesem** — dlatego każda komenda jest
  dyskretną jednostką, która kończy pracę, waliduje i oddaje sterowanie; nie ma
  auto-chainingu.

Filozofia w jednym zdaniu: **deklaratywny rdzeń (spec → projekcja → kod), twarde bramki
jakości, człowiek prowadzi progresję**.

---

## 2. Model rdzeniowy

### 2.1 Deklaratywna projekcja

- **Spec** = źródło prawdy (desired state).
- **Taski + mapa SC + mapy AC** = projekcja specu (liczona, nie autorowana ręcznie).
- **Kod** = actual state.
- **Reconcile** = `diff(desired, actual)` → plan tylko-delty.

Konsekwencja: nic w dół grafu nie jest pisane ręcznie tam, gdzie da się to wyliczyć.
Mapa SC i mapy pokrycia są projekcjami; ręcznie edytowalny jest wyłącznie spec (przez
grill) oraz rejestry, których nie da się wywnioskować (konfiguracja, bounded contexts).

### 2.2 Wersjonowanie treści (Merkle)

Każdy dyskretny element specu ma stabilne logiczne ID (np. `DB-3`, `API-2`, `AC-5`),
alokowane append-only — nigdy nie renumerowane ani reużywane po usunięciu.

- `hash(element)` = hash znormalizowanej treści bloku elementu (kontrakt ekstrakcji,
  normalizacji i serializacji — §2.6).
- `input_hash(task)` = hash(produkowane elementy + hashe konsumowanych kontraktów +
  pokrywane AC / FR / NFR).
- `spec_hash` (rollup) = hash wszystkich hashy elementów.

Task jest **stale** ⇔ przeliczony `input_hash` ≠ zapisany. To daje **chirurgiczną
inwalidację**: zmiana jednego elementu unieważnia wyłącznie taski, które faktycznie go
konsumują, a nie cały zestaw. Kaskada po grafie SC wynika naturalnie z `input_hash`
konsumentów — bez osobnego mechanizmu propagacji.

Krawędź w grafie jest wersjonowana kontraktem: `T-002::API-2@v1`. Sufiks `@v` startuje
od `v1` i rośnie **tylko** przy zmianie breaking już-dostarczonego elementu.

### 2.3 Maszyna stanów tasku

```
planned → ready → in-progress → implemented → shipped
```

Dodatkowo:
- `stale` — tylko task nie-shipped, którego `input_hash` się rozjechał; treść regenerowana w miejscu.
- `dropped` — element usunięty i nigdy nie dostarczony → plik taska kasowany.

Właściciele przejść: `planned` nadaje `/to-tasks` przy generacji; `ready` ustawia
`/to-tasks` po passie walidacji tasków (DoR); `in-progress` — `/implement` (goal) na
starcie fali; `implemented` — `/implement` po zielonych bramkach taska. Przejścia do
`shipped` nie wykonuje żadna komenda wprost — ustawia je **detekcja shipu** w reconcile
(§2.4, krok 1), gdy commity taska są osiągalne z `baseBranch`. Task **shipped**
(dostarczony do main) jest immutable — drift dostarczonej pracy jest poza zakresem tej
funkcjonalności i domyka go nowa funkcjonalność (§2.5).

### 2.4 Reconcile — współdzielona operacja

Reconcile jest jedną, wspólną rutyną wołaną przez `/from-docs` (re-run), `/grill`,
`/to-tasks` i `/implement` przy każdym wejściu. Dzieli się na **detekcję** (kroki 1–6)
i **apply** (kroki 7–8); detekcja jest wspólna, zakres apply zależy od komendy:

1. **Detekcja shipu:** dla tasków `implemented` sprawdź osiągalność ich commitów
   (`impl.commits`) z `baseBranch` (`git merge-base --is-ancestor`). Osiągalne → flip
   `implemented → shipped` oraz `pending → delivered` (+ `deliveredHash`) dla
   produkowanych elementów. Nieosiągalne → porównaj patch-id commitów taska z historią
   `baseBranch` (`git patch-id` / `git cherry`); dopasowanie = podejrzenie squash-merge
   → HIL — **zbiorczy** (jedna decyzja potwierdza wiele tasków naraz; przy polityce repo
   „squash and merge" to ścieżka regularna, nie wyjątek). Flip statusów to synchronizacja
   z rzeczywistością gita — wykonuje ją każda komenda wołająca reconcile; nie rusza
   `input_hash` ani verdyktów DoR.
2. Parsuj spec → hashe elementów → rollup.
3. Diff wobec manifestu: added / removed / modified / unchanged per element.
4. Klasyfikuj `modified` breaking / non-breaking (zachowawczo: modyfikacja kontraktu =
   breaking, chyba że dowodnie addytywna; override przez HIL).
5. Mapuj zmienione elementy → taski → akcje: regen-in-place / drop / bez zmian. Zmiana
   lub usunięcie elementu `delivered` → **block**: taka zmiana jest poza zakresem tej
   funkcjonalności — domyka ją nowa funkcjonalność (§2.5).
6. Propaguj po DAG (przez `input_hash`).
7. **Bramka HIL:** pokaż `reconcile plan` przed apply.
8. Apply — zakres per komenda:
   - `/grill`, `/from-docs` (re-run): zapisz spec + manifest (hashe, historia wersji);
     dotknięte taski **markuj `stale` w manifeście** — plików tasków nie przepisuj.
   - `/to-tasks`: pełny apply — **jedyny właściciel zapisu plików tasków** (regen /
     korekta / drop) + manifest; ogon od razu odtwarza verdykt `readiness.tasks`.
   - `/implement`: **bez apply** — sama detekcja; wykryty drift specu / tasków = twardy
     block „uruchom `/to-tasks`" (kroki 7–8 pomijane).

### 2.5 Forward-only

Dostarczonej pracy nigdy nie przepisujemy — i nie ma pętli powrotnej po zakończonej
implementacji: gdy wszystkie taski funkcjonalności są `implemented` / `shipped`, ścieżka
grill → to-tasks → implement jest dla niej zamknięta (guard na wejściu `/grill` i re-run
`/from-docs`), a zmiany wymagań domyka **nowa funkcjonalność** — nowy spec, który może
konsumować kontrakty starej (`CROSS_FEATURE.md`). Wewnątrz bieżącego runu `/implement`
wcześniejsze fale są mutowalne przez taski naprawcze. Ship funkcjonalności (merge feature
brancha do main) wykrywa mechanicznie detekcja shipu w reconcile (§2.4, krok 1).

Tożsamość tasku jest deterministycznym kluczem po zbiorze produkowanych elementów —
ponowny `/to-tasks` jest reconcile, nie generacją od zera; dopasowanie desired ↔ existing
idzie po maksymalnym pokryciu.

### 2.6 Kontrakt hashera

Hashe liczy wyłącznie **skrypt** (`scripts/`, Node.js, bez zależności zewnętrznych) —
LLM nigdy nie liczy hasha. Skrypt woła na wejściu każda komenda, także `/status`
(raport staleness wymaga świeżych hashy; samo liczenie jest read-only).

**Ekstrakcja bloku:** blok elementu zaczyna się linią nagłówka z kotwicą i sięga do
następnego nagłówka o poziomie ≤ poziomowi kotwicy albo końca pliku. Kotwicę definiuje
regex `^(#{1,6}) ([A-Z]{2,16})-([1-9][0-9]*) — ` (np. `#### DB-3 — Tabela użytkowników`);
nagłówki niepasujące do wzorca nie są elementami. Słownik `KIND` = klucze `idCounters`
manifestu: nagłówek pasujący do wzorca, lecz z `KIND` spoza słownika, nie zakłada po
cichu nowego rodzaju — flaguje go walidacja „Spójność strukturalna" → HIL (zaakceptuj
nowy `KIND` → dopis do `idCounters`, albo popraw literówkę). Linia nagłówka **wchodzi w
treść bloku** — zmiana tytułu zmienia hash; o wadze zmiany decyduje klasyfikacja
breaking / non-breaking (§2.4, krok 4), nie hash.

**Normalizacja treści bloku**, w kolejności: (1) końce linii CRLF / CR → LF; (2) usuń
trailing whitespace każdej linii; (3) skolapsuj sekwencje pustych linii do jednej;
(4) usuń puste linie wiodące i końcowe bloku; (5) Unicode NFC. `hash(element)` =
SHA-256 bajtów UTF-8 znormalizowanej treści, zapisywany jako `sha256:<hex>`.

**Kanoniczna serializacja `input_hash(task)`:** JSON
`{"consumes":{"<ref>":"<hash>"},"covers":{"<ID>":"<hash>"},"produces":{"<ID>":"<hash>"}}`
z kluczami posortowanymi leksykograficznie na każdym poziomie, kompaktowy (bez
whitespace), UTF-8 → SHA-256. Hash konsumowanego kontraktu: dla refów intra
(`T::EL@vN`) — świeży hash elementu policzony ze `spec.md` własnej funkcjonalności
(nie pole manifestu — po ręcznej edycji byłoby nieaktualne, §5.4); dla refów cross-feature
(`slug#EL@vN`) — bieżący hash elementu z manifestu Y (live-read w workspace); dla specu
spoza workspace'u (forma `path + hash`) — hash z pinu `upstream`. Non-breaking zmiana
konsumowanego elementu upstream rusza więc `input_hash` konsumenta — celowo: wymusza
odświeżenie skopiowanej treści kontraktu (markery `fd:copy` — `CROSS_FEATURE.md` §1).

**Rollupy:** `spec_hash` = SHA-256 kanonicznego JSON `{"<ID>":"<hash>"}` po wszystkich
elementach; `tasksHash` analogicznie po `{"<ID taska>":"<input_hash>"}`. Brak tasków →
`tasksHash: null`, nie hash pustej mapy.

**Integralność pliku taska:** przy zapisie taska `/to-tasks` liczy `contentHash` = hash
znormalizowanej (jak wyżej) pełnej treści pliku i zapisuje go w manifeście
(`tasks[].contentHash`). Treść taska nie wchodzi w `input_hash` (ten wiąże wejścia
projekcji), więc bez `contentHash` ręczna edycja „generated-only" pliku byłaby
niewykrywalna; rozjazd `contentHash` jest driftem tasków — reconcile-detekcja traktuje
go jak każdy inny drift (`/implement` → twardy block „uruchom `/to-tasks`").

---

## 3. Komendy

Osiem komend. Żadna nie uruchamia następnej — każda kończy pracę na granicy i oddaje
sterowanie (patrz §5.1).

| Komenda | Rola | Szczegóły |
|---|---|---|
| `/config` | Detekcja stacku, wybór trybów, zapis `.claude/fd-config.json` | `COMMAND_CONFIG.md` |
| `/start` | Spec z tematu: temat → grill → spec → walidacja | `COMMAND_START.md` |
| `/from-docs` | Spec z dokumentów: źródła → analiza → grill → spec → walidacja | `COMMAND_FROM_DOCS.md` |
| `/grill` | Drążenie i zmiana istniejącego specu + reconcile + re-walidacja | `COMMAND_GRILL.md` |
| `/to-tasks` | Dekompozycja specu na samodzielne taski + mapa SC + walidacja | `COMMAND_TO_TASKS.md` |
| `/implement` | Pętla implementacji falami (dynamic workflow, worktree, CI/CR) | `COMMAND_IMPLEMENT.md` |
| `/to-prs` | Wycięcie stacked-PR z feature brancha do ludzkiego CR | `COMMAND_TO_PRS.md` |
| `/status` | Read-only wgląd w stan funkcjonalności | `COMMAND_STATUS.md` |

Nazwa pluginu — a więc **namespace komend** — to **`fd`**: komendy wywołuje się jako
`/fd:config`, `/fd:grill`… (Claude Code zawsze namespace'uje komendy pluginów nazwą
pluginu, więc kolizja z v1 `feature-delivery` nie występuje). W dokumentach piszemy
krótko `/grill` = `/fd:grill`. Plugin v1 (`feature-delivery`) pozostaje nietknięty —
v2 to osobny produkt, bez migracji i bez zmian w v1.

Grill jest blokiem współdzielonym przez `/start`, `/from-docs` i `/grill`, wykonywanym
w **main thread** komendy — pętla stoi na pytaniach do usera, a `AskUserQuestion` jest
w subagentach niedostępne (`GRILLING.md`); grounding jest współdzielonym subagentem
(`RESEARCHER.md`); reguły
budowania specu — `BUILDING_SPEC.md`; zależności między funkcjonalnościami —
`CROSS_FEATURE.md`.

### 3.1 Wskazanie funkcjonalności

Komendy działające na istniejącej funkcjonalności (`/grill`, `/to-tasks`, `/implement`,
`/to-prs`, `/status`, a także `/from-docs` w trybie re-run) przyjmują **opcjonalny
argument `<slug>`**. Bez argumentu, w kolejności: dokładnie jedna funkcjonalność w
`<featuresRoot>` → bierzemy ją; inaczej dopasowanie po bieżącym branchu
(`state.json.branch`, §4.4); inaczej wybór z listy (HIL). Cold-start (§5.1) wyklucza
„funkcjonalność z poprzedniej komendy".

Slug nadają `/start` i `/from-docs` **wspólnym mechanizmem**: krótki, opisowy kebab-case
wyprowadzony z tematu / źródeł. Kolizja z istniejącym katalogiem funkcjonalności → HIL:
kontynuuj jako re-run istniejącej albo podaj inny slug.

---

## 4. Struktura katalogu funkcjonalności

### 4.1 Layout — tryb `per-feature` (default)

```
docs/features/<slug>/
  spec.md              # elementy jako bloki z ID-kotwicami
  state.json           # meta funkcjonalności (§4.4)
  feature.lock.json    # manifest / ledger, commitowany (§4.4)
  ac-map.json          # mapa AC ↔ FR/NFR — projekcja liczona skryptem z linii covers w blokach AC
  sc-map.json          # mapa SC (projekcja, liczona skryptem)
  sources-map.json     # proweniencja claim → źródło
  CONTEXT.md           # model domenowy per-feature
  sources/             # skopiowane źródła usera + snapshoty web (sources/web/ — RESEARCHER.md §5)
  adr/                 # ADR per-feature
  tasks/
    T-001.md ...
```

### 4.2 Layout — tryb `shared`

`CONTEXT.md` trafia do `<contextRoot>` (per aplikacja / bounded context), ADR do
`<adrRoot>`, a `spec.md` + `state.json` + `feature.lock.json` + mapy + `sources/` +
`tasks/` do `<specsRoot>/<slug>/`. Rejestr bounded contextów żyje w osobnym,
user-editable pliku `bounded-contexts.json` (patrz `COMMAND_CONFIG.md`).

### 4.3 Schemat ID — płaski `<KIND>-<n>`

- `KIND` ∈ { `DB`, `API`, `CONFIG`, `OBSERVABILITY`, `INFRASTRUCTURE`, `INTEGRATION`,
  `MODULE`, `DESIGN`, `AC`, `FR`, `NFR` } — rozszerzalny; słownik żyje w kluczach
  `idCounters` manifestu (zestaw wyżej to seed), nowy `KIND` wchodzi przez HIL walidacji
  „Spójność strukturalna" (§2.6). Prefiks działa jak checklista kompletności.
- Numer append-only per `KIND` (high-water-mark w manifeście → `idCounters`).
  `idCounters` obejmuje też `T`: numery tasków są alokowane tak samo append-only
  (`identityKey` rozwiązuje tożsamość taska, licznik — alokację numerów, także po dropie).
- W specu element = blok z kotwicą, np. `#### DB-3 — Tabela użytkowników`; hasher liczy
  `hash(DB-3)` z treści bloku. Sekcje specu grupują po `KIND`.
- Referencja w dół grafu: `<producerTask>::<element>@v<n>` (np. `T-002::API-2@v1`).
- **Jeden producent (task) na element**; element wymagający >1 producenta → rozbić w
  specu.

### 4.4 Pliki stanu

Stan jest rozdzielony na trzy poziomy: manifest (autorytatywny, commitowany), meta
funkcjonalności (per-feature) oraz pointer we frontmatterze taska.

**`feature.lock.json`** — manifest / ledger reconcile. Commitowany, bo część jest
autorytatywna i nieodtwarzalna (SHA commitów, wynik CI / CR):

```json
{
  "schema": 1,
  "spec": { "hash": "sha256:…", "history": [ { "hash": "sha256:…", "at": "…", "summary": "init" } ] },
  "idCounters": { "DB": 3, "API": 2, "CONFIG": 1, "AC": 5, "FR": 2, "NFR": 1, "T": 4 },
  "elements": {
    "DB-3": { "hash": "h2", "deliveredHash": "h1", "version": 2, "producer": "T-004", "status": "drifted" }
  },
  "tasks": {
    "T-004": {
      "identityKey": ["DB-3"], "produces": ["DB-3"],
      "consumes": ["T-002::API-2@v1"], "covers": ["AC-5", "FR-2"],
      "inputHash": "…", "contentHash": "sha256:…", "specHash": "…", "status": "implemented",
      "impl": { "commits": ["a1b2c3"], "ci": "pass", "cr": "pass" }
    }
  },
  "scMap": "sc-map.json"
}
```

`elements[].status` ∈ `pending | delivered | drifted`: `pending` — jeszcze
niedostarczony; `delivered` — dostarczony do main (`deliveredHash` ustawiony, `hash` =
`deliveredHash`); `drifted` — dostarczony, lecz bieżący `hash` ≠ `deliveredHash` (breaking
→ bump `@v`). To status **elementu**, odrębny od statusu **tasku** (§2.3); `delivered`
elementu ⇔ jego task-producent jest shipped.

Manifest dostaje też blok `upstream` dla zależności cross-feature (patrz
`CROSS_FEATURE.md`).

**`state.json`** — meta funkcjonalności; trzyma też blok `readiness` (§5.4):

```json
{
  "schema": 1, "slug": "user-onboarding", "title": "User onboarding",
  "language": "en", "createdFrom": "topic", "phase": "spec",
  "boundedContext": null, "branch": null,
  "specHash": "sha256:…", "tasksHash": null, "waveInProgress": false, "manifest": "feature.lock.json"
}
```

`boundedContext` ustawiany tylko w trybie `shared` + `per-bounded-context`
(`COMMAND_CONFIG.md`); w pozostałych trybach `null`. `tasksHash` = rollup `input_hash`
wszystkich tasków (analogicznie do `spec_hash` z §2.2); `null`, dopóki taski nie
istnieją. Wiąże verdykt DoR tasków (§5.4).

`phase` ∈ `spec | tasks | implementing | shipped` — gruby wskaźnik progresji (dla
`/status` i sugestii następnego kroku): `spec` ustawiają `/start` / `/from-docs`;
`tasks` — `/to-tasks` po pierwszym apply; `implementing` — `/implement` na starcie
pierwszej fali; `shipped` — detekcja shipu (§2.4), gdy wszystkie taski są `shipped`.

`branch` = feature branch funkcjonalności. Ustawia go `/implement` przy pierwszym
uruchomieniu: szablonem z configu (`implement.branchTemplate`, default `feat/<slug>`)
albo **adopcją bieżącego brancha**, gdy user już siedzi na branchu odbitym z
`prs.baseBranch` i z nią aktualnym (wtedy bez pytania i bez tworzenia). Od tej pory
wiąże funkcjonalność z branchem dla `/implement`, `/to-prs` i heurystyki wskazania
funkcjonalności (§3.1).

**Frontmatter taska** (`tasks/T-004.md`) — pointer do manifestu:

```yaml
id: T-004
title: Tabela użytkowników + migracja
produces: [DB-3]
consumes: [T-002::API-2@v1]
covers: [AC-5, FR-2, NFR-1]
codeDeps: []
builtAgainst: { specHash: "sha256:…", inputHash: "…" }
status: implemented
```

---

## 5. Definition of Ready — architektura bramek

*Definition of Ready* danego etapu to zbiór **twardych checków**, których łączny pass
zapisuje `ready` do stanu i dopiero wtedy dopuszcza następny etap. Dwie symetryczne
bramki: **spec → `/to-tasks`** (rządzona walidacją specu) oraz **taski → `/implement`**
(rządzona walidacją tasków). Treść checków definiują `BUILDING_SPEC.md` (6 wymiarów
specu) i `COMMAND_TO_TASKS.md` (4 wymiary tasków); ten rozdział definiuje **jak** się
bramkuje.

### 5.1 Komenda = dyskretna jednostka; cold-start

Każda komenda kończy pracę, waliduje, **oddaje sterowanie** i zatrzymuje się na granicy.
Zero auto-chainingu. Deweloper przegląda artefakt, kompaktuje / czyści kontekst i sam
odpala następną komendę. Plugin **podpowiada** prawdopodobny następny krok (prozą), ale
**nie proponuje jego uruchomienia**. Zakaz jest egzekwowany także na poziomie platformy:
wszystkie komendy mają we frontmatterze `disable-model-invocation: true`, więc model nie
może ich wywołać Skill toolem — uruchamia je wyłącznie user (`IMPLEMENTATION.md` §1).

Konsekwencja architektoniczna: **każda komenda cold-startuje z workspace'u** (pliki
`.json` stanu + artefakty na dysku, ładowane on-demand) — zero polegania na kontekście
poprzedniej komendy. To domyka i uzasadnia samodzielność tasków, on-demand load specu w
falach, walidację w osobnym czystym subagencie oraz reconcile przy re-entry.

### 5.2 Twarda bramka + waiver tylko-ludzki

Dziurawy spec jest najgroźniejszym defektem, a LLM nie jest godny zaufania w
degradowaniu defektu do „warninga". Dlatego:

- Walidacja klasyfikuje każdy check binarnie **pass / fail** — bez warstw wagi po
  stronie modelu. Każdy fail = **bloker**.
- `verdict = ready` ⇔ wszystkie twarde checki pass; inaczej `blocked(failedChecks[])`.
- Blokadę zdejmuje **wyłącznie człowiek** świadomym, logowanym **waiverem** (per-bloker).
  Model prezentuje faile jako faile — nigdy nie auto-waivuje.
- Verdykt jest **związany z hashem** artefaktu: `validatedHash`. Zmiana specu (także
  ręczna edycja poza komendami) rozjeżdża hash → verdykt jest **stale** → nieważny.

Waiver jest częścią verdyktu i **ginie razem z nim** przy każdym rozjeździe
`validatedHash`. Ponowienie jest tanie: komenda re-walidująca, zanim nadpisze verdykt,
porównuje poprzednie `waivedChecks` z nowymi failami — jeśli ten sam `checkId` nadal
failuje, pokazuje poprzedni waiver i pyta o ponowienie (jedno potwierdzenie, logowane).
Zero cichego dziedziczenia.

### 5.3 Walidacja jako krok, enforcement u konsumenta

Nie ma osobnej komendy `/validate`.

- **Produkcja waliduje na końcu:** `/start`, `/from-docs`, `/grill` po zapisie specu
  odpalają walidację specu (osobny czysty subagent) → zapisują verdykt związany z
  `specHash`. Analogicznie `/to-tasks` w ogonie waliduje taski. Subagent walidacyjny
  tylko zwraca pass / fail + wątpliwości; pytania HIL (waiver, martwe symbole) zadaje
  komenda w main thread — subagenty nie mają `AskUserQuestion`.
- **Konsument egzekwuje na wejściu:** `/to-tasks` na starcie czyta `readiness.spec` —
  jeśli `blocked` lub hash stale, **odmawia**, raportuje powód, podpowiada fix (zwykle
  `/grill`). Analogicznie `/implement` egzekwuje `readiness.tasks`. Konsument nie
  re-waliduje po cichu.
- **Re-walidacja** po poprawce idzie przez `/grill` (mutacja specu + reconcile; ogon =
  ponowna walidacja) albo — przy nowych źródłach — przez re-run `/from-docs`.

### 5.4 Blok `readiness` (w `state.json`)

`validatedHash` = snapshot, wobec którego liczono verdykt; rozjazd z bieżącym hashem
artefaktu ⇒ verdykt stale. Staleness liczy się zawsze wobec **świeżo policzonego**
rollupu (hasher na wejściu komendy — §2.6), nigdy wobec pól `state.json` — te po ręcznej
edycji artefaktu same są nieaktualne. Wiązanie jest symetryczne: verdykt `spec` wobec
bieżącego `spec_hash`, verdykt `tasks` wobec bieżącego `tasksHash` (§4.4). Zmiana specu
bumpuje `input_hash` dotkniętych tasków → rusza `tasksHash` → verdykt tasków też staje się
stale, więc `/implement` nie zadziała na nieaktualnym zestawie.

Verdykt zapisuje też `dimensionsRun` — wymiary walidacji faktycznie wykonane (wg
`validation.dimensions` z configu). `/status` i raport walidacji pokazują różnicę wobec
pełnego zestawu v1, więc wyłączenie wymiaru w configu jest jawne, nie ciche.

```json
"readiness": {
  "spec":  { "verdict": "ready|blocked", "validatedHash": "<merkle>",
             "dimensionsRun": ["structural", "coverage", "grounding", "feasibility", "decomposability", "non-over-spec"],
             "failedChecks": [], "waivedChecks": [{ "id": "", "by": "human", "at": "" }] },
  "tasks": { "verdict": "ready|blocked", "validatedHash": "<merkle>",
             "dimensionsRun": ["frontmatter", "self-contained", "sc-integrity", "coverage"],
             "failedChecks": [], "waivedChecks": [] }
}
```

### 5.5 Kanoniczna tabela bramek

**Warstwa A — checkpoint między-komendowy** (uniwersalny): każda komenda kończy →
waliduje → raportuje verdykt + sugeruje (nie uruchamia) następny krok → oddaje
sterowanie.

**Warstwa B — bramki wewnątrz-komendowe.** Typy: `block` = twarda blokada; `HIL` =
decyzja człowieka; `gate` = miękka bramka jakości, która nie zatrzymuje twardo, lecz
zasila falę napraw (np. code review); `block → verdykt` = twarda bramka zapisująca
wiążący verdykt DoR; `opcjonalny block` = bramka włączana configiem (`/to-prs`
`verifyPerPrCi`); `ostrzeżenie + potwierdzenie` = miękkie potwierdzenie usera
(`/config`, niekrytyczny brak):

| Bramka | Gdzie | Typ |
|---|---|---|
| Brak / niepoprawny config | każda komenda, wejście | block |
| Wybór funkcjonalności (>1, brak dopasowania) | komendy per-feature, wejście (§3.1) | HIL |
| Kolizja sluga przy scaffoldzie | `/start`, `/from-docs` — wejście (§3.1) | HIL |
| Niejednoznaczny ship (np. squash-merge) | reconcile, krok 1 (§2.4) | HIL |
| Wybór bounded-context (per-feature) | `/start`, `/from-docs` (tryb shared + per-BC) | HIL |
| Tryb docs (CONTEXT per-feature / shared) | `/from-docs`, `/config` | HIL |
| Reconcile-plan przed apply | `/from-docs` (re-run), `/grill`, `/to-tasks` | HIL |
| Guard zakończonej implementacji (zmiany → nowa funkcjonalność, §2.5) | `/grill`, `/from-docs` (re-run) — wejście | block |
| Walidacja spec (DoR) | `/start`, `/from-docs`, `/grill` — ogon | block → verdykt |
| Enforcement DoR spec | `/to-tasks` — wejście | block |
| Oversize task split / merge | `/to-tasks` | HIL |
| Martwe symbole (możliwa zewn. konsumpcja) | `/to-tasks` — walidacja SC | HIL |
| Walidacja tasków (DoR) | `/to-tasks` — ogon | block → verdykt |
| Drift specu / tasków w detekcji (bez apply) | `/implement` — wejście | block |
| Enforcement DoR tasków | `/implement` — wejście | block |
| Wybór bazy feature brancha (pierwszy run) | `/implement` — wejście | HIL (pomijany przy adopcji przygotowanego brancha) |
| Salvage: re-check bramki per-task przy recovery | `/implement` — wejście | block (per task) |
| Per-task AC (pokryte w całości) + lint zmian przed merge | `/implement` | block |
| Per-fala scoped CI (fallback: pełne) + AC domykane falą | `/implement` | block |
| Domknięcie: pełne CI repo | `/implement` — domknięcie | block |
| Domknięcie: code review całej funkcjonalności (≥1 skill) | `/implement` — domknięcie | gate |
| K-iter fail — eskalacja | `/implement` | HIL |
| Kompletność implementacji (wszystkie taski `implemented`) | `/to-prs` — wejście | block |
| Przypisanie obcych commitów (bez trailera `Task:`) | `/to-prs` | HIL |
| Manual PR grouping | `/to-prs` | HIL |
| Niezmiennik składalności (buildability) | `/to-prs` | block |
| Konflikt reorder-rebase | `/to-prs` | HIL |

---

## 6. Konfiguracja

Konfiguracja żyje w `.claude/fd-config.json`; jej pełny, skomentowany schemat to
`config.example.jsonc`, a przebieg tworzenia opisuje `COMMAND_CONFIG.md`. Config jest
warunkiem wstępnym: brak / niepoprawny / niezgodna `schema` → każda komenda zatrzymuje
się i prosi o uruchomienie `/config`.

Domyślne wartości: język `en`, tryb `per-feature`, katalog `docs/features/<slug>/`,
budżet kontekstu taska `250000` tokenów (target: modele z oknem ≥512k; estymator —
`COMMAND_TO_TASKS.md` §4), model PR `stacked`, waiver dozwolony.

---

## 7. Mapa dokumentów

- `SPEC.md` — ten dokument: model, layout, ID, stan, architektura bramek.
- `config.example.jsonc` — skomentowany `fd-config.json` + `bounded-contexts.json`.
- `BUILDING_SPEC.md` — reguły i format specu, wymiary walidacji, język.
- `GRILLING.md` — współdzielony blok grilla, main thread (metodyka, CONTEXT.md, tryby).
- `RESEARCHER.md` — współdzielony subagent groundingu (źródła, `sources-map.json`).
- `COMMAND_CONFIG.md`, `COMMAND_START.md`, `COMMAND_FROM_DOCS.md`, `COMMAND_GRILL.md`,
  `COMMAND_TO_TASKS.md`, `COMMAND_IMPLEMENT.md`, `COMMAND_TO_PRS.md`,
  `COMMAND_STATUS.md` — po jednej na komendę.
- `CROSS_FEATURE.md` — zależności między funkcjonalnościami (poziom programu).
- `IMPLEMENTATION.md` — mapowanie na strukturę pluginu, schematy artefaktów JSON,
  migracja `schema`, strategia testów.
