---
paths:
  - "docs/**"
  - "brand/**"
---
# Docs site

- `docs/DESIGN.md` is the source of truth for the look: tokens from `brand/tokens.css`, two colours, the components and their rules. Read the part you need before changing a page's markup or styles.
- Every page under `docs/src/content/docs/` has a Polish twin under `pl/`. Change both in the same commit.
- Run `/anti-slop:anti-slop` on new or rewritten prose before committing it.
- `pnpm -C docs build` checks every link and anchor (`starlight-links-validator` in `docs/astro.config.mjs`); do not write a separate link checker.
- When a change in `plugins/` alters what a plugin does, update its page under `docs/src/content/docs/plugins/` in the same PR.
