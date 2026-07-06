# Schema migration steps

Forward-only migration modules for fd workspace artifacts, applied by
`../migrate.mjs` (contract: `IMPLEMENTATION.md` §3).

Every artifact (`feature.lock.json`, `state.json`, `sc-map.json`, `ac-map.json`,
`sources-map.json`) carries an integer `schema`. When a workspace is older than the
plugin, `migrate.mjs` walks a chain of single-version steps to bring each artifact up to
the current version. This directory holds those steps.

**Today it ships empty** — schema `1` is current for every artifact, so no step exists
yet. Add a module here only when an artifact's shape changes and its version is bumped.

## Module convention

One module per single-version bump of one artifact. Filename:

```
<artifact>-<from>-to-<to>.mjs
```

where `<artifact>` is the artifact name (the schema-file prefix: `feature-lock`,
`state`, `sc-map`, `ac-map`, `sources-map`), `<from>` is the version it upgrades from and
`<to>` is `<from> + 1`. Examples: `state-1-to-2.mjs`, `feature-lock-2-to-3.mjs`.

Each module exports:

```js
export const artifact = 'state'; // must equal the filename prefix
export const from = 1;           // must equal the filename <from>
export const to = 2;             // must equal <from> + 1

// Pure: given the parsed artifact at version `from`, return the parsed artifact at
// version `to`. Must set the new `schema` value. No I/O, no mutation of the input.
export function migrate(value) {
  return { ...value, schema: to /* + shape changes */ };
}
```

## How the chain runs

- The effective target version of an artifact is the highest `to` reachable from its
  step modules (baseline `1` when none exist).
- To migrate an artifact from `s` to the target, every consecutive step
  `s→s+1, …, target-1→target` must be present. A gap aborts the whole run with a
  `missing-migration-step` error naming it — nothing is written.
- Before overwriting a file, `migrate.mjs` copies it to `<file>.bak-schema<N>` (N = the
  original version).
- A migrated result is schema-validated only when it lands on the plugin's current
  version (the shipped `schemas/<artifact>.schema.json` declaring that version).
- A workspace artifact **newer** than the plugin is never touched: it is reported as
  `blocked` (`workspace-newer`) and the run exits non-zero.

Steps must be pure and deterministic — `migrate.mjs` runs the full chain in a planning
phase before any write so that a broken step fails cleanly with no partial changes.
