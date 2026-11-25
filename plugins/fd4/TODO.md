# fd4: do zrobienia

Kolejność prac nad drogą do zadań z [`GOAL.md`](GOAL.md). Każdy etap dostaje własne ewaluacje
(zasada 2): najpierw _red_ na przebiegach fd3, potem _green_ po zmianie.

## 1. Baseline i progi sukcesu

- [ ] **Przegląd baseline'u przez właściciela.** Rozstrzygnąć 10 otwartych pytań z sekcji „Open
      questions” w `evals/baseline/local/fd3/REPORT.md`: etykiety m6, m9–m12, granice m1 i m4, cel m8.
- [ ] **Progi sukcesu.** Dla każdej metryki m1–m13 zapisać próg _green_ dla fd4 i sposób pomiaru.

## 2. Soczewki walidacji

- [ ] **Porównać zakresy soczewek ze źródłami.** Jeden subagent czyta prompty z
      [aself101/agents-and-pipelines](https://github.com/aself101/agents-and-pipelines) (np.
      `agents/assumption-excavator.md`) i walidację z fd3 (`plugins/fd3/skills/validate-spec/`), po
      czym zestawia je z opisami w wymaganiu 6 i pomyśle 8. Tam, gdzie zakresy się różnią, poprawić
      opisy w `GOAL.md`.
- [ ] **Napisać prompty soczewek** do przeglądu przez właściciela (skill `writing-for-agents`).

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
      `validation-max-rounds`) i narzędzie odsiewu pytań z kroku 3.

## 5. Grill

- [ ] **Skill grilla** korzystający z narzędzia odsiewu; ewaluacja na wejściach z przebiegów fd3.

## 6. SPEC i jego walidacja

- [ ] **Szablon SPEC.**
- [ ] **Skill zapisu i edycji SPEC.**
- [ ] **Orkiestrator walidacji** (wymaganie 12): soczewki w subagentach, złożenie uwag, odsiew,
      edycja, ponowne sprawdzenie, najwyżej `validation-max-rounds` rund.

## 7. Zadania

- [ ] **Skill podziału na zadania** (wymagania 5, 7, 8, pomysły 3, 11).
- [ ] **Soczewki zadań** (pomysł 8) w tym samym orkiestratorze.
- [ ] **Lista kroków operacyjnych i zgoda** (pomysł 9).
- [ ] **Zmiany SPEC po podziale** (założenie 5).

## 8. Ewaluacja końcowa

- [ ] **Jedna ewaluacja całego procesu** od wejścia do zadań na przypadkach fd3, porównana z
      baseline'em.
