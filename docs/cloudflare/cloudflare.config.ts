import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'cc-toolkit-docs',
    compatibilityDate: '2026-11-04',
    assets: { notFoundHandling: '404-page', htmlHandling: 'auto-trailing-slash' },
    domains: ['cct.grixu.dev'],
    workersDev: false,
  },
})
