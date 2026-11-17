---
title: Dokumentacja referencyjna
description: Argumenty każdego skilla dev-kit, komendy, które każdy z nich uruchamia bez pytania, i bloki wyniku, które może odczytać wywołujący albo skrypt.
group: reference
sidebar:
  label: Referencja
  order: 10
---

Ta strona wymienia argumenty, z góry dozwolone komendy i bloki wyniku skilli dev-kit.
Opcje etykiety ryzyka, wejścia narzędzia i pola wyniku są na stronie [Etykieta ryzyka: referencja](/pl/plugins/dev-kit/risk-assessment/reference/).

## Argumenty

| Skill | Argumenty |
|---|---|
| `/dev-kit:pr-open` | `[draft] [base branch]` |
| `/dev-kit:pr-shepherd` | `[PR …] [iteration]` |
| `/dev-kit:ci-fix` | `[run/job/PR/commit URL \| run ID \| PR number] [push-authorized] [checkout=<dir>]` |
| `/dev-kit:dep-upgrade-check` | `<package>[@<version>] \| <pull request URL> [unattended]` |

Tabela 1. Argumenty skilli

- **`draft`** (`pr-open`) otwiera draft pull requesta. Nazwa brancha po nim ustawia bazę.
- **`iteration`** (`pr-shepherd`) oznacza jedną rundę pętli. Przekazuje go pętla, ty nie musisz.
- **`push-authorized`** (`ci-fix`) pushuje bez pytania i kończy ze statusem `blocked` wszędzie tam, gdzie `ci-fix` inaczej by cię zapytał. Tak woła `ci-fix` skill `pr-shepherd`.
- **`checkout=<dir>`** (`ci-fix`) wskazuje lokalny checkout do naprawy, gdy wywołujący pracuje w worktree na branchu runu.
- **`unattended`** (`dep-upgrade-check`) o nic nie pyta, kończy ze statusem `stopped` wszędzie tam, gdzie sprawdzenie inaczej by zapytało, i publikuje pełny raport na pull requeście. `GITHUB_ACTIONS=true` działa tak samo.

## Uprawnienia

Każdy skill ma z góry dozwolone tylko niektóre z komend, które uruchamia.
O każdą inną pyta, chyba że twoje ustawienia już na nią pozwalają.

| Skill | Dozwolone z góry | Nadal pyta |
|---|---|---|
| `pr-open` | Nic | Każda komenda `git` i `gh` |
| `pr-shepherd` | Edycja plików; `git status`, `fetch`, `rev-list`, `pull --ff-only`, `log`, `diff`, `merge-tree`, `merge`, `worktree`, `add`, `commit`, `push`; `gh pr view`, `checks`, `comment`; `gh api graphql`; `ci-fix` | Twoje komendy testów i lintera |
| `ci-fix` | Edycja plików; `git status`, `fetch`, `switch`, `log`, `diff`, `show`, `add`, `commit`, `push`; `gh run view`, `list`, `rerun`; `gh pr checks`, `checkout` | `gh api` (checki z aplikacji zewnętrznych); twoje komendy testów, lintera i buildu |
| `dep-upgrade-check` | Zapis plików (zapytanie o advisory i treści komentarzy); `printenv GITHUB_ACTIONS`; `git fetch`, `show`; `gh repo view`; `gh pr view`, `diff`, `checks`; `gh run view`; `gh api`, łącznie z zapisami; `gh release list`, `view`; `pnpm view`, `why`, `list`; `npm diff`; `curl -s` do api.osv.dev i api.deps.dev; WebFetch; wyszukiwanie i scrape firecrawla; context7 | Zapytania dla npm, yarn, Python, Go, PHP, Rust, obrazów kontenerów i GitHub Actions; opcjonalny build w worktree |

Tabela 2. Komendy, które każdy skill uruchamia bez pytania

Pętla `pr-shepherd` bez nadzoru staje przy pierwszym pytaniu o uprawnienia.
Zanim ją uruchomisz, zezwól na komendy checków swojego repozytorium w `.claude/settings.json`, na przykład `"Bash(pnpm test *)"`.

## ci-fix result

Każdy run `ci-fix` kończy się tym blokiem, także przy wczesnym zatrzymaniu:

```
ci-fix result
status: fixed | rerun | nothing-to-fix | not-fixable | blocked
runs: <run URL>, ...
cause: <job / step: why it failed>; ...
commits: <short SHA> <subject>, ... | none
verified: locally | not reproducible locally: <why> | n/a
pushed: yes | no: <why> | n/a
next: <what the user or caller must do, or none>
```

Przy kilku przyczynach `cause` wymienia każdą, a `status` przyjmuje pierwszą pasującą wartość w kolejności `blocked`, `not-fixable`, `fixed`, `rerun`, `nothing-to-fix`.

## dep-upgrade-check result

Każdy run `dep-upgrade-check` kończy się tym blokiem, także przy wczesnym zatrzymaniu:

````
```dep-upgrade-check-result
status: done | stopped
security: clear | escalated | blocked | n/a
verdict: safe | safe with changes | breaking | not assessed | n/a
provisional: true | false
decision: accepted | switched | refresh | hold | pending | n/a
decision_carried: true | false
units: <count>
security_comment: <URL> | none
report_comment: <URL> | none
reason: <one line: why stopped, blocked or provisional> | none
```
````

- **`decision`** zawsze zawiera samą decyzję, także gdy pochodzi z wcześniejszego komentarza, i `n/a`, gdy żadna aktualizacja nie ma wyniku escalated.
- **`decision_carried`** ma wartość `true`, gdy decyzja pochodzi z wcześniejszego komentarza.
- **Przy kilku aktualizacjach** `security` i `verdict` przyjmują najgorszą wartość, a `decision` pierwszą wartość, jaką ma którakolwiek aktualizacja z wynikiem escalated, w kolejności `pending`, `hold`, `switched`, `refresh`, `accepted`.

Bramka w CI przepuszcza `status: done`, `security` równe `clear` albo `escalated` i `decision` równe `accepted` albo `n/a`.

## Pliki referencyjne

`skills/dep-upgrade-check/` zawiera pliki, które czyta skill, a nie komendy:

- `security.md`: zapytania o advisory i komentarz bezpieczeństwa.
- `cooldown.md`: jak okres karencji jest czytany z Renovate'a, Dependabota i pnpm.
- `ecosystems.md`: komendy dla każdego ekosystemu poza pnpm.
- `bot-prs.md`: jak aktualizacje są odczytywane z pull requesta od Renovate'a albo Dependabota.
