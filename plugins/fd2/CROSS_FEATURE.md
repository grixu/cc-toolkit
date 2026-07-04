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
    "consumes": ["API-2@v2", "DB-1@v1"] }
]
```

### Dwupoziomowa detekcja stale

Pin `specHash` to **tani tripwire** („coś w Y się ruszyło → drąż elementy"); faktyczny
stale rozstrzyga się na **wersji kontraktu konsumowanego elementu**. Y zmienił niezwiązany
element → `specHash` się rusza, ale `API-2@v2` dalej `@v2` → X **nie** jest stale. Zysk:
zero fałszywych stale przy zmianach Y poza tym, co X konsumuje.

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
  `specHash` → drąży wersje konsumowanych kontraktów; ruch `@v2 → @v3` → taski konsumujące
  `stale`.
- **Wpięcie w istniejący mechanizm:** wersje konsumowanych kontraktów cross-spec wchodzą do
  `input_hash` taska — upstream drift bumpuje `input_hash` → **ta sama chirurgiczna
  inwalidacja** co intra-feature. Zero nowej maszynerii.
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
  dopiero własny reconcile Y).

---

## 6. Edge cases

- Element upstream usunięty / przemianowany → `consumes` X dyndający → bloker „Wykonalność"
  → HIL (re-point / drop / waiver).
- Cross-spec cykl → naruszenie acykliczności → HIL: wyodrębnij **wspólny
  fundament-funkcjonalność** (analogicznie do rozbicia tasków na wspólny element).
- Rollback Y ≠ rollback X — jak intra, lecz przez granicę: cofnięcie kontraktu Y stawia
  konsumentów X w stale, forward-only naprawiane taskami korygującymi.

Odkrywanie funkcjonalności-rodzeństwa = layout `docs/features/`. Dane zależności żyją w
manifeście / frontmatterze, nie w configu.
