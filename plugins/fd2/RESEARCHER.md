# Researcher — współdzielony subagent groundingu

Grounding to obligatoryjne ugruntowanie każdego zewnętrznego twierdzenia w dowodzie:
kodzie projektu, dokumentacji biblioteki lub źródle z sieci. Wyszukiwanie i fetch są
wydzielone do osobnego subagentu, żeby nie obciążać głównego kontekstu (grilla czy
walidacji) i żeby móc gruntować wiele twierdzeń równolegle.

---

## 1. Kiedy wywoływany

- **Grill** (`GRILLING.md`) — gdy trzeba ugruntować twierdzenie o API / bibliotece /
  frameworku / usłudze 3rd-party w trakcie pisania specu.
- **Walidacja specu, wymiar „Ugruntowanie"** (`BUILDING_SPEC.md` §5) — sprawdzenie, że
  każdy kontrakt zewnętrzny ma cytat, a odwołania do dokumentów usera są wczytywalne.
- **Analiza `/from-docs`** — wyciąganie faktów ze źródeł przy budowie kandydatów i
  `sources-map.json`.

Wzorzec: gdy trzeba ugruntować N twierdzeń → fan-out N (lub zbatchowanych) subagentów,
każdy niezależny, każdy zwraca ustrukturyzowany wynik. Wywołanie z main thread (grill,
analiza) jest zwykłym fan-outem; wywołanie z subagenta walidacji to nested subagent —
subagent walidacji musi mieć `Agent` w `tools`.

---

## 2. Kanały źródeł

Subagent dobiera kanał do rodzaju twierdzenia:

- **codebase-memory-mcp** — istnienie i kształt symboli, kontraktów, architektury w kodzie
  projektu (zależności „istnieje w kodzie").
- **context7** — dokumentacja frameworków, bibliotek, SDK, API, narzędzi CLI (kontrakty
  bibliotek i platform).
- **firecrawl** — wyszukiwanie i scrapowanie sieci (dokumentacja 3rd-party, specyfikacje,
  strony produktowe) tam, gdzie context7 nie pokrywa.

---

## 3. Formaty źródeł

Ingest jest **best-effort** dla dowolnego dokumentu tekstowego (md / pdf / txt /
transkrypt), URL (firecrawl) i kodu projektu (codebase-memory). Dwa formaty są
**pierwszoklasowe** — maszynowo linkowalne:

- **zależny FD-spec** — identyfikowany przez `path + hash` (wejście do zależności
  cross-feature — `CROSS_FEATURE.md`);
- **ADR** — w formacie ADR pluginu (`references/ADR-FORMAT.md`).

---

## 4. Kontrakt zwrotu

Każdy subagent zwraca ustrukturyzowany rekord:

```
{ fakt, cytat, źródło }
```

gdzie `fakt` = ugruntowane twierdzenie, `cytat` = dosłowny wyciąg potwierdzający, `źródło`
= identyfikacja (URL / ścieżka pliku / kwalifikowany symbol + zakres). Rekordy zasilają
`sources-map.json`.

---

## 5. Proweniencja — `sources-map.json`

Spec i taski zostają samodzielne (nie brudzimy ich prozy odnośnikami do źródeł);
traceability `claim → źródło` żyje osobno w `sources-map.json`, obok `ac-map.json` i
`sc-map.json`. Źródła dostarczone przez usera są kopiowane do `sources/`. Efekt: spec
ugruntowany w dowodach usera + zachowane źródła + odtwarzalna proweniencja — bez
zaśmiecania treści.

Źródła-URL są **snapshotowane przy ingestcie**: scrape (firecrawl) do
`sources/web/<slug>.md` z frontmatterem `{ url, retrievedAt, contentHash }`
(`contentHash` = SHA-256 znormalizowanej treści, jak w kontrakcie hashera — `SPEC.md`
§2.6). `sources-map.json` referuje lokalny snapshot, nie żywy URL; check „odwołania
wczytywalne" czyta snapshot — deterministycznie i offline. Zmiana treści u źródła nie
unieważnia walidacji: prawdą jest to, co zostało zescrape'owane (re-check driftu to
ewentualne przyszłe rozszerzenie, nie warunek).

*(Pełny schemat `sources-map.json` jest otwarty — do domknięcia przy schematyzacji
artefaktów. Minimalnie: rekord `{ claim, fakt, cytat, źródło }` z odniesieniem do
elementu / AC, którego dotyczy.)*

---

## 6. Tryb zdegradowany

firecrawl i context7 są zalecane, nie twardo wymagane. `groundingDegraded` to **flaga
pochodna liczona at runtime**: komenda sprawdza faktyczną osiągalność narzędzi firecrawl /
context7 w bieżącej sesji (MCP mogą dojść lub zniknąć po `/config`); `mcp.detected` z
configu służy jako prefill raportu i fallback, gdy sprawdzenia runtime nie da się wykonać.
Brak kanału generuje ostrzeżenie. Obligacja groundingu pozostaje
intencją realizowaną best-effort z dostępnych kanałów (np. sam codebase-memory). Wymiar
walidacji „Ugruntowanie" nadal raportuje braki cytatów jako faile — degradacja nie ukrywa
luk, tylko odnotowuje ograniczoną zdolność ich zamknięcia.
