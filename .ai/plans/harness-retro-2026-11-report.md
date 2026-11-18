# Retro harnessu i kontekstu cc-toolkit — raport łączny (2026-11-17)

**Zakres.** 1200 sesji CC z 27 katalogów projektu (główny checkout + 20 worktree + 166 sandboxów evali), 2026-09-28 → 2026-11-17. 54 sesje interaktywne podzielone na 8 grup (g1–g8), 1146 sesji headless/eval w g9. Każdy agent stosował skill `retro` i porównywał sesje ze stanem z dziś. Raporty cząstkowe: `findings/g1…g9-*.md` obok tego pliku.

**Weryfikacja koordynatora.** Sprawdzone ręcznie: hook ShellCheck w `.claude/settings.json` (kończy się `|| true`), `disable-model-invocation: true` w skillu `release`, istnienie `plugins/fd3/evals/CLAUDE.md`, `scripts/release.sh:22`, 29 commitów `fixup!` na main od 10-01. Z dokumentacji Claude Code (code.claude.com): hook z exit 0 → „Claude never sees stderr”; feedback z PostToolUse daje exit 2 albo JSON `additionalContext` / `decision: "block"`; `CLAUDE_CODE_SHELL` przyjmuje ścieżkę do bash lub zsh.

---

## Ranking (pewność = ile grup niezależnie to zgłosiło)

| # | Problem | Gdzie naprawić | Waga | Grupy |
|---|---|---|---|---|
| 1 | Gate codebase-memory blokuje legalne grepy (~300 blokad), komunikat nie prowadzi do właściwego narzędzia, blokada zjada całą komendę | `~/.claude/hooks/cbm-bash-search-gate`, `tool-hygiene.md`, globalny CLAUDE.md | wysoka | 9/9 |
| 2 | Release robiony ręcznie / z głównego checkoutu / z zgadywaniem promptów | `CLAUDE.md` § Releasing, `scripts/release.sh`, skill `release` | wysoka | g1,g3,g4,g5,g6,g7 |
| 3 | Hook ShellCheck jest no-opem → 2 czerwone CI (PR #20, #27) | `.claude/settings.json` | wysoka | g2,g3,g4 |
| 4 | Brak CI dla struktury pluginów: `plugin validate`, `plugin test`, zgodność marketplace, `/verify`, kopie `decision.ts` | `lint.yml`, nowy `scripts/verify-plugins.mjs` | wysoka | g3,g5,g7,g8 |
| 5 | zsh: `echo ====`, `nomatch` globów, `$G` bez word-splittingu, zmienna `path`, aliasy `ls`/`g`/`gk` | `CLAUDE_CODE_SHELL` (settings env) + `run-evals.sh` | wysoka | g5,g6,g7,g8,g9 (33% błędów evali) |
| 6 | `cbm-hook-augment` wstrzykuje ~180k tokenów szumu (755 razy w jednej sesji) | `~/.claude/settings.json` hook + `cbm_graph_suggest.py` | wysoka | g1,g2 |
| 7 | Merge na protected main — za każdym razem rekonesans i pytanie o `--admin` | `CLAUDE.md` lub memory | średnia | g3,g4,g7 (≥14 razy) |
| 8 | Hooki sekretów: fałszywe alarmy (`location`→cat, `headless`→less, `--rm`, `/var/folders`, nazwa pliku memory) | `~/.claude/hooks/protect-secrets.js`, `block-dangerous-commands.js` | średnia | g1–g8 (~30) |
| 9 | Kompaktowanie gubi komendy uruchomień i decyzje workflow | nowa reguła `.claude/rules/evals.md` + memory | średnia | g1,g2,g6 |
| 10 | Brak nawigacji: docs/, evals, testy pluginów, fd3 workflows, R2 | nowe reguły `.claude/rules/{docs,evals,fd3}.md`, 3 wskaźniki w CLAUDE.md | średnia | g2,g3,g4,g6,g8 |
| 11 | Eval harness: zsh vs bash, sandbox blokuje `~/.ccs/tool-results`, code-review eval ocenia sam cc-toolkit | `run-evals.sh`, `evals-isolation.json`, `promptfooconfig.yaml` | średnia | g9 |
| 12 | Komunikacja z userem: pytania o fakty dostępne narzędziami, wewnętrzny żargon, listy bez linków | globalny CLAUDE.md „How I work” | średnia | g1,g5,g8 |
| 13 | `fixup!` lądują na main bez squasha (29) | pr-shepherd lub CI check | średnia | g7 |
| 14 | `gh pr checks` exit 1 przy pending/no-required przerywa `&&` | `plugins/dev-kit/skills/pr-shepherd/SKILL.md` | niska | g3,g6,g7,g8 |
| 15 | Drobne: fd3 split-to-tasks stop na przesuniętych numerach linii; 1Password `--account`; Reddit; zrzuty ekranu w kontekście; nieaktualna memory docs-site | różne | niska | g2,g3,g8 |

---

## 1. Gate codebase-memory — największy pojedynczy koszt

**Dowody.** g1: 103 blokady w sesji głównej + 56 w subagentach, 57× obejście przez `node -e`; replay 103 komend przez dzisiejszy hook → wszystkie nadal blokowane. g2: 40 blokad, 22× agent odpalił tę samą komendę bez grepa, 3× przeszedł na `search_code`. g4: 4 komendy, w których blokada zjadła `cp`, `git worktree add`, edycję. g6/g7: identyczne zablokowane komendy ponawiane (także po kompaktowaniu). g8: ~30 blokad (yml, `.d.ts`, `*.session/` git-ignored). Koordynator: zablokowany przy weryfikacji tego raportu (`ls`+`grep` po `lint.yml`).

**Przyczyny.**
- `is_indexed()` nie sprawdza `git check-ignore` → katalogi git-ignored (np. `plugins/dev-kit/evals/pr-risk/local/**`, `.ai/specs/*/SPEC.session/`) są blokowane, choć `search_code` zwraca tam 0.
- grep bez `-r` na jawnie nazwanych plikach traktowany jak wyszukiwanie w kodzie; yml/json/sh/`.d.ts` traktowane jak kod.
- Komunikat nie wymienia `get_file_outline`, `Read` z offsetem ani tego, że cała komenda nie wykonała się.
- Niespójność sterowania: globalny CLAUDE.md mówi „grep for literals, config strings, non-code files”, `tool-hygiene.md` mówi „codebase-memory before any grep”, hook egzekwuje wersję surowszą.

**Propozycja (hook).**
1. Przepuszczaj, gdy wszystkie operandy są istniejącymi plikami i brak `-r`/`-R`.
2. Przepuszczaj ścieżki, które `git check-ignore -q` uznaje za ignorowane.
3. Przepuszczaj `*.yml|*.yaml|*.json|*.toml|*.sh|.gitignore` i wzorce konfliktów (`^<<<<<<<`).
4. Komunikat: „Cała komenda NIE wykonała się — uruchom pozostałe kroki osobno. Jeden plik: Read z offset / `get_file_outline`. Repo: `search_code` z `path_filter`.” Dla `sed -i`/python-heredoc: „użyj Edit”.

**Propozycja (sterowanie).** Jedna spójna linia w `tool-hygiene.md` w miejsce obecnej: „Szukanie po repo: codebase-memory. grep jest OK na nazwanym pliku i na plikach spoza indeksu. Grep zawsze w osobnym wywołaniu Bash. Zablokowana komenda nie przejdzie przy ponowieniu — przepisz ją.” Globalny CLAUDE.md § Code exploration — zostaw jako jest (zgodny z hookiem po zmianie).

## 2. Release

**Dowody.** g3: `printf 'y\nn\n' | release.sh`, potem ręczny `push HEAD:main` z pominięciem PR, ręczne notatki release (DOCS:262-275); własna pętla po `[Unreleased]` (DESC:1381). g6: `Skill(release)` odrzucony (user-only), `git switch main` niemożliwy (main w głównym checkoucie), na lokalnym main wisiał cudzy niewypchnięty `release: tester v0.2.0`. g4/g5: `printf 'y\ny\n'`, 6 dodatkowych wywołań na odkrycie `CI=true`. g7: „merguj z admin, następnie release” w 7 sesjach.

**Propozycja.**
- `CLAUDE.md` § Releasing (zastępuje obecny tekst):
  > Release only after the user asks for it. From a detached worktree on fresh `origin/main` (`git worktree add --detach <tmp> origin/main`), run `CI=true ./scripts/release.sh <plugin> <patch|minor|major>`; never release from the main checkout. To release every plugin with a non-empty `[Unreleased]`: `### Added` → minor, otherwise patch, one at a time, stop on first failure. `main` is protected: when the user says merge, use `gh pr merge <n> --merge --admin --delete-branch`.
- `scripts/release.sh`: `git fetch` + die unless `HEAD == origin/main`; `git push origin HEAD:main` zamiast gołego `git push` (działa z detached worktree).
- Skill `release`: albo zdjąć `disable-model-invocation`, albo zostawić user-only i polegać na powyższym akapicie. Rekomendacja: zdjąć — skill i tak niesie preflight.
- Poprawić komentarz `release.sh:22` (zależności między pluginami istnieją: code-story→anti-slop, dev-kit→oba).

## 3. Hook ShellCheck — no-op, który kosztował 2 czerwone CI

**Dowody.** g4: SC2016 wykryty przez hook z exit 0, CI padło na PR #20, 2 próby naprawy. g2: SC2015 to samo na PR #27; plik zapisany przez `cat >`, więc hook w ogóle go nie zobaczył. Docs: stderr przy exit 0 nie trafia do modelu.

**Propozycja (`.claude/settings.json`).**
```
jq -r '.tool_input.file_path // .tool_response.filePath' | { read -r f; case "$f" in *.sh) shellcheck "$f" >&2 || exit 2 ;; esac; }
```
Zapis przez heredoc omija hook — to drugi argument za regułą „pliki tylko Edit/Write” (patrz §12, no-opy).

## 4. Brak automatycznych checków struktury pluginów

**Dowody.** `lint.yml` uruchamia tylko shellcheck + `check-codex-plugins.sh` (zweryfikowane). `/verify` wywołany 1× na ~40 commitów (g5) i 0× na ~26 (g2). Testy modów (`plugins/*/tests/*.test.ts`) uruchamiane tylko lokalnie; bug „wrong checkout” w pr_risk naprawiany 3× (g7). Agenci szukali nieistniejącego `tsc`/tsconfig (g8). Kopie `hooks/decision.ts` + `providers/*` w 3 pluginach synchronizowane tylko komentarzem, nagłówek „copied at <hash>” był nieaktualny (g7, PR #51). `plugins/fd3/evals/CLAUDE.md` łamie regułę repo i `/verify` tego nie widzi (g4).

**Propozycja.**
- Przenieść checker z `.claude/skills/verify/SKILL.md` (Python wklejony w skill — sprzeczne z „Bash > Node > Python”) do `scripts/verify-plugins.mjs`; dodać: limit 2 zdań w description, zgodność plugin.json ↔ marketplace.json, `CLAUDE.md` gdziekolwiek w drzewie pluginu (poza `fixtures/`), `cmp` kopii decision/providers.
- `lint.yml`: job `verify-plugins` + job z przypiętym Claude Code: `claude plugin validate` i `claude plugin test` dla zmienionych pluginów.
- Repo `CLAUDE.md`, jedna linia „Checks:” z tymi komendami i informacją, że mod code nie ma tsc.
- Skill `verify` zostaje jako cienka nakładka: uruchamia skrypt i ocenia resztę.
- Przenieść treść `plugins/fd3/evals/CLAUDE.md` do `.claude/rules/fd3.md`.
- Opcjonalnie gitleaks w CI (g2: GitGuardian złapał fikstury z prywatnego repo w PR #41).

## 5. Powłoka: zsh

**Dowody.** g9: 132/396 błędów evali (33%), 7/9 rodzin — `echo =====DIFF` → „not found”, `CONTRIBUTING*` → „no matches”; CI na ubuntu/bash tych błędów nie ma. g5: `echo ====` 15×, alias `ls`→eza zepsuł `ls -t` 5×. g6/g7: `$G add` → exit 127 (przerwany commit), kolizje z aliasami `g`/`gk`. g8: `while read id path` wyzerował PATH.

**Propozycja.** Jedna zmiana zamiast pięciu reguł: `"env": {"CLAUDE_CODE_SHELL": "/opt/homebrew/bin/bash"}` w user `settings.json` (nie `/bin/bash` — to bash 3.2) oraz `export CLAUDE_CODE_SHELL=…` w `scripts/run-evals.sh`. Uwaga: bash nie czyta `.zshrc`, więc PATH z nvm/pnpm trzeba zapewnić w środowisku (g5: pnpm znikał z PATH, bo nvm ładuje się tylko w login shell) — sprawdzić przed wdrożeniem. Jeśli zostajemy przy zsh: jedna linia w `tool-hygiene.md` (bez zmiennych z komendą, bez nazwy `path`, globy mogą nic nie dopasować, separator inny niż `====`).

## 6. `cbm-hook-augment`

**Dowody.** g1: 755 wstrzyknięć ≈ 734k znaków (~180k tokenów), +491 w subagentach, wyzwalane słowami typu „PASS”, „import”, „read”. g2: 45 wstrzyknięć, ten sam wzorzec. Działa dziś.

**Propozycja.** Zdjąć z matchera Bash (zostawić na `search_code`), albo odpalać tylko gdy komenda jest wyszukiwaniem po zindeksowanym kodzie i token wygląda na identyfikator (camelCase/snake_case, ≥4 znaki, nie ze stop-listy).

## 7–8. Merge i hooki sekretów

- **Merge (≥14×).** Wpis w § Releasing (wyżej) albo memory. Jeśli chcesz zachować pytanie o `--admin`, zapisz to wprost — dziś agent co raz robi rekonesans rulesetów.
- **Hooki sekretów** (`protect-secrets.js:111-112`, `block-dangerous-commands.js:32-33,51`): dopasowania w obrębie jednego segmentu komendy (`[^;&|\n]*`), `\bcat\b`/`\bless\b` jako słowa, wymagany `\.env\b` w `xargs-cat-env`/`find-exec-cat-env`, `rm` tylko jako słowo-komenda (nie `--rm`), wyjątek `/(private/)?var/folders/`, `.md` poza `cat-secrets`. Zmienić nazwę `pr-risk-secrets-file.md` (sama nazwa wyzwala hook). W `tool-hygiene.md` dokładna forma: `test -n "$VAR" && echo set || echo unset` (nazwa zmiennej tylko w teście). Skill `/lint` i `lint.yml`: `git ls-files -z '*.sh' | xargs -0 shellcheck`.

## 9–10. Nawigacja i trwałość kontekstu

Nowe reguły path-scoped (zgodnie z konwencją repo):
- `.claude/rules/docs.md` (`docs/**`, `brand/**`): źródło prawdy `docs/DESIGN.md`; każda strona ma bliźniaka EN/PL; anti-slop przed commitem prozy; build już waliduje linki (`starlight-links-validator`), nie pisz własnego checkera.
- `.claude/rules/evals.md` (`plugins/*/evals/**`, `scripts/run-evals.sh`): jak uruchamiać (`scripts/run-evals.sh`, `--trials`); skrypty eksperymentów w `evals/<suite>/local/<eksperyment>/`, każda komenda i ścieżka wyniku do `RUNS.md` przed startem; prywatne dane/fikstury tylko przez R2 (`evals/data.mjs`), nigdy git ani publiczne artefakty CI.
- `.claude/rules/fd3.md` (`plugins/fd3/**`): skrypty workflow sprawdzaj `node --test 'plugins/fd3/tests/workflows/*.test.mjs'` (nie `node --check`); duże pliki (`implement-run.js` 108 KB) — `get_file_outline` + Read z offsetem; treść z `plugins/fd3/evals/CLAUDE.md`.
- Memory: przepisy uruchomień `codex exec` / `ccs` / agy (g1: komenda Codexa odtwarzana 4×); `op` zawsze z `--account my.1password.com` (g2: 3× po kompaktowaniu); zaktualizować `docs-site-line-map-decision.md` — sekcja „Look” → wskaźnik do `docs/DESIGN.md` (g3).

## 11. Eval harness (g9)

Harness jest zdrowy (3,3% błędów, 0 przerwanych przebiegów; izolacja ustawień i sekretów działa). Do poprawy:
- `CLAUDE_CODE_SHELL` (patrz §5) — usuwa 1/3 błędów i rozjazd lokalnie vs CI.
- `scripts/evals-isolation.json` blokuje cały `~/.ccs`, a tam CC zapisuje duże wyniki narzędzi → 17/66 przebiegów nie mogło ich odczytać. Zawęzić blokadę do plików z sekretami.
- `plugins/code-review/evals/promptfooconfig.yaml:69` `working_dir: ../../..` — skill czyta CLAUDE.md i rules cc-toolkit jako projekt pod review (122/136 quality-review); wyniki zależą od worktree. Kopiować wejścia do sandboxa w `reset-sandbox.sh`.
- `TMPDIR` i `npm_config_cache` do wnętrza sandboxa; w pr-open `reset-sandbox.sh` ustawić upstream gałęzi.

## 12. Komunikacja z użytkownikiem (globalny CLAUDE.md § How I work)

Dowody: 9× pytanie o fakty dostępne przez `gh`/`spacectl`/kod, arkusz 109 wierszy do ręcznego wypełnienia („Dlaczego mam wypełniać?”) (g1); 3× „nie rozumiem” na listę decyzji w skrócie wewnętrznym (g5); 2× prośba o linki do PR (g8). Propozycja, dwie linie:
- „Look facts up with tools (gh, spacectl, code, a subagent) before asking; ask only for decisions. Before handing me manual work, say why the inputs can't settle it.”
- „In questions and follow-ups, lead each item with the effect I'd notice, define any coined term, and link every PR/issue/file you ask me to look at.”

## 13–15. Mniejsze

- `fixup!` na main (29): krok autosquash + `--force-with-lease` w pr-shepherd przed merge albo check CI odrzucający PR z `fixup!`.
- pr-shepherd krok 4: `gh pr checks` zwraca exit ≠0 przy pending/no-required — czytaj JSON, nie łańcuchuj `&&`.
- `fd3:split-to-tasks` `SKILL.md:107-115`: niezmieniony tekst z przesuniętymi numerami linii → zaktualizuj piny i zgłoś, nie zatrzymuj (user musiał interweniować).
- Zrzuty ekranu: przegląd wizualny w subagencie albo `sips -Z 1600` (g2: 64, g3: 127 odczytów PNG, 10–14 kompaktowań).
- Firecrawl: wskaźnik do `code.claude.com/docs/llms.txt` i „scrape raz do scratchpadu, potem grep” (g7: rate limit 2×; nieistniejący skill `plugin-authoring`).
- `.agentkit/` do `.gitignore`; kity instalować w user scope / `settings.local.json` (g3).
- `git remote set-head origin -a` w głównym checkoucie (g5).
- Skill `retro`: domyślnie ostatnia *inna* sesja projektu (g7: `/retro` w świeżej sesji nic nie zrobił).

---

## Martwe i sprzeczne reguły sterujące

| Reguła | Stan | Propozycja |
|---|---|---|
| `tool-hygiene.md` nagłówek „hooks block these” | nieprawdziwe dla `cd`, edycji sed/python/heredoc | „Avoid these” albo dodać hooki |
| `tool-hygiene.md` „never start with `cd`” | **sprzeczne dane**: g1 — spadek 16% → 5,6%; g7 — 193 wywołania z `cd`, 68/92 w jednej sesji | zostawić; ewentualnie hook, jeśli chcesz 0 |
| `tool-hygiene.md` „Read, not cat; Edit/Write, not heredoc” | 21 zapisów przez powłokę (g2), jeden ominął ShellCheck | zostawić, połączyć z naprawą §3 |
| `tool-hygiene.md` „codebase-memory before any grep” | bez efektu (blokady wzrosły po wprowadzeniu); sprzeczne z globalnym CLAUDE.md | zastąpić linią z §1 |
| „Always run `/verify` right before commit” (z promptu Bash) | 0–1 wywołań na ~66 commitów | CI z §4; reguła wtedy zbędna |
| Repo CLAUDE.md „Always propose a plan…” | dubluje globalne „Plan first” | usunąć |
| Repo CLAUDE.md „Requires jq and git” | skrypt sam to sprawdza | usunąć |
| Repo CLAUDE.md „Always read the current plugin documentation” | brak lokalizacji → zgadywanie | dodać `code.claude.com/docs/llms.txt` |
| `MEMORY.md` | ~50 wielozdaniowych wpisów ładowanych co sesję | skrócić do jednolinijkowych wskaźników |

## Niespójności dokumentacja ↔ kod

1. `scripts/release.sh:22` — „no inter-plugin dependencies (none exist today)”, a code-story i dev-kit deklarują zależności.
2. Repo CLAUDE.md zakazuje `CLAUDE.md` w pluginie — istnieje `plugins/fd3/evals/CLAUDE.md`.
3. `.claude/rules/code-story.md` — „runner odrzuca importy `node:*`”, a `plugins/code-review/tests/register.test.ts:1-2` importuje `node:test` (g8; niezweryfikowane przez koordynatora).
4. Repo CLAUDE.md „Bash > Node > Python” — checker `/verify` jest w Pythonie.
5. README opisuje evale jako promptfoo, a anti-slop i code-story używają `claude plugin eval` (g8; niezweryfikowane).
6. Globalny CLAUDE.md (grep OK na literały/config) ↔ `tool-hygiene.md` i hook gate (zawsze cbm).

## Co działa — zachować

- pr-open → pr-shepherd `/loop` → ci-fix: PR-y doprowadzane do zielonego z niewieloma korektami; pr-shepherd zatrzymuje się przy brudnym drzewie.
- Fan-out do subagentów (audyty README, analiza przebiegów, review komentarzy botów) trzyma kontekst główny mały.
- Memory faktycznie używana (`cc-mod-process-cwd`, `pr-risk-secrets-file` + `!`, `cc-plugin-eval-gotchas`).
- Plany w `.ai/plans/` z checkboxami, pipeline opisów pluginów z CLAUDE.md wykonany w całości.
- Dyscyplina 1Password (tylko etykiety, wartości przez `$(op read …)`).
- Izolacja evali (`setting_sources: []`, `evals-isolation.json`, `--trials` z resetem, `meta.json`).

## Proponowana kolejność wdrożenia

1. **Szybkie, globalne, duży efekt** (user scope, poza repo): gate cbm (§1), `cbm-hook-augment` (§6), hooki sekretów (§8), `CLAUDE_CODE_SHELL` (§5, po sprawdzeniu PATH), `tool-hygiene.md` porządki.
2. **Repo, jeden PR „harness”**: hook ShellCheck (§3), § Releasing + `release.sh` (§2), 3 reguły path-scoped (§10), porządki CLAUDE.md (martwe reguły), przeniesienie `plugins/fd3/evals/CLAUDE.md`.
3. **Repo, PR „checks”**: `scripts/verify-plugins.mjs` + jobs w `lint.yml` (§4).
4. **Eval harness**: `run-evals.sh` shell/TMPDIR, `evals-isolation.json`, `working_dir` code-review (§11) — z re-pomiarem przed/po.
5. **Pluginy** (osobne PR-y z release): pr-shepherd (§13–14), fd3 split-to-tasks.
6. **Memory**: przepisy uruchomień, `--account`, docs-site, skrócenie `MEMORY.md`.
