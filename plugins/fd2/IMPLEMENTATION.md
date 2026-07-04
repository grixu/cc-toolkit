# Implementacja — mapowanie na plugin, schematy, migracja, testy

Sprawy implementacyjne, nie modelowe: jak zestaw spec przekłada się na strukturę
pluginu Claude Code, jakie kształty mają artefakty JSON, co się dzieje przy niezgodnym
`schema` i jak plugin jest testowany. Model i zachowania — `SPEC.md` i `COMMAND_*.md`.

---

## 1. Struktura pluginu (D1)

Nazwa pluginu = **`fd`** (namespace komend — `SPEC.md` §3); katalog `plugins/fd2/`
zmienia nazwę na `plugins/fd/` przy implementacji.

```
plugins/fd/
  .claude-plugin/plugin.json   # name: "fd" → /fd:…
  commands/                    # 8 komend, proste pliki md — tylko jawne wywołanie
    config.md  start.md  from-docs.md  grill.md
    to-tasks.md  implement.md  to-prs.md  status.md
  agents/
    researcher.md              # RESEARCHER.md; tools: firecrawl, context7, codebase-memory
    validator.md               # czysty subagent walidacji, wymiar podawany w prompcie;
                               # w tools także Agent (nested researcher — RESEARCHER.md §1)
  references/                  # współdzielone bloki, ładowane przez ${CLAUDE_PLUGIN_ROOT}
    GRILLING.md  BUILDING_SPEC.md  CROSS_FEATURE.md
    CONTEXT-FORMAT.md  ADR-FORMAT.md   # formaty własne (B4) — do napisania
  scripts/                     # Node.js, zero zależności (SPEC.md §2.6)
    hasher.mjs                 # hashe elementów, input_hash, rollupy
    project-maps.mjs           # projekcje sc-map + ac-map (+ walidacja acykliczności)
    estimate-tokens.mjs        # ⌈znaki / 4⌉ na złożonym pliku taska
    migrate.mjs  migrations/   # łańcuch migracji schematów (§3)
  schemas/                     # JSON Schema artefaktów (§2)
  examples/config.example.jsonc
  tests/                       # golden testy skryptów + fixtures (§4)
  evals/                       # e2e promptfoo (§4)
```

Zasady mapowania:

- **`commands/` zamiast `skills/`** — komendy fd są ciężkie i mutujące; proste pliki
  md wywołuje wyłącznie user, bez auto-inwokacji z dopasowania po description.
- **`commands/*.md` to destylat, nie kopia `COMMAND_*.md`** — plik komendy jest
  wykonywalnym promptem (flow, bramki, odwołania do references/ i scripts/); zestaw
  spec pozostaje dokumentacją projektową poza runtime'em pluginu.
- **Jeden `validator.md`**, uruchamiany per wymiar (6 wymiarów specu / 4 tasków) z
  wymiarem w prompcie — nie dziesięć definicji subagentów.
- Plugin nie bundluje hooków ani serwerów MCP — firecrawl / context7 /
  codebase-memory są wykrywane u usera (`/config`).

---

## 2. Schematy artefaktów JSON (D2)

Każdy artefakt JSON workspace'u ma **JSON Schema** (draft 2020-12) w `schemas/`;
skrypty walidują wobec schematu przy każdym odczycie i zapisie. Kształty
`feature.lock.json` i `state.json` definiuje `SPEC.md` §4.4; poniżej kształty
kanoniczne pozostałych trzech (klucze angielskie, jak w manifeście).

**`sc-map.json`** — projekcja grafu tasków (`COMMAND_TO_TASKS.md` §6). Tylko węzły i
krawędzie intra-feature; fale są liczone on-the-fly (`COMMAND_IMPLEMENT.md` §3), refy
cross-feature żyją w bloku `upstream` manifestu:

```json
{
  "schema": 1,
  "generatedFrom": { "tasksHash": "sha256:…" },
  "nodes": ["T-001", "T-004"],
  "edges": [ { "from": "T-004", "to": "T-002", "contract": "T-002::API-2@v1" } ]
}
```

`from` = konsument, `to` = producent. `generatedFrom` wiąże projekcję z wejściem —
rozjazd z bieżącym rollupem ⇒ projekcja stale, do przeliczenia.

**`ac-map.json`** — projekcja z linii `covers:` w blokach AC (`SPEC.md` §4.1):

```json
{
  "schema": 1,
  "generatedFrom": { "specHash": "sha256:…" },
  "acs": { "AC-5": { "covers": ["FR-2", "NFR-1"] } }
}
```

**`sources-map.json`** — proweniencja `claim → źródło` (`RESEARCHER.md` §4–5;
rekord `{fakt, cytat, źródło}` → klucze `fact` / `quote` / `source`):

```json
{
  "schema": 1,
  "records": [
    {
      "claim": "Stripe API wymaga idempotency-key dla POST",
      "fact": "…", "quote": "…",
      "source": { "type": "web", "ref": "sources/web/stripe-idempotency.md",
                  "url": "https://docs.stripe.com/…" },
      "anchors": ["API-2", "AC-5"],
      "groundedAt": "2026-07-04T12:00:00Z"
    }
  ]
}
```

`source.type` ∈ `web | file | code | fd-spec | adr`; `ref` wskazuje lokalny snapshot /
plik / kwalifikowany symbol; `anchors` — elementy / AC, których claim dotyczy.

---

## 3. Migracja schematów (D3)

Każdy artefakt niesie `schema` (int). Zachowanie przy odczycie:

- **Równy** znanemu → normalna praca.
- **Niższy** (workspace starszy niż plugin) → **auto-migracja forward-only**:
  łańcuch kroków `1→2→3…` w `scripts/migrations/`, po jednym module na skok wersji
  danego artefaktu. Przed zapisem: backup (`<plik>.bak-schema<N>`), raport zmian,
  **potwierdzenie HIL**; migracja jest częścią wejścia komendy, nie osobną komendą.
- **Wyższy** (workspace nowszy niż plugin) → twardy block „workspace wymaga nowszej
  wersji pluginu — zaktualizuj `fd`".

Workspace'y v1 (`feature-delivery`) są **poza migracją** — to inny produkt; `fd` nie
czyta i nie konwertuje katalogów v1 (świeży start per funkcjonalność).

---

## 4. Strategia testów (D4)

Piramida: wszystko deterministyczne testujemy tanio i gęsto (golden), zachowania
LLM-owe — kilkoma drogimi smoke'ami e2e.

**Golden testy skryptów** — `node:test`, zero zależności, fixtures w `tests/fixtures/`,
odpalane w CI repo:

- **hasher**: ekstrakcja bloków (poziomy nagłówków, ostatni blok do EOF), normalizacja
  (CRLF / CR, trailing whitespace, kolaps pustych linii, NFC — przypadki ze znakami
  składanymi), kanoniczny `input_hash` (sortowanie kluczy, kompakt), rollupy (pusty
  zbiór tasków → `null`) — kontrakt `SPEC.md` §2.6 przypadek po przypadku.
- **project-maps**: projekcje sc-map / ac-map z fixture-specu; cykl w SC → błąd;
  `generatedFrom` wiązane poprawnie.
- **estimate-tokens**: ⌈znaki / 4⌉, granice budżetu.
- **migrations**: fixture w `schema: N` → oczekiwany artefakt w `N+1`; odmowa przy
  wyższym `schema`.

**E2E promptfoo** — wzorzec z `plugins/comment-review/evals/` (provider
`anthropic:claude-agent-sdk`, `plugins: [{type: local, path: …}]`). Gotchas już
zweryfikowane w repo: prompty naturalnojęzykowe (literalne `/fd:…` nie działa w SDK),
asercje po **artefaktach na dysku** (nie po `skill-used`, które dla pluginów zostaje
puste). Scenariusze smoke:

1. `/config` na fixture-repo → poprawny, walidowalny `fd-config.json`;
2. `/start` z mini-tematem → `spec.md` + manifest + verdykt `readiness.spec`;
3. staleness: edycja elementu w fixture-workspace → reconcile markuje właściwe taski
   `stale` (i tylko je).

---

## 5. Zachowania zdegenerowane (D5) — skorowidz

Nazwane przy właścicielach zachowań:

- trywialny spec → 1 task, SC bez krawędzi — `COMMAND_TO_TASKS.md` §4;
- generacja jednowarstwowa (mały ficzer → jeden subagent) — `COMMAND_TO_TASKS.md` §5;
- 1 task → 1 fala, 1 worktree, zero równoległości — `COMMAND_IMPLEMENT.md` §4;
- 1 task / 1 grupa → pojedynczy PR zamiast stacka — `COMMAND_TO_PRS.md` §5;
- brak tasków → `tasksHash: null` — `SPEC.md` §2.6.
