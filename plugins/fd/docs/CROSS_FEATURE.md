# Zależności między funkcjonalnościami (poziom programu)

Gdy jedna funkcjonalność (X) zależy od elementów innej (Y), wchodzimy o piętro wyżej niż
wewnątrz-ficzerowy graf SC. **Program = DAG funkcjonalności.** Ten sam aparat co w rdzeniu
(content-addressing, kontrakty wersjonowane, acykliczność, projekcja-nie-źródło) jest
podniesiony o poziom — bez nowej maszynerii inwalidacji i bez knobów w configu.

---

## 1. Ziarno referencji: element + hash

X wskazuje zależność od Y na poziomie **elementu z wersją kontraktu**, nie całego specu:

- **Krawędź cross-feature** = `<slug_Y>#<EL>@vN` (np. `checkout#API-2@v2`) — rozszerzenie
  wewnątrz-ficzerowej krawędzi `T::EL@vN` przez granicę funkcjonalności. `#` = zakres-ficzera
  (odróżnia od `::` = zakres-taska, intra).
- **Frontmatter taska X** (`consumes`) trzyma refy cross-feature `checkout#API-2@v2` obok
  intra `T-3::DB-1@v1`.
- **Manifest X** (`feature.lock.json`) dostaje blok `upstream`:

```json
"upstream": [
  { "slug": "checkout", "path": "docs/features/checkout/", "specHash": "<merkle>",
    "consumes": ["API-2@v2", "DB-1@v1"],
    "elements": { "API-2": { "hash": "sha256:…", "version": 2 } } }
]
```

Mapa `elements` pinuje hash per konsumowany element: dla upstreamu w workspace hashe
czyta się na żywo z jego manifestu (pin = fallback); dla specu spoza workspace'u (forma
`path + hash`) nie ma manifestu do live-read, więc mapa jest wymagana — po wpisie na
konsumowany element, `hash` obowiązkowy (to jest „hash z pinu `upstream`" z `SPEC.md`
§2.6).

### Dwupoziomowa detekcja stale

Pin `specHash` to **tani tripwire** („coś w Y się ruszyło → drąż elementy"); faktyczny
stale rozstrzyga się na **hashu konsumowanego elementu** — do `input_hash` taska X
wchodzi bieżący hash elementu z manifestu Y (`SPEC.md` §2.6). Y zmienił niezwiązany
element → `specHash` się rusza, ale hash `API-2` stoi → X **nie** jest stale. Zysk:
zero fałszywych stale przy zmianach Y poza tym, co X konsumuje — w ziarnie elementu.
Wersja `@vN` niesie semantykę breaking: non-breaking zmiana rusza sam hash (→ odświeżenie
kopii `fd:copy`, patrz niżej), bump `@vN` oznacza zmianę kontraktu wymagającą decyzji
przy re-point (reconcile → HIL).

### Identyfikacja

W obrębie workspace'u ref po **slug** (stabilny; path wyliczalny z layoutu
`docs/features/<slug>/`). `path + hash` jako forma przenośna dla specu spoza
workspace'u / repo. Pin zawsze zawiera `specHash`.

### Bounded context konsumenta

Funkcjonalność należy do dokładnie jednego BC (`COMMAND_CONFIG.md`); grill i taski X
używają wyłącznie `CONTEXT.md` **własnego** BC. Konsumpcja elementu z innego BC nie
wciąga obcego `CONTEXT.md` — przechodzi przez wersjonowany kontrakt `Y#EL@vN`, którego
istotna treść i tak jest kopiowana do specu / tasków X (samodzielność). Researcher może
read-only zajrzeć do specu / manifestu Y, by ugruntować kontrakt, ale model domenowy
pozostaje ograniczony do własnego BC.

### Kopie kontraktów — markery `fd:copy`

Skopiowana do taska X treść konsumowanego kontraktu upstream jest ujęta w markery:

```markdown
<!-- fd:copy checkout#API-2@v2 sha256:… -->
…skopiowana treść elementu…
<!-- /fd:copy -->
```

Marker niesie ref i hash treści źródłowej kopii — drift upstream jest maszynowo
lokalizowalny. Odświeżenie wykonuje wyspecjalizowany subagent **copy-refresher**
(`IMPLEMENTATION.md` §1) w apply `/to-tasks`: taskom stale wyłącznie z powodu driftu
upstream podmienia zawartość markowanych bloków na bieżącą treść elementu i bumpuje hash
w markerze — bez pełnej regeneracji taska; hasher przelicza potem `contentHash` i
`input_hash`.

---

## 2. Topologia emergentna + widok liczony

Brak autorowanego `program.json`:

- Źródło prawdy = referencje `upstream` w manifestach funkcjonalności. **Graf programu to
  projekcja** liczona przez przejście referencji — nigdy pisana ręcznie.
- **Krawędzie odwrotne (downstream) nie są trzymane u Y** — X pisze „zależę od Y", Y nie
  wie o X. „Kto zależy od Y" (analiza wpływu) = projekcja liczona przez **skan**
  `docs/features/*` po refach `upstream`. Materializacja DAG-a programu = on-demand,
  read-only.

---

## 3. Propagacja: pull przy reconcile X

Ruch upstreamu wykrywa sam X:

- Reconcile X (re-entry) re-czyta manifesty pinowanych speców upstream; przez tripwire
  `specHash` → porównuje hashe konsumowanych elementów; ruch hasha → taski konsumujące
  `stale` (non-breaking → odświeżenie kopii `fd:copy`; bump `@vN` → decyzja re-point
  przy HIL reconcile).
- **Wpięcie w istniejący mechanizm:** hashe konsumowanych kontraktów cross-spec wchodzą
  do `input_hash` taska (`SPEC.md` §2.6) — upstream drift bumpuje `input_hash` → **ta
  sama chirurgiczna inwalidacja** co intra-feature. Zero nowej maszynerii.
- **Marking vs viewing:** marking stale = pull (leniwe, autorytatywne w manifeście X).
  Globalny „kto by się wywrócił" = widok liczony (§2, read-only) — pokazuje potencjalny
  wpływ bez markowania.

---

## 4. Rola pluginu: track + walidacja + doradztwo kolejności

Plugin **nie** orkiestruje cross-feature buildów (łamałoby zasadę „komenda = dyskretna
jednostka"):

- **Track** — zależności w manifeście / frontmatterze (§1).
- **Walidacja** (wymiar „Wykonalność", rozszerzony) — dla każdego `Y#EL@vN`:
  (a) Y istnieje pod pinowaną ścieżką / slugiem i jest wczytywalny;
  (b) `EL` istnieje w Y i jest przez Y produkowany (węzeł w SC Y);
  (c) wersja `@vN` zgodna / rekoncyliowalna z bieżącym kontraktem Y;
  (d) DAG programu acykliczny.
  Twarde checki (fail = bloker, waiver tylko-ludzki).
- **Doradztwo kolejności** — topo-sort DAG-a programu (fundament-funkcjonalności pierwsze);
  jedno piętro nad stackiem PR. To **rada** (w wyjściu reconcile / walidacji), nie
  egzekucja — człowiek sekwencjonuje funkcjonalności.

---

## 5. Nuans temporalny (upstream niezbudowany)

- X można **zaplanować i zdekomponować** wobec Y istniejącego tylko jako spec — spec →
  taski X **nie** wymaga zbudowanego Y.
- Ale `/implement` X potrzebuje realnego kodu Y. **DoR na wejściu `/implement` rozszerzony:**
  konsumowany `Y#EL@vN` musi być `delivered` w manifeście Y — inaczej bloker. Tu spłaca się
  doradztwo kolejności: „zbuduj Y (a przynajmniej `API-2`) przed X". Ziarno elementowe →
  blokada i rada są element-precyzyjne, nie tylko feature-grubo.
- `delivered` w Y ustawia ship-detekcja w reconcile Y (`SPEC.md` §2.4), więc manifest Y
  może być nieodświeżony (nikt nie uruchomił komendy na Y po merge). Dlatego check DoR
  liczy delivered **na żywo**: czyta manifest Y i weryfikuje osiągalność commitów
  tasków-producentów z `baseBranch` (ta sama detekcja, tu read-only — manifest Y flipuje
  dopiero własny reconcile Y). Przypadek niejednoznaczny (commity nieosiągalne, ale
  patch-id wskazuje squash-merge — `SPEC.md` §2.4, krok 1) → HIL, nie ślepy bloker.

---

## 6. Edge cases

- Element upstream usunięty / przemianowany → `consumes` X dyndający → bloker „Wykonalność"
  → HIL (re-point / drop / waiver).
- Cross-spec cykl → naruszenie acykliczności → HIL: wyodrębnij **wspólny
  fundament-funkcjonalność** (analogicznie do rozbicia tasków na wspólny element).
- Rollback Y ≠ rollback X — jak intra, lecz przez granicę: cofnięcie kontraktu Y stawia
  konsumentów X w stale; jeśli implementacja X jest już zakończona, domyka to nowa
  funkcjonalność (forward-only — `SPEC.md` §2.5).

Odkrywanie funkcjonalności-rodzeństwa = layout `docs/features/`. Dane zależności żyją w
manifeście / frontmatterze, nie w configu.
