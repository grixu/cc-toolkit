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

- `hash(element)` = hash znormalizowanej treści bloku elementu.
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
planned → ready → in-progress → implemented
```

Dodatkowo:
- `stale` — tylko task nie-shipped, którego `input_hash` się rozjechał; treść regenerowana w miejscu.
- `dropped` — element usunięty i nigdy nie dostarczony → plik taska kasowany.

Task **shipped** (dostarczony do main) jest immutable — drift domyka się nowym taskiem
korygującym, nie edycją.

### 2.4 Reconcile — współdzielona operacja

Reconcile jest jedną, wspólną rutyną wołaną przez `/from-docs` (re-run), `/grill`,
`/to-tasks` i `/implement` przy każdym wejściu:

1. Parsuj spec → hashe elementów → rollup.
2. Diff wobec manifestu: added / removed / modified / unchanged per element.
3. Klasyfikuj `modified` breaking / non-breaking (zachowawczo: modyfikacja kontraktu =
   breaking, chyba że dowodnie addytywna; override przez HIL).
4. Mapuj zmienione elementy → taski → akcje: regen-in-place / task korygujący / task
   usuwający / drop / bez zmian.
5. Propaguj po DAG (przez `input_hash`).
6. **Bramka HIL:** pokaż `reconcile plan` przed apply.
7. Apply: zapisz taski, zaktualizuj manifest, dopisz wpis do historii wersji specu.

### 2.5 Forward-only

Dostarczonej pracy nigdy nie przepisujemy. Kod z poprzednich runów / już w main jest
forward-only: drift domyka trwały task korygujący (jak migracja). Wyjątek dotyczy
**wnętrza bieżącego runu** `/implement` (przed shipem funkcjonalności) — tam wcześniejsze
fale są mutowalne przez taski naprawcze. Granicą jest **ship funkcjonalności** (merge
feature brancha do main), nie merge taska do feature brancha.

Tożsamość tasku jest deterministycznym kluczem po zbiorze produkowanych elementów —
ponowny `/to-tasks` jest reconcile, nie generacją od zera; dopasowanie desired ↔ existing
idzie po maksymalnym pokryciu.

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

Grill jest blokiem współdzielonym przez `/start`, `/from-docs` i `/grill`
(`GRILLING.md`); grounding jest współdzielonym subagentem (`RESEARCHER.md`); reguły
budowania specu — `BUILDING_SPEC.md`; zależności między funkcjonalnościami —
`CROSS_FEATURE.md`.

---

## 4. Struktura katalogu funkcjonalności

### 4.1 Layout — tryb `per-feature` (default)

```
docs/features/<slug>/
  spec.md              # elementy jako bloki z ID-kotwicami
  state.json           # meta funkcjonalności (§4.4)
  feature.lock.json    # manifest / ledger, commitowany (§4.4)
  ac-map.json          # mapa AC ↔ FR/NFR
  sc-map.json          # mapa SC (projekcja, liczona skryptem)
  sources-map.json     # proweniencja claim → źródło
  CONTEXT.md           # model domenowy per-feature
  sources/             # skopiowane ADR / research / docs (/from-docs)
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

- `KIND` ∈ { `DB`, `API`, `CFG`, `OBS`, `INF`, `INT`, `MOD`, `DESIGN`, `AC`, `FR`,
  `NFR` } — rozszerzalny; słownik = lista rodzajów elementów ze specu. Prefiks działa
  jak checklista kompletności.
- Numer append-only per `KIND` (high-water-mark w manifeście → `idCounters`).
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
  "idCounters": { "DB": 3, "API": 2, "CFG": 1, "AC": 5, "FR": 2, "NFR": 1 },
  "elements": {
    "DB-3": { "hash": "h2", "deliveredHash": "h1", "version": 2, "producer": "T-004", "status": "drifted" }
  },
  "tasks": {
    "T-004": {
      "identityKey": ["DB-3"], "produces": ["DB-3"],
      "consumes": ["T-002::API-2@v1"], "covers": ["AC-5", "FR-2"],
      "inputHash": "…", "specHash": "…", "status": "implemented",
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
  "boundedContext": null,
  "specHash": "sha256:…", "tasksHash": null, "waveInProgress": false, "manifest": "feature.lock.json"
}
```

`boundedContext` ustawiany tylko w trybie `shared` + `per-bounded-context`
(`COMMAND_CONFIG.md`); w pozostałych trybach `null`. `tasksHash` = rollup `input_hash`
wszystkich tasków (analogicznie do `spec_hash` z §2.2); `null`, dopóki taski nie
istnieją. Wiąże verdykt DoR tasków (§5.4).

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
**nie proponuje jego uruchomienia**.

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

### 5.3 Walidacja jako krok, enforcement u konsumenta

Nie ma osobnej komendy `/validate`.

- **Produkcja waliduje na końcu:** `/start`, `/from-docs`, `/grill` po zapisie specu
  odpalają walidację specu (osobny czysty subagent) → zapisują verdykt związany z
  `specHash`. Analogicznie `/to-tasks` w ogonie waliduje taski.
- **Konsument egzekwuje na wejściu:** `/to-tasks` na starcie czyta `readiness.spec` —
  jeśli `blocked` lub hash stale, **odmawia**, raportuje powód, podpowiada fix (zwykle
  `/grill`). Analogicznie `/implement` egzekwuje `readiness.tasks`. Konsument nie
  re-waliduje po cichu.
- **Re-walidacja** po poprawce idzie przez `/grill` (właściciel mutacji specu + reconcile;
  ogon = ponowna walidacja).

### 5.4 Blok `readiness` (w `state.json`)

`validatedHash` = snapshot, wobec którego liczono verdykt; rozjazd z bieżącym hashem
artefaktu ⇒ verdykt stale. Wiązanie jest symetryczne: verdykt `spec` wobec
`state.json.specHash`, verdykt `tasks` wobec `state.json.tasksHash` (§4.4). Zmiana specu
bumpuje `input_hash` dotkniętych tasków → rusza `tasksHash` → verdykt tasków też staje się
stale, więc `/implement` nie zadziała na nieaktualnym zestawie.

```json
"readiness": {
  "spec":  { "verdict": "ready|blocked", "validatedHash": "<merkle>",
             "failedChecks": [], "waivedChecks": [{ "id": "", "by": "human", "at": "" }] },
  "tasks": { "verdict": "ready|blocked", "validatedHash": "<merkle>",
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
| Wybór bounded-context (per-feature) | `/start`, `/from-docs` (tryb shared + per-BC) | HIL |
| Tryb docs (CONTEXT per-feature / shared) | `/from-docs`, `/config` | HIL |
| Reconcile-plan przed apply | `/from-docs` (re-run), `/grill`, `/to-tasks`, `/implement` (re-entry) | HIL |
| Walidacja spec (DoR) | `/start`, `/from-docs`, `/grill` — ogon | block → verdykt |
| Enforcement DoR spec | `/to-tasks` — wejście | block |
| Oversize task split / merge | `/to-tasks` | HIL |
| Martwe symbole (możliwa zewn. konsumpcja) | `/to-tasks` — walidacja SC | HIL |
| Walidacja tasków (DoR) | `/to-tasks` — ogon | block → verdykt |
| Enforcement DoR tasków | `/implement` — wejście | block |
| Per-task AC + lint zmian przed merge | `/implement` | block |
| Per-fala pełne CI (lint + test + build) | `/implement` | block |
| Post-CI code review (≥1 skill) | `/implement` | gate |
| K-iter fail — eskalacja | `/implement` | HIL |
| Manual PR grouping | `/to-prs` | HIL |
| Niezmiennik składalności (buildability) | `/to-prs` | block |

---

## 6. Konfiguracja

Konfiguracja żyje w `.claude/fd-config.json`; jej pełny, skomentowany schemat to
`config.example.jsonc`, a przebieg tworzenia opisuje `COMMAND_CONFIG.md`. Config jest
warunkiem wstępnym: brak / niepoprawny / niezgodna `schema` → każda komenda zatrzymuje
się i prosi o uruchomienie `/config`.

Domyślne wartości: język `en`, tryb `per-feature`, katalog `docs/features/<slug>/`,
budżet kontekstu taska `250000` tokenów, model PR `stacked`, waiver dozwolony.

---

## 7. Mapa dokumentów

- `SPEC.md` — ten dokument: model, layout, ID, stan, architektura bramek.
- `config.example.jsonc` — skomentowany `fd-config.json` + `bounded-contexts.json`.
- `BUILDING_SPEC.md` — reguły i format specu, wymiary walidacji, język.
- `GRILLING.md` — współdzielony agent grilla (skille, CONTEXT.md, tryby).
- `RESEARCHER.md` — współdzielony subagent groundingu (źródła, `sources-map.json`).
- `COMMAND_CONFIG.md`, `COMMAND_START.md`, `COMMAND_FROM_DOCS.md`, `COMMAND_GRILL.md`,
  `COMMAND_TO_TASKS.md`, `COMMAND_IMPLEMENT.md`, `COMMAND_TO_PRS.md`,
  `COMMAND_STATUS.md` — po jednej na komendę.
- `CROSS_FEATURE.md` — zależności między funkcjonalnościami (poziom programu).
