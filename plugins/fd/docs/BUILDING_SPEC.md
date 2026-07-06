# Budowanie specyfikacji

Reguły, format i walidacja specu. Spec jest źródłem prawdy całej funkcjonalności
(model — `SPEC.md` §2); ten dokument mówi, jak ma wyglądać i kiedy jest gotowy.
Budowanie specu odbywa się przez współdzielony grill (`GRILLING.md`), uruchamiany z
`/start` (temat) albo `/from-docs` (dokumenty).

---

## 1. Czym jest spec

Czytelny dla człowieka, kompletny kontrakt wymagań pojedynczej funkcjonalności. Nie
zawiera prawdziwego kodu — opisuje wymagania przez prozę, diagramy i pseudokod. Jest na
tyle precyzyjny, by dało się go zwalidować i podzielić na samodzielne taski, i na tyle
ogólny, by nie rozstrzygać decyzji należących do implementacji.

---

## 2. Format i reguły treści

- **Czytelność bez żargonu wewnętrznego.** Dopuszczamy powszechnie znane w SWE skróty
  (AC, FR, NFR z numerami). Nie odnosimy się przez symbole paragrafów ani wewnętrzne
  slot-y — dokument stoi sam.
- **Elementy jako nazwane bloki.** Każda rzecz do zbudowania to blok z kotwicą-ID w
  konwencji `<KIND>-<n>` (schemat ID — `SPEC.md` §4.3), np. `#### DB-3 — Tabela
  użytkowników`. Sekcje specu grupują po `KIND`, a prefiks działa jak checklista
  kompletności.
- **Komplementarność wymagań.** Spec wymienia wszystko, co musi powstać, na poziomie
  ogólnym (bez konkretnych nazw, chyba że powstaje wiele elementów tego samego rodzaju i
  nazwa je rozróżnia). Elementy obejmują m.in.:
  - definicje tabel bazy danych,
  - endpointy API z parametrami i typami danych (nie muszą być dokładne, jeśli wynika to
    z etapów implementacji — ale wskaż format, np. „ten zdefiniowany przez `X`"),
  - konfiguracje i ich wartości domyślne,
  - observability, infrastrukturę, punkty integracji.
- **FR i NFR** — spec je zawiera i numeruje.
- **AC** — spec definiuje kryteria akceptacji, które **kompletnie pokrywają** FR/NFR i
  mają do nich nawiązania. Nawiązania żyją **w bloku AC** jako linia `covers:` (np.
  `covers: FR-2, NFR-1` pod kotwicą `#### AC-5`) — wchodzą w hash bloku, więc zmiana
  mapowania przechodzi przez inwalidację. `ac-map.json` to liczona skryptem projekcja
  tych linii, nie drugie źródło prawdy. Każde AC wiąże **jedno obserwowalne
  zachowanie**; brak mglistych czasowników i konstrukcji „albo-albo".
  - **Szablon AC.** Pisz każde AC jako konkretny **wyzwalacz → obserwowalny wynik**:
    dokładnie jedno obserwowalne zachowanie, brak mglistych czasowników (`obsługuje`,
    `wspiera`, `poprawnie`), brak „albo-albo", obowiązkowa linia `covers:`.
    - Dobrze: `Gdy żądanie obciążenia powtarza Idempotency-Key widziany w ostatnich 24h,
      API zwraca oryginalny wynik obciążenia i nie tworzy drugiego.` `covers: FR-2`
    - Źle: `System poprawnie obsługuje zduplikowane lub niepoprawne żądania obciążenia.`
      (mglisty czasownik, dwa zachowania, brak wyzwalacza)
- **Przypadki brzegowe i błędy krytyczne** — spec opisuje je i to, czy oraz jak zostaną
  obsłużone.
- **Wdrożenie / rollback** — spec może zawierać informacje o wdrożeniu i wycofaniu, ale
  bez szczegółowych procedur. Gdy procedura jest potrzebna, powstaje w osobnym subagencie
  i zapisywana jest w osobnym pliku podlinkowanym ze specu.

---

## 3. Język

Spec (i artefakty pochodne: taski, ADR, CONTEXT.md) powstaje w języku z konfiguracji
(`language.default`, domyślnie `en`), z możliwością override na poziomie prompta
przekazanego do komendy. Wybrany język zapisuje `state.json.language`.

Wyjątek dla trybu `shared`: gdy CONTEXT.md / ADR są współdzielone przez wiele
funkcjonalności, ich język = domyślny z configu (bez per-feature override) — współdzielony
artefakt nie może mieć konfliktu języka.

---

## 4. Ścieżki tworzenia

- **Z tematu** (`/start`): temat → grill → spec → walidacja.
- **Z dokumentów** (`/from-docs`): źródła → analiza → grill → spec → walidacja; źródła
  kopiowane do `sources/`, proweniencja do `sources-map.json`.
- **Dogrillowanie** (`/grill`): user drąży temat lub przynosi nowe informacje zmieniające
  kształt wymagań; zmiana idzie przez reconcile (`SPEC.md` §2.4) i re-walidację.

Grounding zewnętrznych twierdzeń jest obligatoryjny przy pisaniu, niezależnie od ścieżki
(`RESEARCHER.md`).

---

## 5. Walidacja specu (Definition of Ready)

Walidacja jest krokiem w ogonie komend produkujących spec (`/start`, `/from-docs`,
`/grill`), wykonywanym w **osobnych czystych subagentach** — po jednym na wymiar.
Kompletności checklisty nie da się udowodnić, więc checki są pogrupowane w **wymiary**
(kategorie „co może pójść nie tak"), a lista jest oznaczona jako **v1, rozszerzalna**
(config `validation.dimensions.spec`).

Każdy check jest binarny **pass / fail**; każdy fail = **bloker**; verdykt wiąże się z
`specHash` i trafia do `readiness.spec` (architektura bramek — `SPEC.md` §5). Model nie
degraduje faili do warningów; blokadę zdejmuje wyłącznie człowiek świadomym waiverem.
Verdykt zapisuje też `dimensionsRun` — wymiary faktycznie wykonane; zawężenie listy w
configu jest przez to jawne w raporcie walidacji i `/status` (`SPEC.md` §5.4).

### Wymiary specu (6)

1. **Spójność strukturalna** — FR/NFR nie zaprzeczają sobie; kompletność kontraktów
   (tabele / enumy / wartości stanu); kolejność tworzenia elementów jest określona i
   poprawna.
2. **Pokrycie** — AC kompletnie pokrywają FR/NFR i mają nawiązania (linie `covers:`;
   projekcja `ac-map.json`); każde AC wiąże jedno obserwowalne zachowanie.
3. **Ugruntowanie** — każdy kontrakt zewnętrzny (3rd-party / API / lib) potwierdzony
   dokumentacją z cytatem w `sources-map.json`; wszystkie odwołania do dokumentów usera
   istnieją i są wczytywalne.
4. **Wykonalność w projekcie** — spec technicznie realizowalny w codebasie (stack,
   architektura); zależności istnieją w kodzie **lub** są zaplanowane w zależnym spec
   (path + hash — `CROSS_FEATURE.md`).
5. **Podzielność / budowalność** — dwuwarstwowo (patrz §5.1).
6. **Nie-nadmierna precyzja** — brak prawdziwego kodu tam, gdzie zbędny (chyba że pochodzi
   z ADR / researchu usera); opisy, diagramy, pseudokod.

### 5.1 „Spec zbyt ogólny" — dwie warstwy

1. **Heurystyki poziomu detalu** (tani filtr): każdy kontrakt wyliczony (tabele / enumy /
   wartości stanu), każde AC = jedno obserwowalne zachowanie, brak mglistych czasowników
   i „albo-albo".
2. **Dekompozycja dry-run** (twardy test): walidacja robi próbny podział wg algorytmu
   dekompozytora (`COMMAND_TO_TASKS.md`); jeśli którykolwiek element nie schodzi do
   poziomu budowalnego taska (niejednoznaczny kontrakt, niewyliczony zbiór elementów) →
   `under-specified` = bloker. Obiektywny test budowalności.

*(Opcjonalny punkt rozszerzenia: „completeness-critic" — meta-subagent pytający „czego
brakuje, jakiego wymiaru nie sprawdziliśmy". Domyślnie wyłączony — łatwo o szum.)*

---

## 6. Wersjonowanie

Spec ma wersję treściową (Merkle) — `SPEC.md` §2.2. Każda zmiana elementu rozjeżdża jego
`hash` i rollup `spec_hash`, co chirurgicznie unieważnia zależne taski i verdykt DoR.
Alokacja ID jest append-only; `/grill` i `/from-docs` są świadome istniejących ID —
zachowują je, alokują nowe tylko dla nowych elementów.
