# `/to-tasks`

Dokonuje projekcji zwalidowanego specu na zbiór **samodzielnych tasków**, liczy mapę SC i
waliduje wynik. Ponowne uruchomienie jest reconcile, nie generacją od zera.

---

## 1. Cel

Podzielić spec na taski, z których każdy jest w pełni autonomicznym plikiem (cała
potrzebna treść skopiowana), przydzielić elementy specu do tasków (jeden producent na
element), wygenerować acykliczną mapę SC i zwalidować taski do stanu `ready`.

---

## 2. Prekondycje

- Config poprawny.
- Wskazanie funkcjonalności: argument `<slug>` / heurystyka / HIL (`SPEC.md` §3.1).
- **Enforcement DoR spec (wejście):** czyta `readiness.spec` wobec świeżo policzonego
  `spec_hash` (hasher na wejściu — `SPEC.md` §2.6/§5.4). Jeśli `blocked` **lub** verdykt
  stale → odmawia, raportuje powód, kieruje do `/grill`. Konsument nie re-waliduje specu
  po cichu.
- Cold-start z workspace'u; wczytuje spec / manifest on-demand.

---

## 3. Format pliku zadania

Markdown z frontmatterem + autonomiczna treść.

**Frontmatter:**
- `id` — unikalny ID taska.
- `title` — zwięzły, czytelny dla usera tytuł.
- `produces` — elementy, które task tworzy (każdy z ID; producent jest jeden).
- `consumes` — zależności z innych tasków w formie `<producerTask>::<element>@v<n>` oraz
  refy cross-feature `<slug>#<element>@vN` (`CROSS_FEATURE.md`).
- `covers` — AC / FR / NFR odnoszące się do taska.
- `codeDeps` — zależności z istniejącego kodu projektu: **realne, istniejące** ścieżki repo,
  weryfikowane przy generacji (nie zgadywane); treść taska osadza te konkretne ścieżki.
- `builtAgainst` — `{ specHash, inputHash }` snapshot, wobec którego zbudowano task.
- `status` — stan maszyny (`SPEC.md` §2.3).

**Parser frontmattera:** plik **musi zaczynać się od `---` w linii 1** (wiodący BOM
tolerowany; cokolwiek innego przed `---` po cichu wyłącza frontmatter i unieważnia
`produces`/`consumes`/`covers`). Frontmatter to **płaski podzbiór YAML**: `key: value` na
najwyższym poziomie, tablice / obiekty tylko inline — wcięte / zagnieżdżone YAML jest
ignorowane.

**Treść:** wszystkie informacje niezbędne do wykonania są **skopiowane** do pliku — nie
odnosimy się do specu, ADR ani innych dokumentów, tylko wklejamy ich istotną treść. Cel:
plik taska daje się wykonać w izolacji, bez sięgania po zewnętrzne artefakty. Skopiowane
fragmenty kontraktów cross-feature są ujęte w markery `fd:copy` (`CROSS_FEATURE.md` §1) —
drift upstream odświeża je maszynowo copy-refresher, bez pełnej regeneracji taska.

---

## 4. Dekompozycja

Dekompozycja to **partycja zbioru elementów specu na taski** — każdy element w dokładnie
jednym tasku, SC acykliczny, pełne pokrycie AC. Nie projektujemy tasków od zera —
przydzielamy elementy do kubełków i tniemy, gdy kubełek rośnie za bardzo.

### Jednostka — hybryda dwuwarstwowa

- **Fundament** — elementy współdzielone / o wysokim fan-oucie (schematy DB, wspólne
  enumy, config, bazowe kontrakty API) → osobne górne taski; konsumenci opierają się o
  wersjonowany kontrakt `@v`.
- **Zdolność (vertical slice)** — taski per AC / zachowanie, tnące warstwy, konsumujące
  fundament.
- Element potrzebny produkcyjnie przez ≥2 slice'y → automatycznie wynoszony do fundamentu
  (reguła „jeden producent").

### Funkcja ograniczająca rozmiar — kaskada

1. **Kohezja (podstawa):** elementy zmieniające się razem / ten sam moduł / ścieżka
   trzymają się w jednym tasku.
2. **Budżet kontekstu (pułap tnący):** złożony plik taska + skopiowane zależności ≤
   `tasks.maxContextTokens` (default 250k). Przekroczenie → split wzdłuż szwu kohezji.
3. **Twarde limity (guardrail):** `≤ maxElements`, `≤ maxAcceptanceCriteria` — domyślnie
   wyłączone (`null`); włączone wymuszają split niezależnie od budżetu.

Przy niejednoznacznej kohezji **bias → split** (mniejsze i więcej): drobne, autonomiczne,
zrównoleglalne w falach, łatwe do review.

### Algorytm dekompozytora

1. **Fundament:** oznacz elementy współdzielone (fan-out ≥ 2 lub KIND kontraktowy: DB /
   CONFIG / wspólne API / enum) → seed tasków fundamentu.
2. **Slice'y:** dla każdego AC zbierz elementy potrzebne do jego spełnienia; sklej AC o
   wspólnym, kohezyjnym zbiorze elementów w jeden slice.
3. **Przydział:** każdy nie-fundamentowy element → slice, który go potrzebuje; jeśli >1
   slice go *produkuje* → wynieś do fundamentu.
4. **Bounding:** w każdym kandydacie sprawdź kaskadę (kohezja → budżet → limity); oversize
   → tnij wzdłuż szwu; niejednoznaczne → split.
5. **SC + acykliczność:** wygeneruj krawędzie z konsumpcji między-taskowej; cykl → wspólny
   element wynieś do własnego tasku fundamentu (cykl = błędna dystrybucja pracy).
6. **Pokrycie:** każde AC pokryte przez ≥1 task; brak martwych / niepokrytych elementów.

**Szacowanie budżetu:** liczymy tokeny złożonego, autonomicznego pliku taska (frontmatter
+ skopiowane fragmenty specu + opisy konsumowanych kontraktów + AC/FR/NFR + snippet-y
`codeDeps`). To realny kontekst wejściowy agenta implementacji. Claude Code nie
udostępnia tokenizera, więc estymator jest zdefiniowany wprost: `tokeny ≈ ⌈znaki / d⌉`,
gdzie `d` = `tasks.charsPerToken` (default `4` — kalibracja pod angielski; dla języków o
gęstszej tokenizacji, np. polskiego, `/config` proponuje `3–3.5` wg `language.default`);
liczony skryptem na złożonym pliku — tani, bo plik i tak składamy przy generacji.
Default 250k celuje w modele z oknem ≥512k (np. Opus 4.8): plik taska + zależności
zajmuje najwyżej połowę okna, a druga połowa zostaje agentowi fali na kod projektu i
wyniki narzędzi. Dla modeli o mniejszym oknie `/fd:config` oferuje niższe pułapy (120k /
40k). Estymata plan-time nie jest bramką końcową — realny plik mierzymy po każdej fali
generacji (§5).

### Edge cases

- **Pojedynczy element > budżet** (nie da się rozciąć — one-producer) → HIL: zaakceptuj
  oversize (`oversized: true`) albo cofnij do specu i rozbij element.
- **Fundament o dużym fan-oucie** → zostaje jednym taskiem; konsumenci zależą tylko od
  `@v`.
- **AC rozłożone na wiele tasków** → `covers` jest wiele-do-wielu; AC „pokryte", gdy
  wszystkie jego elementy mają producenta. Element pozostaje 1:1 z taskiem.
- **Kohezja vs fundament** → współdzielenie wygrywa (wynosimy), bo one-producer jest
  twardy.
- **Trywialny spec** (jeden element / jedno AC) → jeden task, SC bez krawędzi;
  walidacje przebiegają normalnie (pokrycie 1:1), nic nie jest skracane.

---

## 5. Fale generacji

*Fale generacji* (tworzenie plików tasków w batchach-subagentach) ≠ *fale implementacji*
(topologiczne z SC, `COMMAND_IMPLEMENT.md`). SC powstaje **po** taskach, więc generacja
nie może być SC-topologiczna (jajko-kura).

- Partycja generacji = warstwy z §4: **fundament-taski pierwsze, potem slice'y** → refy
  `consumes` konsumentów rozwiązują się do już-znanych ID producentów (jedno przejście); ID
  producentów całego planu przydzielamy przed dispatchem.
- Rozmiar batcha w warstwie: budżet kontekstu / próg >15 tasków. Każda fala to osobny
  subagent piszący swoje pliki tasków. Mały ficzer = jedna warstwa, jeden batch (degeneruje
  do pojedynczego subagenta).
- **Dispatch równoległy:** wszystkie batche warstwy odpalamy **w jednej wiadomości**
  (równoległe wywołania); tak samo fan-out walidatorów (ogon §6). Czekamy na ukończenie
  subagentów wprost — bez `sleep`, bez pollowania plików; każdy plik czytamy raz po
  zgłoszeniu końca przez agenta.
- **Ekstrakty specu zamiast całości:** main thread (już sparsował elementy) zapisuje dla
  każdego batcha ekstrakt do scratchpada — tylko elementy + bloki ADR / context potrzebne
  temu batchowi — i wskazuje subagentowi ekstrakt; subagent generacji nie re-czyta całego
  `spec.md`.
- **codeDeps weryfikowane, nie zgadywane:** batch może wykonać **co najwyżej JEDNĄ**
  ograniczoną eksplorację kodu (jeden lookup w stylu Explore) na realne ścieżki repo,
  współdzieloną między jego taski; konkretne ścieżki osadzamy w treści tasków, by agent
  implementacji ich nie doszukiwał się ponownie.
- **Bramka rozmiaru po fali:** po ukończeniu fali uruchamiamy `estimate-tokens.mjs` na
  **każdym** złożonym pliku taska; plik ponad `tasks.maxContextTokens` → split wzdłuż szwu
  kohezji (HIL). Estymata plan-time (§4) nie zastępuje tego pomiaru.

---

## 6. Mapa SC i walidacja

**Mapa SC** (`sc-map.json`) jest projekcją liczoną skryptem (Node.js, jak hasher —
`SPEC.md` §2.6) z grafu tasków — nigdy autorowaną ręcznie. Musi być acykliczna; cykl świadczy o błędnej
dystrybucji pracy (wspólny element do wyniesienia).

**Walidacja punktów przecięcia (SC):** kolejność tasków poprawna, wszystkie dependencje
spełnione (nic nie brakuje), brak martwych symboli — z ostrożnością, bo element może być
konsumowany przez większą pracę → **HIL** potwierdza / odrzuca.

**Walidacja tasków (ogon)** — 4 wymiary, każdy w osobnym czystym subagencie; verdykt
binarny, związany z `tasksHash` (rollup `input_hash` tasków — `SPEC.md` §4.4/§5.4),
zapisany do `readiness.tasks`:

1. **Frontmatter kompletny** — ID, tworzone elementy (z ID wewn.), zależności
   `task::element`, zależności z kodu, AC, FR/NFR.
2. **Samodzielność treści** — wszystkie niezbędne informacje skopiowane; brak odwołań do
   zewnętrznych dokumentów. **Najpierw tani pre-scan:** grep po każdym pliku taska za
   markerami wycieku referencji (`see spec`, `ADR-`, `§`, `refer to T-`, `patrz`); tylko
   oflagowany plik dostaje pełne czytanie LLM pod kątem wycieku — plik nieoflagowany
   przechodzi ten check z konstrukcji. Pozostałe checki samodzielności (potrzebna treść
   faktycznie obecna) dotyczą każdego pliku.
3. **Integralność SC** — graf acykliczny, kolejność poprawna, dependencje spełnione, brak
   martwych symboli (z HIL jak wyżej).
4. **Pokrycie** — każde AC pokryte przez ≥1 task; brak niepokrytych elementów specu.

Walidatory zwracają pass/fail plus `blockingDoubts` (odpowiedź wymagana przed verdyktem) i
`advisoryDoubts` (noty do usera, bez re-runu) — bez `AskUserQuestion`; wszystkie HIL (blocking
doubts, waivery, martwe symbole) pyta main thread. Po zwinięciu odpowiedzi / poprawek re-run
**tylko** wymiarów, których taski w zakresie zmieniły się od ostatniego passa — bez
spekulatywnej rundy potwierdzającej po poprawce, którą model już uzasadnił.

---

## 7. Maszyna stanów

```
entry → guard(config) → enforce(readiness.spec) → reconcile(desired↔existing)
      → decompose (waves) → compute SC → validate SC (HIL) → validate tasks → checkpoint
```

Ponowny `/to-tasks` = reconcile: dekompozytor dostaje istniejące przypisanie
`task ↔ elementy` i zachowuje je, chyba że spec wymusi split / merge (→ HIL). Taski są
generowane-only — user recenzuje, nie edytuje; egzekwuje to `contentHash` pliku taska
zapisywany w manifeście przy apply (`SPEC.md` §2.6). `/to-tasks` jest **jedynym
właścicielem zapisu plików tasków** (`SPEC.md` §2.4): `/grill` tylko markuje stale,
`/implement` na drifcie blokuje. Taski stale wyłącznie z powodu driftu upstream
odświeża w apply subagent copy-refresher — podmienia markowane bloki `fd:copy` zamiast
regenerować task (`CROSS_FEATURE.md` §1). Po passie walidacji tasków `/to-tasks` ustawia
taskom status `ready`; `in-progress` ustawia dopiero `/implement` na starcie fali
(`SPEC.md` §2.3).

---

## 8. Bramki

| Bramka | Typ |
|---|---|
| Brak / niepoprawny config | block |
| Enforcement DoR spec | block |
| Reconcile-plan przed apply (re-run) | HIL |
| Oversize task split / merge | HIL |
| Martwe symbole (możliwa zewn. konsumpcja) | HIL |
| Zmiana / usunięcie elementu `delivered` (reconcile) | block |
| Walidacja tasków (DoR) — ogon | block → verdykt |

---

## 9. Wyjście / checkpoint

Raport: liczba tasków, mapa SC, verdykt `readiness.tasks`, ewentualne oversize / martwe
symbole do decyzji. Sugestia następnego kroku prozą — `/implement` (gdy ready) albo
`/grill` (gdy trzeba poprawić spec) — bez uruchamiania.
