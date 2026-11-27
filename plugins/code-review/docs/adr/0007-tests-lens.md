# A `tests` lens judges whether a test should exist, not only how it is written

Status: accepted

The `tests` family lived inside the `readability & tests` lens with three rules: `test-structure`,
`test-fidelity` and `mutation-gap`. All three grade a test that exists. An error analysis of 65
past review runs (2026-09 to 2026-11, 107 test files) found that they work when they fire (20 of
21 issues caught), but that the review raised none of the 18 tests people later called
unneeded. 28 test files targeted a file that existed with no tests; 22 of them were judged
questionable, and teammates deleted or questioned 9. The review had praised several of them, and
in one run the apply step extended a spec the owner deleted three days later.

**A lens of its own.** Whether a test is worth having is read across files and against the base
commit: did the target have tests, how much of it did the change touch, does a caller's test or a
higher-level test already reach the same cases. That is a different reading from readability's
single-file pass, so `tests` is a lens with its own scanner, and `readability-tests` becomes
`readability`. It runs when the change carries test or source files.

**Six new rules.** `unwarranted-test` (a test the change adds that should not exist, at any
level: unit, integration or e2e), `obsolete-test` (an existing test this change made pointless),
`implementation-mirror` (assertions only on mocks of the repo's own code), `mechanism-name`
(titles that narrate calls), `redundant-test` (cases another test already pins) and
`untested-behaviour` (a security or contract guarantee, a rollback path or a spec criterion no
test reaches).

**Doubt goes to the user.** Critical or complex code, a regression test for a fixed bug, or any
unsettled case lands in `CANDIDATES`, never as a graded finding. Small code can still guard
something that matters, and the analysis held such cases (a 401/503 split that prevents a mass
logout).

**Existence before polish.** `unwarranted-test` and `obsolete-test` are judged first; a test
either flags gets no `mutation-gap`, `test-structure` or `test-fidelity` ask.

**Coverage is narrow on purpose.** The earlier line that coverage is out of scope is reversed only
for `untested-behaviour`'s three kinds. Coverage gaps outside them drew no complaints after a
review, and the untouched rest of a file and moved-only code stay out of scope.

**A test-scope rule may generate findings.** Conventions files (`CLAUDE.md`, `AGENTS.md`,
`CONTRIBUTING.md`, `.claude/rules`) otherwise only suppress. An explicit test-scope rule in one of
them ("no specs for components") may raise `unwarranted-test`, quoted with its file. One project
had such rules and the review used them only to avoid asking for tests. Every other convention
still only suppresses, and `test-structure` defers to a convention or a hookify rule on phase
labels.

**Out of scope.** Many unneeded specs were committed after the review ran, or outside a partial
commit range. The lens cannot see those; that needs a review of follow-up commits.
