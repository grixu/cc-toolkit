# fd4: cel i zasady

## Cel

fd4 to następca [fd3](../fd3/README.md). Prowadzi tę samą drogę od pomysłu do kodu (spec, zadania,
implementacja) i omija problemy, które pokazały prawdziwe przebiegi fd3.

Kształt wydania jest otwarty: nowy major fd3 albo dwa osobne pluginy. Decyzja zapada na końcu prac,
więc do tego czasu fd4 to nazwa robocza.

Zewnętrzne materiały, na których opieramy założenia i pomysły, są w
[`KNOWLEDGE_SOURCES.md`](KNOWLEDGE_SOURCES.md).

Ten dokument obejmuje drogę do zadań: grill, SPEC, jego walidację i podział na zadania. Ustalenia
dla implementacji i dalszych etapów czekają w [`WHAT_NEXT.md`](WHAT_NEXT.md).

## Zasady nieprzekraczalne

1. **Każdy tekst dla agenta powstaje według skilla `writing-for-agents`.** Dotyczy skilli, komend,
   definicji agentów, promptów renderowanych przez workflowy i opisów, które agent czyta. Załaduj skill
   przed pisaniem i przed przeglądem takiego tekstu.
2. **Każde założenie o zachowaniu agenta ma ewaluację.** Przypuszczenie („agent pominie X”, „ta zmiana
   skróci Y”) staje się zasadą dopiero, gdy potwierdzi je ewaluacja: najpierw _red_ na obecnym
   zachowaniu, potem _green_ po zmianie. Ewaluacje mają być _tight_: wąskie, na kilku przypadkach,
   z wynikiem w minutach. Wynik i jego liczby zapisujemy przy decyzji, którą wspierają. Każdy etap
   (grill, zapis SPEC, walidacja, podział…) prowadzi osobny mały skill albo agent, więc ma własne
   ewaluacje na wejściu z prawdziwego przebiegu. Całość procesu sprawdza dodatkowo jedna ewaluacja
   końcowa od wejścia do zadań.
3. **Ewaluacje stoją na prawdziwych przebiegach fd3.** Materiał i jego obsługa są opisane w
   [`FD4_EVALUATION.md`](FD4_EVALUATION.md). Przypadek syntetyczny dokładamy tylko wtedy, gdy
   prawdziwe przebiegi danej gałęzi nie pokrywają.

## Problemy fd3, których unikamy

1. **Za duży SPEC.** SPEC jest zbyt szczegółowy i za długi. Granica dla fd4: w SPEC zostaje to, co
   widzi ktoś spoza zmiany (kształt publicznego API z nazwami pól, wymagalnością, kodami i formatem
   błędów, reguły danych, zachowanie widoczne dla użytkownika, limity i czasy). Do zadań idzie, jak
   to zbudować (klasy, dekoratory, kolejność rejestracji, wywołania bibliotek, indeksy, wartości
   stylów). Jedna decyzja może się podzielić: zdanie kontraktu zostaje w SPEC, reszta w zadaniu.
2. **Drogie edycje SPEC.** Każda poprawka SPEC zajmuje dużo czasu i tokenów.
3. **Męczący grill.** Grillowanie trwa długo i męczy użytkownika.
4. **Rozmowa przez identyfikatory.** Agent odnosi się do numerów decyzji i kodów elementów speca,
   zamiast nazwać, o co chodzi. Kryterium dla fd4: każdy identyfikator w wiadomości do użytkownika ma
   w tej samej wiadomości opis z treścią, czyli mówi, czym ta rzecz jest, a nie tylko co się z nią
   stało. Jedno słowo w nawiasie to za mało. Lista gołych identyfikatorów jest niedopuszczalna, bo
   zaciera nawet te opisane. Opis sprzed kilku wymian się nie liczy: użytkownik go nie pamięta,
   nawet gdy sam prowadził sesję.
5. **Rozdęty kontekst przy dużych zadaniach.** Spec dla dużego zakresu (np. całego epika) rozdyma
   kontekst sesji.
6. **Każde pytanie trafia do użytkownika.** Grill nie odróżnia pytań kluczowych od reszty. Kluczowe
   są decyzje, z których trudno się wycofać: architektoniczne, produktowe i dotyczące software
   designu. Resztę może rozstrzygnąć agent albo panel agentów, a użytkownik na końcu przegląda te
   rozstrzygnięcia i je zatwierdza.
7. **Brak TDD.** Implementacja nie pisze testów przed kodem, nawet gdy kod i setup projektu na to
   pozwalają. Rozwiązanie zaczyna się przy podziale na zadania: zadanie bez scenariuszy testów
   (wymaganie 8) skazuje implementację na trudności, zanim ta się zacznie.
8. **Za drobne zadania.** Każde zadanie to osobny subagent, worktree i walidacja, więc drobny podział
   mnoży ich liczbę. Każdy subagent ładuje od nowa bazowy kontekst sesji, często ciężki od skilli i
   pluginów, więc w fd3 40 zadań niosło ten kontekst 40 razy, choć ten sam zakres zmieściłby się w
   8–10 zadaniach. Celem jest mniej, a większych zadań, nie obniżanie kosztu za wszelką cenę.
   Miarą jest liczba zadań na przypadek; w fd3 mediana to 21 (baseline, metryka m8).
9. **Ryzykowne kroki trafiają do użytkownika.** Podział na zadania często zostawia użytkownikowi do
   ręcznego wykonania kroki, które agent zrobiłby sam przez CLI. Dotyczy to zwykle działań
   ryzykownych: trudno odwracalnych albo takich, których porażka dotknie użytkowników końcowych (np.
   zmian w infrastrukturze).
10. **Przegląd kodu i CI na każdym zadaniu.** Każde zadanie dostaje osobny przebieg CI i przegląd kodu
    soczewkami, także gdy zmiana tego nie potrzebuje. To one, a nie liczba zadań, mnożą subagentów:
    fd3 uruchamiał medianę 113 subagentów na przypadek, z czego przegląd 24–87, a CI 5–20. Miarą
    jest liczba subagentów przeglądu i CI na przypadek (baseline, metryka m13). Problem zależy od
    problemu 8, bo większe zadania to mniej przebiegów przeglądu i CI, ale ma też własne
    rozwiązanie: model decyzyjny pomija przegląd albo CI tam, gdzie nie mają sensu, np. przy
    dokumentacji czy infrastrukturze (pomysł 11).

## Wymagania

1. **SPEC zawiera listę kryteriów akceptacji (AC).** To niezbędne wejście dla pluginu
   [tester](../tester/README.md).
2. **Wymagania i założenia architektoniczne są spisane.** Gdy praca nie tworzy nowego ADR, zapisuje
   je SPEC.
3. **Pliki SPEC i zadań opisują kod, nie zawierają go.** Dozwolone są schematy, diagramy i krótki
   pseudokod.
4. **fd4 jest modem.** Wynika to z pomysłów 3 i 4: modele decyzyjne wołamy z kodu moda, a ustawienia
   użytkownika (np. nazwa słownika) mod dostaje z wypełnionymi wartościami domyślnymi.
5. **Zadania dzielimy na vertical slices.** Każde zadanie dowozi przekrój funkcjonalności przez
   wszystkie warstwy, których dotyka.
6. **Walidacja SPEC przechodzi przez zestaw soczewek.** Każda soczewka sprawdza jeden aspekt, jak w
   pluginie [code-review](../code-review/README.md). Zestaw dla SPEC:
   - **Gap Analyzer:** czego brakuje, choć cel SPEC tego wymaga (np. przypadek, rola, stan, błąd).
   - **Ambiguity Mapper:** sformułowania, które da się odczytać na więcej niż jeden sposób.
   - **Assumption Excavator:** założenia, na których SPEC stoi, ale których nie zapisał.
   - **Implied Completeness Detector:** miejsca, które wyglądają na kompletne, a zostawiają zakres
     niedopowiedziany (np. „itd.”, „obsłuż błędy”, „jak w module X”).
   - **Repo Reality Checker:** czy SPEC zgadza się z regułami i narzędziami repozytorium (CLAUDE.md,
     reguły, standardy kodu, workflowy CI, generatory, indeksy dokumentacji). Zanim luka trafi do
     innego zespołu, soczewka sprawdza ją tanim testem w worktree.
   - **External Contract Verifier:** każde zachowanie biblioteki, API lub platformy, na którym SPEC
     stoi, ma źródło w dokumentacji lub kodzie tej wersji, której używa projekt. Użycie w repozytorium
     nie jest dowodem.
   - **Security & Abuse Lens:** dla każdej nowej roli, tokenu, endpointu i uprawnienia: kto do niego
     dotrze, co ujawnia i co się dzieje przy współbieżności.
   - **Consistency & Order Checker:** decyzje sobie nie przeczą, nie odwracają po cichu wcześniejszych
     dokumentów, a kolejność budowy się trzyma. Co da się, sprawdza kod.

   Soczewka nie edytuje pliku, który sprawdza: walidator i edytor to osobne agenty. Walidator zwraca
   uwagi, edytor wprowadza przyjęte. W fd3 walidator poprawiał SPEC w trakcie sprawdzania, przez co
   17 uwag to regresje po jego własnych edycjach (baseline, metryka m12).
7. **Zadania planują samodzielne wykonanie przez agenta.** Krok, który agent może wykonać przez CLI,
   trafia do zadania agenta, także gdy jest ryzykowny (problem 9). Zgodę na ryzykowne kroki daje
   pomysł 9. Zadanie użytkownika powstaje tylko dla pracy wyłącznie ludzkiej: przeglądu innego
   zespołu, urządzenia fizycznego, akceptacji interesariusza albo interfejsu, do którego agent nie ma
   narzędzia. Decyzję rozstrzyga grill, fakt sprawdza agent przy budowie SPEC, a przygotowanie
   infrastruktury trafia do zadania agenta. Podział nie stawia pracy ludzkiej przed startem
   implementacji; gdy kolejność tego wymaga, ta praca trafia na listę przed startem, którą agent
   pokazuje razem z prośbą o zgodę z pomysłu 9, a nie dopiero po pierwszym przebiegu. W fd3 przed
   0.4.0 22 zadania użytkownika blokowały start, prawie same decyzje przebrane za zadania; od 0.4.0
   zostały 4, z czego 2 agent zrobił sam po jednej zgodzie (baseline, metryka m11).
8. **Plik zadania podaje interfejsy publiczne i scenariusze testów.** Interfejsy publiczne, które
   zadanie dodaje lub zmienia, opisuje sygnaturą: nazwa, wejście, wyjście, błędy. Scenariusze testów
   jednostkowych, integracyjnych i e2e są wypisane w formacie Gherkin (Given/When/Then). Sygnatura i
   scenariusz to opis kodu, nie kod, więc wymaganie 3 obowiązuje dalej.
9. **Katalog na SPEC i zadania jest konfigurowalny.** Użytkownik ustawia w konfiguracji pluginu
   katalog, w którym trzymane są SPEC i zadania. Domyślnie to `.ai/` w katalogu głównym projektu:
   każdy SPEC w osobnym katalogu `specs/<slug>/` (plik `SPEC.md`), jego zadania w
   `specs/<slug>/tasks/`, jak w regule repozytorium `.claude/rules/ai-directory.md`. Slug nie
   zawiera daty: pliki da się posortować po dacie i bez niej. Wartość domyślną mod wypełnia sam
   (wymaganie 4).
10. **Walidacja zwraca kontrakt werdyktu.** Dla każdego sprawdzanego pliku: werdykt binarny (gotowy
    albo nie), lista uwag oznaczonych jako blokujące lub nie i dowód dla każdego „sprawdzone”.
    Sprawdzenie, które niczego nie zweryfikowało, zwraca „nie uruchomiono”, nigdy „przeszło”. W fd3
    werdykt nie wypadł negatywnie ani razu w 48 przebiegach, a check wykonalności w repozytorium
    przeszedł 46 razy, choć przepuścił 18 defektów (m12).
11. **Każdy etap i agent ma model dobrany do swojej pracy.** W fd3 większość pracy idzie na Opusie,
    także czytanie plików i wyszukiwanie. Opus decyduje: planuje, rozstrzyga decyzje kluczowe i robi
    końcowe sprawdzenie. Pisanie i edycję prowadzi Sonnet w subagencie, nie orkiestrator: treść
    zapisana przez orkiestratora zostaje w jego kontekście, a w fd3 jego zapisy to 16% okna (m5).
    Czytanie i wyszukiwanie idą do Haiku, z krótkim podsumowaniem zamiast całych plików. Wynik
    komendy przycina sama komenda (`| tail`, filtr), co nic nie kosztuje; osobny runner Haiku
    dostają tylko komendy o dużym wyniku (pełny build, testy). Delegowanie każdej komendy się nie
    opłaca: w fd3 wynik Bash ma medianę 213 tokenów, a runner o narzucie jak `fd3:ci-runner`
    zwraca się dopiero od ok. 2,8 tys. (m14). Każdy agent dostaje tylko potrzebne narzędzia, bo
    narzut na starcie spada wtedy z ok. 70 tys. do ok. 11 tys. tokenów. Raportów subagentów nie
    skracamy dalej: to 6,7% kosztu orkiestratora i w fd3 nie powodowały dodatkowej pracy (m14). Każdy
    subagent i agent workflowu ma model ustawiony jawnie, bo bez tego dziedziczy model sesji, czyli
    zwykle Opusa. Model zmieniamy na granicy etapu, nie w środku sesji, bo zmiana modelu traci cache
    rozmowy. Przydział modelu do etapu potwierdza ewaluacja jakości (zasada 2), nie tylko koszt.
    Pomysł 3 dobiera model dla zadań implementacji; to wymaganie obejmuje resztę etapów.
12. **Walidacja to ograniczona pętla: sprawdzenie, odsiew, edycja, ponowne sprawdzenie.** Orkiestrator
    uruchamia soczewki (wymaganie 6), zbiera ich uwagi w jedną listę i przepuszcza ją przez ten sam
    model decyzyjny co pytania grilla (problem 6): uwagi, które rozstrzyga agent, idą prosto do
    edytora, a do użytkownika trafiają tylko kluczowe. Po edycji idzie ponowne sprawdzenie. Pętla
    wykonuje się najwyżej 3 razy; użytkownik zmienia ten limit ustawieniem `validation.maxRounds`.
    Gdy limit się wyczerpie, a uwagi blokujące zostały, werdykt brzmi „nie gotowy” (wymaganie 10).
13. **Odsiew pytań waży tylko odwracalność decyzji.** Pytanie, którego decyzję trudno odwrócić, trafia
    na żywo do użytkownika. Pozostałe agent rozstrzyga sam, a użytkownik przegląda je zbiorczo na
    końcu (problem 6). Odwracalność ocenia model decyzyjny: na 192 pytaniach z fd3 zgadza się z
    etykietami kluczowe/delegowalne na AUC 0,78 (Jev i Gemini Decision). Przewidywanie, czy
    użytkownik odrzuci rekomendację, odrzuciliśmy: najlepszy wynik to AUC 0,64, a cechy decyzji
    (odwracalność, koszty operacyjne, nowość architektoniczna, zgodność z wzorcami, podobieństwo do
    codebase, doszczegółowienie wybranego kierunku) nie dały sygnału. Dane: 711 pytań z 26 grilli
    z faktycznymi wyborami użytkownika (`evals/baseline/local/m6-overrides/`).

## Nowe pomysły

1. **Szczegóły implementacji w zadaniach.** Podział na zadania przenosi szczegóły implementacyjne ze
   SPEC do plików zadań, więc poprawka dotyka mniejszego pliku.
2. **Poprawki po starcie implementacji to zwykła edycja.** Zmiana SPEC lub zadań po rozpoczęciu
   implementacji to edycja plików, bez weryfikacji, którą przechodzi tworzenie. Przed startem
   implementacji obowiązuje założenie 5.
3. **Model i effort zadania wybiera model decyzyjny.** Wynik trafia do pliku zadania, a implementacja
   uruchamia zadanie z tym modelem i effortem.
4. **Słownik domenowy powstaje razem ze SPEC.** Domyślnie w `GLOSSARY.md`; użytkownik może ustawić
   inną nazwę pliku.
5. **Format plików jest otwarty.** SPEC i zadania nie muszą być w markdownie; wybieramy format, który
   agent czyta najtaniej. Gdy nowy format zmieni postać AC, plugin tester dostaje jego obsługę.
6. **Doprecyzowanie wejścia zawęża research.** Agent doprecyzowuje pomysł, zadanie lub dane od
   użytkownika, gdy to zawęża stożek możliwości, a przez to zmniejsza ilość researchu. Pytania
   doprecyzowujące przechodzą ten sam podział co pytania grilla (problem 6): do użytkownika trafiają
   tylko kluczowe, a o tym, które są kluczowe, może rozstrzygać model decyzyjny.
7. **SPEC i zadania waliduje inny model niż ten, który je pisał.** Gdy dostępny jest inny harness i
   dostawca modeli, walidacja idzie do nich przez plugin [collegium](../collegium/README.md).
8. **Soczewki walidują też zadania.** Ten sam mechanizm co przy walidacji SPEC (wymaganie 6) sprawdza
   pliki zadań. Do soczewek SPEC dochodzą dwie dla zadań:
   - **Public Interface Validator:** czy interfejsy publiczne zadania (wymaganie 8) są kompletne,
     spójne ze SPEC i z zadaniami, które od nich zależą.
   - **Test Architect:** czy scenariusze testów (wymaganie 8) pokrywają AC zadania i leżą na właściwym
     poziomie: unit, integracja albo e2e.
9. **Zgoda na kroki operacyjne po podziale.** Po stworzeniu zadań agent pokazuje wszystkie kroki,
   które nie są pisaniem kodu (np. zmiany infrastruktury, migracje, konfiguracja zewnętrznych
   usług), nie tylko ryzykowne. Przy każdym kroku podaje:
   - **kto go wykona:** agent, z narzędziem, którym to zrobi (CLI, MCP…), albo tylko człowiek;
   - **jak go wykona:** automatycznie albo z potwierdzeniem człowieka przed wykonaniem (human in
     the loop). Ryzykowne kroki (problem 9) agent proponuje z potwierdzeniem.

   Użytkownik zmienia te propozycje w obie strony: puszcza automatycznie także krok oznaczony jako
   ryzykowny, żąda potwierdzenia przy kroku oznaczonym jako automatyczny, poprawia krok albo go
   odrzuca. Krok odrzucony staje się zadaniem dla użytkownika. Lista zawiera też pracę ludzką
   potrzebną przed startem implementacji (wymaganie 7).
10. **Powtarzalne pytania stają się ustawieniami.** W przebiegach fd3 użytkownik odpowiadał tak samo
    na te same pytania w wielu przypadkach (baseline, metryka m10), więc fd4 bierze odpowiedź z
    konfiguracji pluginu, zamiast pytać. Nazwy mają postać `grupa.nazwa` w camelCase. Ustawienie,
    które pozwala agentowi wykonać coś bez pytania, zaczyna się od `auto`. Ustawienie wskazujące
    skill kończy się na `Skill`. Wartości domyślne pochodzą z odpowiedzi właściciela w fd3 (m10,
    przegląd 2026-11-25):
    - `flow.autoAdvance` (tak): przejście do kolejnego etapu bez pytania, gdy SPEC jest gotowy.
    - `validation.maxRounds` (3): limit rund pętli walidacji (wymaganie 12).
    - `paths.specDir` (`.ai/specs/` albo układ, którego repo już używa): katalog SPEC (wymaganie 9).
    - `spec.commitWithPr` (tak): pliki, które fd4 tworzy w katalogu SPEC, trafiają do PR razem z
      kodem.
    - `git.autoCommit` (tak): agent commituje sam na gałęzi funkcji.
    - `git.autoSyncWithBase` (tak): gdy gałąź jest za bazową, agent robi merge z bazy, nigdy rebase
      gałęzi z merge'ami.
    - `implement.autoReview` (tak): przegląd kodu po zielonym CI.
    - `implement.autoRepair` (tak): agent naprawia każdą uwagę z przeglądu, którą da się naprawić;
      resztę wpisuje do raportu.
    - `implement.autoSecurityReview` (tak): przegląd bezpieczeństwa, gdy zmieniają się zależności,
      lockfile albo migracje.
    - `implement.autoCloseAnsweredGaps` (tak): agent zamyka luki, na które odpowiedział przebieg,
      i wypisuje je w raporcie.
    - `implement.specDrift` (`amend-spec`/`ask`, domyślnie `amend-spec`): gdy kod odchodzi od SPEC,
      agent zostawia kod i poprawia SPEC albo pyta.
    - `implement.autoCleanup` (tak): po ostatniej poprawce agent usuwa worktree i scalone gałęzie.
    - `files.autoCleanup` (tak): agent usuwa pliki robocze, gdy wszystkie zadania są zrobione.
    - `autonomy.autoOpsSteps` (tak): kroki operacyjne wykonuje agent; ryzykowne trafiają raz na
      listę zgód (pomysł 9).
    - `autonomy.autoLocalProtectedChanges` (tak): zmiany w lokalnym stacku i lokalnym env bez
      pytania; środowiska współdzielone dalej wymagają zgody.
    - `tracker.autoUpdate` (tak): komentarze i statusy w Jirze lub Linearze bez pytania; szkice
      nowych ticketów agent pokazuje raz.
    - `tracker.autoAssignOnStart` (tak): na starcie ticket przypisany do użytkownika, status In
      Progress.
    - `pr.autoPush` (nie): push i otwarcie szkicu PR po poprawkach; domyślnie agent pyta raz.
    - `pr.autoSplit` (nie): czy dzielić zmianę w jednym repo na kilka PR; domyślnie jeden PR na repo.
    - `pr.autoMerge` (nie): merge PR po zielonym CI; repo prowadzone w pojedynkę włącza to w
      konfiguracji projektu.
    - `pr.openSkill` (`dev-kit:pr-open`, gdy zainstalowany): skill otwierający PR.
    - `pr.shepherdSkill` (`dev-kit:pr-shepherd`, gdy zainstalowany): skill prowadzący PR do zielonego
      CI.
    - `pr.diagramSkill` (`code-story`, gdy zainstalowany; pusty = bez diagramów): skill rysujący
      diagramy w opisie PR.

    Ustawieniem nie są: zatwierdzanie pojedynczych decyzji pisarza SPEC (przegląd zbiorczy,
    wymaganie 13), ponowne pytania o rzeczy rozstrzygnięte (agent zapisuje odpowiedzi i nie pyta
    drugi raz), poziom testów (scenariusze w zadaniu i soczewka Test Architect, pomysł 8), płatne
    testy na żywo i wybór gałęzi docelowej (agent pyta albo decyduje sam, gdy sytuacja wystąpi).
    Grill dalej kończy się pytaniem o wspólne rozumienie, a do niego dołącza przegląd decyzji
    agenta.
11. **Model decyzyjny ocenia, czy zadanie dostaje przegląd kodu i CI.** Przy podziale, jak model i
    effort w pomyśle 3, model decyzyjny rozstrzyga dla każdego zadania osobno, czy uruchomić przegląd
    kodu i czy uruchomić CI, a wynik trafia do pliku zadania. Są zadania, dla których jedno lub
    drugie nie ma sensu, np. zmiana samej dokumentacji albo konfiguracji, której CI nie sprawdza
    (problem 10). Ustawienie `implement.autoReview` (pomysł 10) dalej włącza przegląd w ogóle; model
    decyzyjny wybiera zadania, na których go pominąć.

## Założenia

1. **Zadania mogą zależeć od siebie.** Powiązania między zadaniami zostają, jak w fd3.
2. **Wejście budowy SPEC.** Użytkownik podaje opis pomysłu, tickety z systemu typu Jira, pliki z
   własnym wcześniejszym researchem albo dowolne ich połączenie.
3. **Budowa SPEC ma trzy fazy:** grill, spisanie SPEC i jego walidacja.
4. **Zadania powstają ze zwalidowanego SPEC.** Opisują etapy jego implementacji.
5. **Zmiana SPEC po podziale, a przed implementacją, wraca do zadań.** Gdy SPEC zmieni się po
   podziale, zadania, które wskazują zmienione sekcje, przechodzą walidację ponownie. Najpierw
   trafiają do nich wszystkie edycje, a potem idzie jedno sprawdzenie, żeby poprawki i sprawdzenia
   nie zapętliły się na zmianę. Założenie przestaje obowiązywać ze startem implementacji; od tej
   chwili zmiany są zwykłą edycją (pomysł 2).
