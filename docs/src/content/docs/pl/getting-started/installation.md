---
title: Instalacja
description: Dodaj marketplace cc-toolkit do Claude Code, zainstaluj plugin i aktualizuj go później.
group: start
sidebar:
  order: 2
---

Ta strona pokazuje, jak dodać marketplace cc-toolkit, zainstalować z niego plugin i potem go aktualizować. Claude Code musi być już zainstalowany.

## Zainstaluj plugin

1. W sesji Claude Code dodaj marketplace:

   ```
   /plugin marketplace add grixu/cc-toolkit
   ```

2. Zainstaluj plugin po nazwie:

   ```
   /plugin install code-review@cc-toolkit
   ```

3. Przejrzyj, co plugin dodaje, i wybierz zakres:
   - **User:** plugin masz w każdym projekcie na tym komputerze.
   - **Project:** plugin jest włączony dla każdego, kto pracuje w tym repozytorium. Claude Code zapisuje go w `.claude/settings.json`.
   - **Local:** plugin masz tylko w tym repozytorium.

Żeby sprawdzić, czy się udało, wpisz `/` i poszukaj pozycji zaczynających się od nazwy pluginu, na przykład `/code-review:start-cr`. Uruchom `/plugin` bez argumentów, żeby przejrzeć wszystkie pluginy z marketplace'u.

## Zainstaluj z shella

Możesz też instalować bez otwierania sesji:

```sh
claude plugin marketplace add grixu/cc-toolkit
claude plugin install code-review@cc-toolkit
```

Instalacja z shella używa zakresu user. Podaj `--scope project` albo `--scope local`, żeby go zmienić. Tak zainstalowane pluginy ładują się przy następnym starcie Claude Code albo po `/reload-plugins` w otwartej sesji.

## Aktualizuj pluginy

Automatyczna aktualizacja jest domyślnie wyłączona dla zewnętrznych marketplace'ów, takich jak ten. Żeby zaktualizować z sesji, uruchom `/plugin`, otwórz zakładkę **Marketplaces**, wybierz `cc-toolkit` i wybierz **Update marketplace**. Na tej samej zakładce możesz włączyć automatyczną aktualizację.

Żeby zaktualizować z shella, najpierw pobierz nową wersję marketplace'u, potem zaktualizuj plugin:

```sh
claude plugin marketplace update cc-toolkit
claude plugin update dev-kit@cc-toolkit
```

Uruchom `/reload-plugins` w otwartych sesjach albo je zrestartuj, żeby załadować nową wersję.

## Pluginy przemianowane i usunięte

- `comment-review` i `quality-review` zastąpił [code-review](/pl/plugins/code-review/) i nie są już publikowane. Odinstaluj je, jeśli wciąż je masz, bo inaczej zobaczysz zdublowane nazwy skilli.
- `feature-delivery` jest przestarzały. Używaj zamiast niego [fd3](/pl/plugins/fd3/).
