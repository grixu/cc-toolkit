import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightLinksValidator from 'starlight-links-validator'
import mermaid from 'astro-mermaid'
import { satteri } from '@astrojs/markdown-satteri'
import captions from './src/lib/captions.mjs'

const o = (name) => `./src/components/overrides/${name}.astro`

export default defineConfig({
  site: 'https://cct.grixu.dev',
  markdown: {
    // Code colours come from the design tokens, so both themes share one highlighter pass.
    shikiConfig: { theme: 'css-variables' },
    processor: satteri({ hastPlugins: [captions()] }),
  },
  integrations: [
    // astro-mermaid must run before Starlight so it sees the mermaid code blocks first
    mermaid({ theme: 'base', autoTheme: false }),
    starlight({
      title: 'cc-toolkit',
      description: 'Claude Code plugins that take a change from an idea to a merged pull request.',
      favicon: '/favicon.svg',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        pl: { label: 'Polski', lang: 'pl' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/grixu/cc-toolkit' }],
      editLink: { baseUrl: 'https://github.com/grixu/cc-toolkit/edit/main/docs/' },
      expressiveCode: false,
      plugins: [starlightLinksValidator({ errorOnLocalLinks: false })],
      customCss: [
        '@fontsource/chakra-petch/latin-600.css',
        '@fontsource/chakra-petch/latin-ext-600.css',
        '@fontsource-variable/ibm-plex-sans/wght.css',
        '@fontsource-variable/ibm-plex-sans/wght-italic.css',
        '@fontsource/ibm-plex-mono/latin-400.css',
        '@fontsource/ibm-plex-mono/latin-ext-400.css',
        '../brand/tokens.css',
        './src/styles/site.css',
      ],
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '32x32' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://cct.grixu.dev/og.png' } },
      ],
      components: {
        Head: o('Head'),
        ThemeProvider: o('ThemeProvider'),
        SkipLink: o('SkipLink'),
        PageFrame: o('PageFrame'),
        Header: o('Header'),
        Sidebar: o('Sidebar'),
        TwoColumnContent: o('TwoColumnContent'),
        PageSidebar: o('PageSidebar'),
        PageTitle: o('PageTitle'),
        FallbackContentNotice: o('FallbackContentNotice'),
        Footer: o('Footer'),
      },
      // The frame builds its own per-section sidebar from page frontmatter; this list only feeds Starlight's internals.
      sidebar: [{ label: 'Docs', items: [{ autogenerate: { directory: '.' } }] }],
    }),
  ],
})
