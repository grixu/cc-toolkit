export type Lang = 'en' | 'pl'

/** Site path without locale ("plugins/fd3/") → URL for a language. */
export const href = (path: string, lang: Lang) => {
  if (/^(https?:|#|mailto:)/.test(path)) return path
  const p = path.replace(/^\/+/, '')
  return `/${lang === 'pl' ? 'pl/' : ''}${p}`
}

/** URL pathname → site path without locale, ending in a slash. */
export const canonicalPath = (pathname: string) => {
  const p = pathname.replace(/^\/pl(?=\/|$)/, '').replace(/^\/+/, '')
  return p === '' || p.endsWith('/') ? p : `${p}/`
}

export const langOf = (pathname: string): Lang => (/^\/pl(\/|$)/.test(pathname) ? 'pl' : 'en')

export const fmtDate = (d: string, lang: Lang, style: 'long' | 'short' = 'long') =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-US', {
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  })

export const ui = {
  en: {
    skip: 'Skip to content', search: 'Search', searchDocs: 'Search docs', menu: 'Open menu', close: 'Close menu', menuLabel: 'Menu',
    home: 'cc-toolkit home', github: 'cc-toolkit on GitHub', breadcrumb: 'Breadcrumb', main: 'Main',
    onPage: 'On this page', prev: 'Previous', next: 'Next', pages: 'Pages', plugins: 'Plugins', allPlugins: 'All plugins',
    copy: 'Copy', copied: 'Copied', selectCopy: 'Select and copy', installCmd: 'Install command', command: 'Command', figure: 'Figure', table: 'Table',
    other: 'Polski', otherShort: 'PL', switchLang: 'Czytaj po polsku',
    untranslated: 'This page isn’t translated yet', untranslatedP: 'You’re reading the original version.',
    updated: 'Updated', firstTime: 'First time?', addMarketplace: 'Add the marketplace', thenInstall: 'once, then install any plugin.',
    results: 'Results', noResults: 'No results for', browsePlugins: 'Browse all plugins', keys: '↑↓ move · ↵ open · esc close',
    searchPh: 'ci is red on my pull request', searchDev: 'Full-text search works in the built site.',
    docs: 'Docs', install: 'Install', changelog: 'Changelog', lifecycle: 'Lifecycle', contributing: 'Contributing',
    blog: 'Blog', contact: 'Contact',
    legal: '© 2026 grixu.dev · cc-toolkit is MIT-licensed · Not affiliated with Anthropic',
    supporting: 'supporting', supportingPlugins: 'supporting plugins',
    figureMap: 'The lifecycle. Each coloured line is a core plugin; grey stations belong to supporting plugins',
    mapLabel: 'The development lifecycle, with each plugin placed where it works',
    outside: 'outside the cycle, whenever it’s needed', merged: 'merged · next change', calledBy: 'called by',
    pluginsOnMap: 'Plugins on the map', whereRuns: 'Where this runs in the lifecycle',
    youGive: 'You give it', handsOver: 'Hands over to', optional: 'optional',
    groups: { start: 'Start here', guides: 'Guides', concepts: 'Concepts', reference: 'Reference' },
  },
  pl: {
    skip: 'Przejdź do treści', search: 'Szukaj', searchDocs: 'Szukaj w dokumentacji', menu: 'Otwórz menu', close: 'Zamknij menu', menuLabel: 'Menu',
    home: 'cc-toolkit, strona główna', github: 'cc-toolkit na GitHubie', breadcrumb: 'Okruszki', main: 'Główna',
    onPage: 'Na tej stronie', prev: 'Poprzednia', next: 'Następna', pages: 'Strony', plugins: 'Pluginy', allPlugins: 'Wszystkie pluginy',
    copy: 'Kopiuj', copied: 'Skopiowano', selectCopy: 'Zaznacz i skopiuj', installCmd: 'Komenda instalacji', command: 'Komenda', figure: 'Rysunek', table: 'Tabela',
    other: 'English', otherShort: 'EN', switchLang: 'Read in English',
    untranslated: 'Ta strona nie ma jeszcze tłumaczenia', untranslatedP: 'Czytasz wersję oryginalną.',
    updated: 'Aktualizacja', firstTime: 'Pierwszy raz?', addMarketplace: 'Dodaj marketplace', thenInstall: 'raz, potem instaluj dowolny plugin.',
    results: 'Wyniki', noResults: 'Brak wyników dla', browsePlugins: 'Przeglądaj wszystkie pluginy', keys: '↑↓ wybór · ↵ otwórz · esc zamknij',
    searchPh: 'CI jest czerwone na moim PR', searchDev: 'Wyszukiwanie pełnotekstowe działa w zbudowanej stronie.',
    docs: 'Dokumentacja', install: 'Instalacja', changelog: 'Zmiany', lifecycle: 'Cykl pracy', contributing: 'Współtworzenie',
    blog: 'Blog', contact: 'Kontakt',
    legal: '© 2026 grixu.dev · cc-toolkit na licencji MIT · Niezwiązany z Anthropic',
    supporting: 'pomocniczy', supportingPlugins: 'pluginy pomocnicze',
    figureMap: 'Cykl pracy. Każda kolorowa linia to główny plugin; szare stacje należą do pluginów pomocniczych',
    mapLabel: 'Cykl wytwarzania oprogramowania z każdym pluginem w miejscu, w którym działa',
    outside: 'poza cyklem, kiedy jest potrzebne', merged: 'zmergowane · następna zmiana', calledBy: 'wołany przez',
    pluginsOnMap: 'Pluginy na mapie', whereRuns: 'Gdzie to działa w cyklu',
    youGive: 'Dajesz mu', handsOver: 'Przekazuje do', optional: 'opcjonalnie',
    groups: { start: 'Na początek', guides: 'Przewodniki', concepts: 'Koncepcje', reference: 'Dokumentacja techniczna' },
  },
} as const
