import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import mermaid from 'astro-mermaid'

export default defineConfig({
  site: 'https://cct.grixu.dev',
  integrations: [
    // astro-mermaid must run before Starlight so it sees the mermaid code blocks first
    mermaid(),
    starlight({
      title: 'cc-toolkit',
      description: 'Claude Code plugins for planning, building, reviewing and shipping code.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/grixu/cc-toolkit' }],
      editLink: { baseUrl: 'https://github.com/grixu/cc-toolkit/edit/main/docs/' },
      sidebar: [],
    }),
  ],
})
