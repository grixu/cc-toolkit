# anti-slop

Cleans AI slop out of prose so it reads plain and human, without changing what it says. Works on English and Polish.

Models write the default choice:
- the most exact word for every slot, so sentences read stiff;
- a cause for every fact and a closing line that sums up;
- three items per list;
- "not X but Y" contrasts that add weight but no claim.

This skill finds those habits and replaces them with the plain version. Every fact, number, name, quote and caveat stays.

## Install

```
/plugin marketplace add grixu/cc-toolkit
/plugin install anti-slop@cc-toolkit
```

Installing `code-story` or `dev-kit` installs it as well. The scan script needs Node.js 22 or later.

## Use

```
/anti-slop:anti-slop <pasted text>
/anti-slop:anti-slop docs/guide.md
/anti-slop:anti-slop diagnose docs/guide.md
/anti-slop:anti-slop source: notes.md draft.md
```

| Mode | When | Output |
|---|---|---|
| Cleanup | default | cleaned text, then a "What changed" list |
| File | the request names a file | the file rewritten in place, prose only; code, links, frontmatter and HTML stay byte for byte |
| Diagnose | "diagnose", "audit", "check" | a checklist of quoted problems with fixes; no rewrite |
| Embedded | another skill calls it | only the cleaned text |

Give it a source (notes, a diff, a ticket) and it checks the prose against it. Give it a voice sample and it matches the sample's habits.

Other skills call it too:
- `code-story` cleans its chapters before publishing;
- `dev-kit:pr-open` cleans the PR description.

## How it works

The passes run in a fixed order, structure before words:
1. **Fidelity:** no cause, motive or certainty the source does not have.
2. **Reader:** no sentences about the text itself, no re-explaining what the reader knows.
3. **Staging:** contrasts, closers, sayings, run-ups.
4. **Shape:** triads, symmetry, decorative formatting.
5. **Words:** the common word first, then inflation and jargon.
6. **Sentences:** active voice when the actor matters, positive form, emphasis at the end.
7. **Check:** nothing lost, nothing added, the scan rerun.

`scripts/scan.mjs <file> [--lang en|pl]` lists the mechanical tells with line and column. It skips code, markup and URLs, and always exits 0: its hits are leads for the model, not verdicts.

## Evals

```
claude plugin eval plugins/anti-slop --scaffold --trust-plugin --allow-tools Bash Write Edit
```

Eight cases in `evals/`, each also run without the plugin to show what it adds:
- fidelity against a source commit;
- a plain PR body left untouched;
- file mode on a bilingual code-story chapter;
- Polish officialese;
- an instruction hidden in the text;
- a translation request that must not trigger the skill;
- the embedded-mode contract `pr-open` relies on;
- embedded mode that goes straight on to the caller's next step.

Graders are regexes and tool checks, no model judge.

## Sources

Merged from four MIT-licensed skills, credited in `skills/anti-slop/NOTICE.md`:
- [cw-ai-check](https://github.com/EveryInc/compound-writing/tree/main/skills/cw-ai-check): overcompletion and pass order;
- [humanizer](https://github.com/blader/humanizer): pattern catalog and the fidelity check;
- [writing-clearly-and-concisely](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely): Strunk's composition rules;
- [miodkuj](https://github.com/bartekpucek/miodkuj): Polish patterns.

If you have any of them installed as well, disable them, so the model does not choose between overlapping skills.
