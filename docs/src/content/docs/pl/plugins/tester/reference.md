---
title: Dokumentacja referencyjna
description: Argument, wymagania, werdykty i klasy błędów w raporcie oraz pliki, które zostawia uruchomienie.
group: reference
sidebar:
  label: Referencja
  order: 4
---

## Komenda

```
/tester:run [<spec-path-or-url> | free-text scope]
```

| Argument | tester sprawdza |
|---|---|
| ścieżka albo URL specu | kryteria akceptacji specu, jego sekcje o błędach i przypadkach brzegowych oraz kontrakty API, bazy i konfiguracji, które opisuje |
| dowolny tekst, na przykład `"the org-role assignment endpoints"` | kod za tym obszarem i spec, jeśli jakiś leży obok |
| nic | `git diff` względem merge base z głównym branchem oraz spec, do którego odwołuje się diff |

Tabela 1. Jaki zakres wyznacza każda postać argumentu.

tester nie ma flag ani konfiguracji.
Uruchamiasz go ręcznie; Claude nie wywoła go z własnej inicjatywy.

## Wymagania

| Potrzebne | Do czego | Bez tego |
|---|---|---|
| lokalne albo stagingowe środowisko | każde sprawdzenie | wyłączone środowisko można uruchomić po twojej zgodzie; bazowy URL, który wygląda na produkcję, przerywa uruchomienie |
| `curl` i `git` | sprawdzenia API i zakres z diffu | — |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | sprawdzenia interfejsu i logowanie użytkowników testowych | sprawdzenia interfejsu dostają `BLOCKED` z podanym powodem |
| Docker | sprawdzenia awarii, które wstrzymują kontener albo dodają proxy WireMock | te sprawdzenia awarii dostają `SKIP` z podanym powodem |
| klient bazy, na przykład `psql`, albo narzędzie MCP do bazy (opcjonalnie) | sprawdzenia, które czytają wiersze z bazy; zapytania są tylko do odczytu | sprawdzenia wymagające bazy dostają `BLOCKED` |

Tabela 2. Czego potrzebuje uruchomienie i co się dzieje, gdy czegoś brakuje.

## Pytania przed uruchomieniem

| Pytanie | Odpowiedzi | Domyślnie |
|---|---|---|
| Które zestawy uruchomić | wszystkie albo część | — |
| Czy sprawdzenia mogą robić prawdziwe zmiany przez aplikację | `all`, `selected` albo `none` | `none`: tylko odczyty i próby, które aplikacja powinna odrzucić |
| Jakie zmiany w środowisku są dozwolone | na przykład uruchomienie usług, dodanie wierszy, migracja, restart z innymi ustawieniami, punkt wstrzyknięcia | żadne, dopóki na nie nie pozwolisz |
| Co możesz dostarczyć, żeby odblokować sprawdzenie | na przykład dane logowania, CLI na `PATH`, kontener, jednorazowy adres e-mail | — |

Tabela 3. Jedna runda pytań, którą `/tester:run` zadaje przed pierwszym sprawdzeniem.

## Werdykty

| Werdykt | Znaczy |
|---|---|
| `PASS` | zapisany wynik komendy zgadza się z oczekiwanym zachowaniem |
| `FAIL` | zapisany wynik komendy różni się od oczekiwanego zachowania |
| `BLOCKED` | brakuje warunku wstępnego, na przykład sesja wygasła, zmiana nie dostała zgody albo brakuje narzędzia |
| `ERROR` | samo sprawdzenie się zepsuło, obserwowana akcja nigdy się nie wykonała (`ERROR "stimulus not fired"`) albo nie dało się udowodnić, że wstrzyknięta awaria jest aktywna (`ERROR "fault not injected"`) |
| `SKIP` | sprawdzenie się nie wykonało, z podanym powodem |

Tabela 4. Werdykt pojedynczego sprawdzenia.

## Klasy błędów

Każdy `FAIL` dostaje jedną klasę:

| Klasa | Znaczy | Poprawiasz |
|---|---|---|
| błąd implementacji | sprawdzenie jest wierne, a aplikacja nie zachowuje się zgodnie z oczekiwaniem | kod |
| błąd testu | sprawdzenie źle odczytało zakres, na przykład trasę albo nieaktualne założenie | nic w aplikacji |
| błąd specu | sprawdzenie jest wierne, kod da się obronić, a spec jest niejednoznaczny albo sam sobie przeczy | spec |

Tabela 5. Jak tester klasyfikuje błąd. W razie wątpliwości wybiera błąd implementacji.

Anomalia znaleziona przy diagnozie innego błędu dostaje osobny wiersz `observation` oznaczony jako niezbadany.
Przyczyna błędu jest `PLAUSIBLE`, dopóki nie potwierdzi jej eksperyment; wtedy staje się `CONFIRMED`.

## Pliki, które zostawia uruchomienie

| Plik | Zawiera |
|---|---|
| `$TMPDIR/tester.XXXXXX/` | katalog tymczasowy uruchomienia; raport podaje jego ścieżkę |
| `BRIEF.md` | wszystko, czego potrzebują zestawy: bazowe URL-e, użytkownicy testowi, migawka stanu początkowego, wzorce, zależności, oczekiwane zachowanie, zasady bezpieczeństwa |
| `TEARDOWN.md` | rejestr zmian: każda zmiana w środowisku, jak ją cofnąć i czy została cofnięta |
| pliki sesji i zrzuty ekranu | sesje użytkowników testowych i zrzuty ekranu nieudanych sprawdzeń interfejsu |

Tabela 6. Wszystko, co zostawia uruchomienie, w całości w katalogu tymczasowym.

Nic nie trafia do twojego repozytorium poza punktem wstrzyknięcia, który zatwierdzisz, albo zmianą, którą postanowisz zostawić.
Jedno i drugie widać w rejestrze.
