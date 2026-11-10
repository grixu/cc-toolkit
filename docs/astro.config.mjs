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
      sidebar: [
        {
          label: 'Getting started',
          items: ['getting-started/introduction', 'getting-started/installation'],
        },
        {
          label: 'Plan & spec',
          items: ['plugins/fd3', 'plugins/codex-plan-improver', 'plugins/researcher'],
        },
        {
          label: 'Build & ship',
          items: [
            {
              label: 'dev-kit',
              items: [
                { label: 'Overview', slug: 'plugins/dev-kit' },
                {
                  label: 'Risk assessment',
                  collapsed: true,
                  items: [
                    { label: 'Overview', slug: 'plugins/dev-kit/risk-assessment' },
                    'plugins/dev-kit/risk-assessment/how-it-works',
                    'plugins/dev-kit/risk-assessment/reliability',
                    'plugins/dev-kit/risk-assessment/reference',
                  ],
                },
              ],
            },
            'plugins/tester',
            'plugins/pr-proof',
          ],
        },
        { label: 'Review', items: ['plugins/code-review'] },
        { label: 'Agent hygiene', items: ['plugins/hookify', 'plugins/session-learner'] },
        { label: 'Media & naming', items: ['plugins/scribe', 'plugins/namesmith'] },
        { label: 'Deprecated', collapsed: true, items: ['plugins/feature-delivery'] },
      ],
    }),
  ],
})
