---
title: Dokumentacja
description: Komenda, ustawienia briefu, wymagania, uprawnienia, pliki raportu i kody błędów researchera.
group: reference
sidebar:
  order: 3
---

## Komenda

```
/researcher:research "<pytanie badawcze>"
```

Skill działa tylko wtedy, gdy wpiszesz komendę; model nigdy nie uruchamia go sam.
Bez pytania skill zapyta, co chcesz zbadać.

## Ustawienia briefu

Skill wyciąga każde ustawienie z twojego pytania i kontekstu.
O te, których nie da się wywnioskować, pyta jednym zbiorczym pytaniem.

| Ustawienie | Opcje | Efekt |
|---|---|---|
| Depth | Quick, Standard (domyślnie), Deep | Do 1, 2 lub 3 rund badań. Pierwsza runda to 3, 5 lub 6 równoległych wyszukiwań. Deep dodaje Verifiera, który próbuje obalić ustalenia. |
| Recency | Recent (około 2 lat), Any (domyślnie), Latest | Jakie źródła wyszukiwania stawiają wyżej. Any obejmuje też materiały podstawowe. |
| Sources | Broad (domyślnie), Authoritative, Technical-academic | Jakie rodzaje źródeł się liczą. Authoritative pomija fora i blogi; Technical-academic ogranicza się do dokumentacji, standardów i publikacji. |
| Audience | Lay, Informed (domyślnie), Practitioner, Expert | Jak Editor pisze raport: żargon, gęstość i liczba wizualizacji. Nic poza tym się nie zmienia. |

Tabela 1. Ustawienia briefu i ich wartości domyślne.

Kolejna runda rusza tylko wtedy, gdy poprzednia zostawiła luki.
Przy temacie, który szybko się zmienia, skill może wybrać Recent albo Latest zamiast Any.

O **język** skill nigdy nie pyta.
Raport powstaje w języku pytania, chyba że pytanie mówi inaczej („…in English”, „…po polsku”).

## Wymagania

- **Dynamic workflows.** Claude Code oferuje je we wszystkich płatnych planach, z dostępem przez Anthropic API oraz na Amazon Bedrock, Google Cloud Agent Platform i Microsoft Foundry. W planie Pro włącz je raz w wierszu Dynamic workflows w `/config`.
- **Serwer MCP firecrawl.** Gdy firecrawl zawiedzie albo nie przeczyta strony, agenci przechodzą na WebSearch.
- **Opcjonalnie: Mermaid CLI** do diagramów: `pnpm add -g @mermaid-js/mermaid-cli`. Skill sprawdza, czy jest globalny `mmdc`, i nigdy go nie instaluje. Bez niego raport pokazuje te dane jako tabele albo wykresy.

Wykresy (Chart.js 4.5.0) i arkusz stylów są dołączone do pluginu.

## Uprawnienia

Badanie działa jako workflow w tle z wieloma agentami.
Stosują oni twoje reguły uprawnień, a agent, który trafi na prośbę o zgodę, wstrzymuje przebieg, dopóki nie odpowiesz.
Zanim zaczniesz, zezwól na narzędzia wyszukiwania:

```json
{
  "permissions": {
    "allow": [
      "mcp__firecrawl__firecrawl_search",
      "mcp__firecrawl__firecrawl_scrape",
      "WebSearch"
    ]
  }
}
```

Te reguły zakładają, że twój serwer firecrawl nazywa się `firecrawl`.
Jeśli ma inną nazwę, zmień prefiks `mcp__firecrawl__`.

Agenci uruchamiają też komendy powłoki (`mkdir`, `rm`, `cp`, `sed`, `date`, `curl` do obrazów ze źródeł i `mmdc`) i zapisują pliki w `./research/`.
Jeśli twój tryb uprawnień pyta o nie, również na nie zezwól.
Claude Code pyta też o zgodę na samo uruchomienie workflow; jak często, zależy od trybu uprawnień.

## Katalog raportu

Każdy raport ma własny katalog w bieżącym katalogu.
Jego nazwa to pytanie małymi literami, ze słowami połączonymi `-`.
Gdy inne pytanie daje tę samą nazwę, nowy raport trafia do `<slug>-2`, potem `<slug>-3`.

```
research/<slug>/
  output.html     raport; otwórz ten plik
  answer.md       ta sama odpowiedź w Markdownie
  state.json      brief i lista źródeł; służy do rozbudowy raportu
  findings/       wyciągnięte ustalenia z dowodami, jako pliki JSON
  assets/         report.css, Chart.js, gdy raport ma wykresy, pobrane obrazy ze źródeł
  diagrams/       źródła Mermaid i skompilowane SVG
  snapshots/      wcześniejsze wersje, jako output.<UTC timestamp>.html
```

`answer.md` to tylko eksport.
Dalsze pytanie odbudowuje odpowiedź z `findings/`, nigdy z wcześniejszego tekstu.

## Podsumowanie przebiegu

Po udanym przebiegu skill wypisuje:

- tytuł raportu, jego sekcje oraz liczbę źródeł i rund
- ścieżkę do `output.html` z propozycją otwarcia
- ostrzeżenia, na przykład o obrazie ze źródła, którego nie udało się pobrać, o stronie, która zablokowała pobieranie, albo o diagramach pominiętych z braku `mmdc`
- do czterech dalszych pytań do wyboru, jeśli przebieg jakieś zaproponował

## Kody błędów

Gdy przebieg się nie uda, skill pokazuje błąd i jego komunikat, a potem kończy bez ponawiania.

| Błąd | Znaczenie | Co zrobić |
|---|---|---|
| `no-findings` | Żadne wyszukiwanie nie dało użytecznych wyników. | Sprawdź, czy firecrawl działa i ma zgodę, potem poszerz pytanie. |
| `schema-mismatch` | Istniejący raport powstał w niezgodnej wersji pluginu. | Zacznij nowy raport. |
| `persist-failed` | Zapis ustaleń się nie udał; raport HTML się nie zmienił. | Uruchom komendę ponownie. |
| `compose-failed` | Ustalenia są zapisane, ale HTML nie został wyrenderowany. | Uruchom komendę ponownie, żeby go wyrenderować. |
| `synthesis-failed` | Nie powstała żadna odpowiedź. | Uruchom komendę ponownie. |
| `no-goal` | Do workflow nie dotarło żadne pytanie. | Uruchom komendę z pytaniem. |

Tabela 2. Kody błędów workflow.

Niektórych stron, na przykład reddit.com, nie da się pobrać.
Agenci korzystają wtedy z fragmentów z wyników wyszukiwania, a skill wypisuje pominięte źródła jako ostrzeżenia.
