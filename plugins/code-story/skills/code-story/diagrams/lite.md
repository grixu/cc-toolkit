# Built-in diagrams (fireworks-lite)

One dark style, drawn as inline SVG straight into the chapter. The page's CSS colours it through the `fx-*` classes, so a diagram carries **no colours, fonts or markers of its own**. It looks the same in the light and the dark page theme. Adapted from the Dark Terminal style and the layout rules of [fireworks-tech-graph](https://github.com/yizhiyanhua-ai/fireworks-tech-graph) (MIT).

## Pick the kind by the question

| The question | Kind | Skeleton |
|---|---|---|
| What reaches what: a call graph, a dependency graph, who holds a reference | flow | `templates/flow.svg` |
| Who calls whom, in order, across participants | sequence | `templates/sequence.svg` |
| What states a thing moves through | state | `templates/state.svg` |

Use a call tree or file tree as a `diff tree` block, not an SVG (see `craft.md`). Read the one skeleton you need, copy it, and edit it.

## Markup contract

```html
<figure class="svg">
  <div class="canvas"><svg viewBox="0 0 W H" role="img" aria-label="…">…</svg></div>
  <figcaption data-lang="en">What the picture shows that the code alone does not.</figcaption>
  <figcaption data-lang="pl">…</figcaption>
</figure>
```

- **First element:** `<rect class="fx-bg" width="W" height="H"/>`. Width 640–960, height whatever the content needs.
- **Nodes:** `<rect class="fx-node" x y width height rx="6"/>` with **absolute coordinates**: no `transform`, no `<g transform>`. `check.mjs` measures labels against these boxes.
- **Node modifiers:**
  - `add`: this change adds it
  - `del`: this change removes it
  - `ext`: a dependency or outside system
  - `key`: the one the chapter is about
- **Groups:** a dashed `<rect class="fx-group">` behind its nodes, with a `<text class="fx-group-label">` in its top-left corner.
- **Node text:** `<text class="fx-label" x="centre" y="…" text-anchor="middle">`, plus an optional `fx-sub` line 16px below.
- **Box size:** a box is at least 24px wider than its longest label. Count 7.9px per character for `fx-label` and 6.6px for `fx-sub`; the font is monospace, so that count is accurate.
- **Edges:** `<path class="fx-edge" d="M … L …"/>`.
  - Modifiers: `add`, `del`, `key`, `dash` (async or optional).
  - The arrowhead comes from the class; never add `marker-end` or colours yourself.
- **Edge labels:** `<text class="fx-edge-label">`, offset 6–10px from the line, never on it.
- **Chapter badges:** to tie an edge to a chapter, use a `<circle class="fx-badge" r="9"/>` with `<text class="fx-badge-text" text-anchor="middle">2</text>`.
- **Warnings** in a diagram: `fx-warn` text, sparingly.

## Two languages

Geometry is shared, and only the words switch. When a label differs between languages, write both as tspans:

```html
<text class="fx-label" x="180" y="64" text-anchor="middle"><tspan data-lang="en">cleanup hooks</tspan><tspan data-lang="pl">hooki sprzątające</tspan></text>
```

- A label that is a code name (`findUserRoles`, `UserFlag`, `POST /flags`) stays one plain text in every language: no tspans.
- Size the box for the **longer** variant.
- `check.mjs` needs every tagged label to have its twin.

## Layout rules

- Snap coordinates to an 8px grid.
- Gaps:
  - 80px or more between boxes
  - 120px between layers
  - 60px clearance for edge paths
- Route edges orthogonally (L-shaped `M x,y L x,y2 L x2,y2`):
  - connect to edge midpoints, never to corners;
  - stagger parallel edges by 16px;
  - an edge never crosses a box.
- Render order: background, groups, edges, nodes, node text, edge labels.
- One edge per real relationship. Five boxes that answer the question beat twelve that list the module.
- Every box and arrow must be something you can point at in the code or the change. A box nobody can find in the diff does not belong in the picture.

## A diagram skill instead

When the settings name a `diagram_skill`, call that skill instead of drawing by hand. Give it:

- the question;
- the nodes and edges, each with labels in every story language;
- the requirement: a **dark background**, SVG output, no external fonts or scripts;
- the output path `diagrams/<name>.<lang>.svg`, one per language, or `diagrams/<name>.svg` when every label is a code name.

In the chapter, write `<figure class="svg" data-src="diagrams/<name>.svg">` and the caption. `assemble.mjs` inlines the files and keeps their ids apart.

When the skill is missing or fails, draw the diagram with these rules and say so in the final report.
