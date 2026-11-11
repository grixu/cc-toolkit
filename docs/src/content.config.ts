import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        /** Sidebar group inside a section; a section's index defaults to start, other pages to guides. */
        group: z.enum(['start', 'cycle', 'guides', 'concepts', 'reference', 'outside']).optional(),
        /** A lifecycle skill id: the page header shows that skill's stage. */
        skill: z.string().optional(),
        /** The landing page: the frame draws no title block. */
        landing: z.boolean().optional(),
      }),
    }),
  }),
}
