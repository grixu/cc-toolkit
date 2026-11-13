# Polish

Read this for every Polish paragraph, with `lexicon-pl.csv`. The structural patterns in `patterns.md` apply to Polish too ("nie tylko X, ale także Y" is B1, "Nie raport. Nie dashboard." is B2); this file adds what is specific to Polish: officialese, noun-heavy syntax, and translation residue. Most items are cluster signals: one `kluczowy` is not slop, five in a paragraph are.

## Officialese (urzędniczy) · cluster

**Watch:** `niniejszy`, `celem`, `w celu`, `w ramach`, `w zakresie`, `w przypadku`, `z uwagi na`, `na skutek`, `w związku z powyższym`, `dokonać`, `realizować działania`, `podejmować działania`, `ulec poprawie/pogorszeniu`, `posiadać możliwość`, `w dniu dzisiejszym`, `w miesiącu maju`.

| Ciężko | Prosto |
|---|---|
| w celu, celem | aby, żeby |
| niniejszy | ten |
| dokonać zakupu / zgłoszenia / zmiany | kupić / zgłosić / zmienić |
| ulec pogorszeniu | pogorszyć się |
| posiadać możliwość | móc |
| w przypadku braku możliwości | jeśli nie można |
| w dniu dzisiejszym | dzisiaj |
| z uwagi na | bo, ze względu na |

## Nominalizations · cluster

**Signals:** verbal nouns ending in `-anie`, `-enie`, `-cie` doing the work of a verb: `wdrożenie rozwiązania`, `przeprowadzenie analizy`, `podjęcie decyzji`, `zapewnienie możliwości`, `zwiększenie efektywności`.

**Fix:** actor plus a finite verb.
- `przeprowadzenie analizy danych` → `zespół przeanalizował dane`
- `podjęcie decyzji nastąpiło` → `rada zdecydowała`

**Keep:** terms of art, procedure names, and headings where the noun form is natural ("Wdrożenie").

## Passive and impersonal fog · cluster

**Watch:** `zostało wykonane`, `jest realizowane`, `dokonano`, `ustalono`, `przyjęto`, `należy`, `powinno się`, `można zauważyć`.

**Fix:** name the actor when it helps.
- `dokonano zmiany` → `zmieniliśmy`
- `należy złożyć wniosek` → `złóż wniosek`

**Keep:** legal and official text, methods sections, and an unknown or irrelevant actor.

## Genitive chains · one

Stacked genitives hide who does what. Turn the chain into a clause.
- `w przypadku braku możliwości uruchomienia pojazdu` → `jeśli nie możesz uruchomić pojazdu`

## Participial heaviness · cluster

**Watch:** `mając na uwadze`, `biorąc pod uwagę`, `uwzględniając`, `dotyczący`, `obejmujący`, `stanowiący`, `umożliwiający`, `pozwalający`.

**Fix:** split the sentence and put the action in a finite verb.

## Formulaic structures · one

**Watch:**
- `nie tylko X, ale także Y`, `to nie X, lecz Y`, `z jednej strony… z drugiej strony…`, `zarówno X, jak i Y` without a real pair, `od X po Y`;
- `X stanowi Y`, `X wpisuje się w szerszy trend`, `X pokazuje, jak ważne jest Y`.

**Fix:** keep a contrast only when it carries a real distinction; otherwise state the consequence.

## Throat-clearing and metadiscourse · one

**Watch:** `warto zauważyć`, `należy podkreślić`, `co istotne`, `ważne jest, aby`, `jak widać`, `ten punkt jest ważniejszy, niż się wydaje`, `w dzisiejszych czasach`, `w dobie cyfryzacji`, `w dynamicznie zmieniającym się świecie`.

**Fix:** start with the claim. Keep real signposting in a long technical or legal argument.

## Inflated importance and generic nouns · cluster

**Watch:** `kluczowy`, `istotny`, `znaczący`, `fundamentalny`, `kompleksowy`, `przełomowy`, `unikalny`, `holistyczny`, `innowacyjny`; also `interesariusze`, `rozwiązania`, `procesy`, `wyzwania`, `obszary`, `aspekty`.

**Fix:** replace the adjective with the evidence (number, user, deadline, cost), or make the claim smaller. Ask who, when, how much, compared with what.

## Colon reveals and fake insight · one

**Watch:**
- `Największa zmiana: system uczy się sam.`;
- `Oto czego nikt ci nie mówi`, `prawdziwy problem polega na tym`.

**Fix:** write one direct sentence. Keep colons for lists, definitions and labels.

## Endings · one

**Watch:** `podsumowując`, `można stwierdzić`, `czas pokaże`, `to krok w dobrym kierunku`, `ma ogromny potencjał`, `będzie odgrywać coraz większą rolę`, and a closing slogan (`dane są walutą przyszłości`).

**Fix:** end on the last concrete fact or the next step.

## Chatbot residue · one

**Watch:** `jako model językowy`, `mam nadzieję, że to pomoże`, `oto poprawiona wersja`, `mogę pomóc w`.

## Synonym cycling · cluster

Rotating `agent`, `asystent`, `narzędzie`, `system` for one thing suggests distinctions that do not exist. Repeat the established term.

## Translation residue · cluster

English syntax under Polish words.

**Watch:**
- `w oparciu o`, `bazować na`, `na ten moment`, `adresować problem`, `dedykowany` (in the sense of "osobny");
- `robić sens`;
- possessive pronouns on everything (`swój`, `jego`) where Polish drops them;
- English word order with the subject first in every sentence.

**Fix:** write it the way a Polish speaker would say it. See the swaps in `plain-words.md`.

## Punctuation

- **Dash.** Polish uses a dash (pauza or półpauza) where its grammar wants one:
  - in place of an omitted verb (`Warszawa – stolica Polski`);
  - around an insertion;
  - in dialogue.

  Keep those. Flag a dash that only joins two clauses a comma, colon or period would join.
- **Quotes.** Polish quotes are `„…”`, which is correct, not a tell.
- **Commas.** A comma before `że`, `który`, `aby`, `ponieważ` is required, not a tell.
