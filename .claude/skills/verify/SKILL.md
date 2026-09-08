---
name: verify
description: Validate plugin structure, marketplace.json consistency, and changelog format across all plugins
---

Run the mechanical check below first, then judge only what it cannot.

## 1. Run the checker

Everything that can be decided by comparing strings is decided by this script, not by
reading eleven `plugin.json` files by hand. Paste and run it from the repo root:

```bash
python3 - <<'PY'
import json, pathlib, re, sys
root = pathlib.Path('.')
mk = json.loads((root/'.claude-plugin/marketplace.json').read_text())
entries = {p['name']: p for p in mk['plugins']}
dirs = sorted(d for d in (root/'plugins').iterdir() if d.is_dir())
fail = []
authors = {}
for d in dirs:
    n = d.name
    for req in ('.claude-plugin/plugin.json', 'CHANGELOG.md', 'README.md'):
        if not (d/req).exists(): fail.append(f'{n}: missing {req}')
    if (d/'CLAUDE.md').exists():
        fail.append(f'{n}: plugin-root CLAUDE.md ships with the plugin and is never loaded'
                    f' — move it to .claude/rules/{n}.md')
    pj = d/'.claude-plugin/plugin.json'
    if not pj.exists(): continue
    p = json.loads(pj.read_text())
    for k in ('name','version','description','author','repository','keywords'):
        if not p.get(k): fail.append(f'{n}: plugin.json missing {k}')
    if p.get('name') != n: fail.append(f'{n}: plugin.json name is {p.get("name")!r}')
    if not re.fullmatch(r'\d+\.\d+\.\d+', str(p.get('version',''))):
        fail.append(f'{n}: version {p.get("version")!r} is not semver')
    authors[f'{n}/plugin.json'] = json.dumps(p.get('author'), sort_keys=True)
    e = entries.get(n)
    if e is None:
        fail.append(f'{n}: not registered in marketplace.json'); continue
    if e.get('source') != f'./plugins/{n}': fail.append(f'{n}: marketplace source is {e.get("source")!r}')
    if not e.get('description'): fail.append(f'{n}: marketplace description is empty')
    authors[f'{n}/marketplace'] = json.dumps(e.get('author'), sort_keys=True)
    cl = (d/'CHANGELOG.md')
    if cl.exists() and '## [Unreleased]' not in cl.read_text():
        fail.append(f'{n}: CHANGELOG.md has no ## [Unreleased] section (release.sh needs it)')
for name in entries:
    if not (root/'plugins'/name).is_dir(): fail.append(f'marketplace entry {name} points at no plugin')
distinct = sorted(set(authors.values()))
if len(distinct) > 1:
    fail.append('author drift — every plugin.json and marketplace entry must carry byte-identical author:')
    for spelling in distinct:
        who = sorted(k for k, v in authors.items() if v == spelling)
        fail.append(f'    {spelling}  <- {", ".join(who)}')
print('\n'.join(fail) if fail else 'OK — all plugins consistent')
sys.exit(1 if fail else 0)
PY
```

Then run `claude plugin validate --strict` and report anything it adds.

## 2. Do not re-check versions

`version` parity between `plugin.json` and `marketplace.json` is written by
`scripts/release.sh` on every release and has never drifted. Confirming it by hand each
run costs ten file reads and finds nothing. The script above checks only that a version
is semver; parity is the release script's invariant, not this skill's.

## 3. Judge what the script cannot

Read the failures the script printed and, for each, say what needs to change. The two
that need a human call:

- **Author drift.** The script reports every distinct spelling and who carries it. Pick
  the canonical one (whatever the majority of plugins already use) and rewrite the
  outliers in both `plugin.json` and the marketplace entry. Also fix the template in
  `.claude/skills/new-plugin/SKILL.md` if it still emits the wrong spelling, otherwise
  the next scaffolded plugin re-introduces the drift.
- **Changelog shape.** Beyond the required `## [Unreleased]` section, skim for Keep a
  Changelog format and semver-shaped version headings.

## 4. Summary

Print pass/fail per check. If the script exits 0 and `claude plugin validate --strict`
is clean, say so in one line. Otherwise list exactly what needs to be fixed, most
blocking first.
