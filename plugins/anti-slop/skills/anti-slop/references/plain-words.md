# Plain words

Pass 5 starts here. This is the tell that survives every other pass: a model reaches for the most exact word for each slot. Each word is defensible on its own, but together they make a sentence the reader has to decode. A person reaches for the word that comes first. Exactness costs the model nothing and costs the reader a pause for every rare word.

## The rule

**Use the common word.** Swap in a rarer one only when the common word would be wrong, not merely less exact.

**Tests,** any one enough to flag:
- **Say it:** would you say this word to a colleague across the desk? "We need to *ascertain* whether…" fails; "We need to *check* whether…" passes.
- **Stop:** would a reader fluent in the language, but outside your team, slow down on it?
- **Stack:** does the sentence carry two or more such words? Then the sentence reads as generated even when each word is fine. Keep at most one.
- **Swap:** does a word from everyday speech keep the meaning for this reader? Then it wins, even if it is slightly broader.

**Keep:**
- **Terms of art** that the field uses and the reader knows: *idempotent*, *race condition*, *debounce*, *invariant* in a code context, *migration*, *rollback*. Replacing a term with a looser word costs meaning; the rule is about prose around terms, not the terms.
- A word the writer clearly chose. Their voice is not slop.
- Legal, medical and other fixed wording.

**Fix order:**
1. Swap in the common word.
2. If the swap loses meaning, keep the word and cut another rare word from the same sentence.
3. If the sentence still needs three rare words, split it.

## English swaps

These are leads, not bans. Check that the plain word keeps the meaning.

| Exact-sounding | Plain |
|---|---|
| utilize, leverage | use |
| facilitate, enable | help, let, make possible |
| ascertain, determine | find out, check |
| commence, initiate | start |
| terminate, conclude | end, stop |
| endeavor | try |
| demonstrate | show |
| subsequently | later, then |
| prior to | before |
| in order to | to |
| a number of | some, several, or the number |
| surface (verb) | show, report, raise |
| load-bearing | that matters, that the rest depends on |
| orthogonal | unrelated, separate |
| canonical | main, standard (keep when it is the term) |
| granular | detailed, fine-grained |
| salient | main, important |
| nuanced | (say what the nuance is) |
| materially, substantively, meaningfully | much, a lot (or cut) |
| non-trivial | hard, takes work |
| articulate, delineate, elucidate | say, explain, describe |
| encapsulate | wrap, hold, sum up |
| ergonomic | easy to use |
| affordance | (say what the user can do) |
| posture | stance, approach |
| cadence | how often, rhythm |
| semantics | meaning, behavior |
| mitigate | reduce, limit |
| exacerbate | worsen |
| ameliorate | improve |
| holistic | whole, overall (or cut) |
| principled | (say the principle) |
| robust | reliable, handles X (keep the statistical sense) |
| at scale | (say the scale) |

## Polish swaps

Polish tells lean on borrowed words and noun phrases. Officialese and nominalizations are in `polish.md`; these are the single-word swaps.

| Brzmi precyzyjnie | Prościej |
|---|---|
| stanowi | jest |
| umożliwia | pozwala, można |
| zweryfikować | sprawdzić |
| zaadresować (problem) | rozwiązać, zająć się |
| wyeliminować | usunąć |
| zaimplementować (w prozie, nie o kodzie) | zrobić, dodać |
| dedykowany | osobny, przeznaczony dla, dla |
| finalnie | w końcu, ostatecznie |
| kluczowy | najważniejszy, główny |
| istotny | ważny |
| adekwatny | odpowiedni |
| optymalny | najlepszy |
| procedować | zająć się, przeprowadzić |
| inicjować | zaczynać |
| generować (koszty, problemy) | powodować |
| posiadać | mieć |
| realizować | robić, wykonać |
| aplikować (zmianę) | stosować, wprowadzać |
| mitygować | ograniczać |
| wdrożyć (w prozie ogólnej) | wprowadzić |
| w kontekście | przy, w, w sprawie |
| na ten moment | teraz |
| w oparciu o | na podstawie |
| bazować na | opierać się na |

Keep the English term in Polish text when it is the term the team uses (*deploy*, *feature flag*, *merge*, *pull request*). A forced Polish word is as stiff as a rare one.
