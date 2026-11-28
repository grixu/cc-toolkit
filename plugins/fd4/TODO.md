# fd4: do zrobienia

Kolejność prac nad drogą do zadań z [`GOAL.md`](GOAL.md). Każdy etap dostaje własne ewaluacje
(zasada 2): najpierw _red_ na przebiegach fd3, potem _green_ po zmianie.

## 1. Baseline i progi sukcesu

- [x] **Przegląd baseline'u przez właściciela.** Rozstrzygnąć 10 otwartych pytań z sekcji „Open
      questions” w `evals/baseline/local/fd3/REPORT.md`: etykiety m6, m9–m12, granice m1 i m4, cel m8.
      — zamknięte 26.11.2026; doszły m14 (koszt delegowania) i dwa przypadki z blokadą startu.
- [x] **Progi sukcesu.** Dla każdej metryki m1–m13 zapisać próg _green_ dla fd4 i sposób pomiaru.
      — w `FD4_EVALUATION.md`, sekcja „Progi sukcesu”, z m14 i progiem dla całości.

## 2. Soczewki walidacji

- [x] **Porównać zakresy soczewek ze źródłami.** Jeden subagent czyta prompty z
      [aself101/agents-and-pipelines](https://github.com/aself101/agents-and-pipelines) (np.
      `agents/assumption-excavator.md`) i walidację z fd3 (`plugins/fd3/skills/validate-spec/`), po
      czym zestawia je z opisami w wymaganiu 6 i pomyśle 8. Tam, gdzie zakresy się różnią, poprawić
      opisy w `GOAL.md`. — zrobione 26.11.2026 (`ff4ed018`).
- [x] **Sprawdzić zakresy na ucieczkach fd3.** Replay 10 soczewek na 7 przypadkach m12 (122 realne
      ucieczki), recall przez sędziego dopasowań (średnia z dwóch przebiegów), precyzja przez panel
      GPT-6 Astra + GPT-6.2 Sol + GLM 5.4 (większość 2 z 3). — zrobione 26–28.11.2026, wyniki w
      `evals/baseline/local/lenses/replay/RESULTS.md`, komendy w `lenses/RUNS.md`, dane w R2.
  - Zawężone w `GOAL.md` po pomiarze: Repo Reality (uruchamia bramki zadań), Test Architect,
    Public Interface Validator, Consistency & Order Checker, Ambiguity Mapper.
  - Zestaw po zawężeniu (Opus 5.5): recall 49/122 (40%, próg ≥ 50%), precyzja 84% licząc
    dopasowane ucieczki jako realne (76% według samego panelu; próg ≥ 80%).
  - Modele na tych samych promptach: Opus 5.5 43% recall / 73% precyzji / $84; Fable 5.2 medium
    42% / 73% / $182; Haiku 5.5 35% / 47% / $13; Sonnet 5.5 25% / 58% / $25; Opus medium 38% /
    $86. Soczewki zostają na Opusie z domyślnym effortem.
  - Panel odrzuca część realnych ucieczek (2–4 na wariant Interface), więc każde zawężenie
    sprawdzamy też na ucieczkach, które traci, nie tylko na precyzji panelu.
- [ ] **Podnieść recall do ≥ 50%.** Następny krok: rozbić ucieczki, których żadna soczewka nie
      łapie, na kategorie i ustalić, czy brakuje zakresu soczewki, czy modelu. Zawężenia pisane po
      lekturze tych samych wyników (held-in), więc na nowych przypadkach liczby będą niższe.
- [ ] **Napisać prompty soczewek** do przeglądu przez właściciela (skill `writing-for-agents`,
      potem `agent-prompting`), na bazie `lenses-v5.json` i `prompt.md` z replayu.

## 3. Odsiew pytań: kluczowe czy delegowalne

- [ ] **Zebrać dane.** Zbiór pytań z przebiegów fd3 (grill, pytania z write-spec, uwagi walidacji)
      z etykietą: do użytkownika czy do agenta. Punkt wyjścia: `labels/m6-question-labels.json` po
      przeglądzie z kroku 1.
- [ ] **Zbudować i dostroić odsiew** na modelach decyzyjnych: Gemini Decision i Jev (TypeSafe).
      Porównać je na tym zbiorze.
- [ ] **Ulepszyć mechanizm** tak, by trafnie kierował pytania do użytkownika.
- [ ] Później: rekomendacja najlepszej opcji i sprawdzenie, czy drzewo decyzji jest pokryte.

## 4. Mod

- [ ] **Szkielet moda:** ustawienia z wartościami domyślnymi (wymaganie 9, pomysły 4 i 10,
      `validation.maxRounds`) i narzędzie odsiewu pytań z kroku 3.

## 5. Grill

- [ ] **Skill grilla** korzystający z narzędzia odsiewu; ewaluacja na wejściach z przebiegów fd3.

## 6. SPEC i jego walidacja

- [ ] **Szablon SPEC.**
- [ ] **Skill zapisu i edycji SPEC.**
- [ ] **Orkiestrator walidacji** (wymaganie 12): soczewki w subagentach, złożenie uwag, odsiew,
      edycja, ponowne sprawdzenie, najwyżej `validation.maxRounds` rund.

## 7. Zadania

- [ ] **Skill podziału na zadania** (wymagania 5, 7, 8, pomysły 3, 11).
- [ ] **Soczewki zadań** (pomysł 8) w tym samym orkiestratorze.
- [ ] **Lista kroków operacyjnych i zgoda** (pomysł 9).
- [ ] **Zmiany SPEC po podziale** (założenie 5).

## 8. Ewaluacja końcowa

- [ ] **Jedna ewaluacja całego procesu** od wejścia do zadań na przypadkach fd3, porównana z
      baseline'em.
