# cc-toolkit design system

A quiet, green-tinted neutral system with two colours. Bottle green is `--primary`, taken from the logo's front plate: it marks what you can act on. Clay is `--secondary`: it marks editorial emphasis such as quotes and the second highlight in a diagram, and is never text. Everything else is neutral, so the two colours stay rare enough to mean something. The site has a light and a dark theme, derived from one set of tokens.

The tokens live in `brand/tokens.css`. The logo, its files and its rules are in `docs/brand/logo.md`. There are no shared components yet. When the first ones are built, document each one here: when to use it versus the alternative, its variants with the default marked, and one correct and one incorrect example.

## Tokens

Use only the semantic tokens from `brand/tokens.css`. Never write a raw `oklch()`, hex or `rgb()` value in a component, and never add a token there that this file does not describe. A colour you need that is missing is a gap to raise, not a value to invent.

Each colour token is a `light-dark()` pair, so a component never branches on the theme. The theme follows the system setting; `data-theme="light"` or `"dark"` on `<html>` overrides it.

| Token | Role |
| --- | --- |
| `--canvas` | Page background |
| `--panel` | Cards, sidebars, callouts |
| `--tray` | Inset areas inside a panel, table header rows |
| `--border` | 1 px hairlines: panel rings, table rules, dividers |
| `--heading` | h1–h4 and the display headline |
| `--text` | Body text, list items, table cells |
| `--muted` | Secondary text: metadata, nav items, hints, breadcrumbs |
| `--caption` | Captions under figures, diagrams, tables and code blocks |
| `--quote` | Blockquote text |
| `--quote-rule` | The blockquote's left rule (alias of `--secondary`) |
| `--primary` | Links, the current nav item, the primary button fill, active tab underline |
| `--on-primary` | Text and icons on a `--primary` fill |
| `--secondary` | Quote rules, the second highlight in a diagram, step markers |
| `--focus` | Keyboard focus ring (alias of `--primary`) |
| `--selection` | `::selection` background; selected text stays `--text` |
| `--code-bg`, `--code-text`, `--code-muted` | Code blocks and inline code; `--code-muted` for comments and command output |
| `--diagram-line` | Strokes and connectors in diagrams and illustrations |

## Which background

```
Is it code or terminal output?
 ├── Yes → --code-bg
 └── No
      ├── Is it the page itself?               → --canvas
      ├── Is it a card, sidebar or callout?    → --panel
      └── Is it an inset area inside a panel?  → --tray
```

Never nest deeper than canvas → panel → tray. A fourth level has no step left and blurs into the tray.

## Which text colour

```
Is it a heading (h1–h4, display)?           → --heading
Is it inside a blockquote?                  → --quote
Is it a caption under a figure, diagram,
table or code block?                        → --caption
Is it secondary: metadata, nav, hint?       → --muted
Is it a link or the current nav item?       → --primary
Is it on a --primary fill?                  → --on-primary
Default                                     → --text
```

`--secondary` is never a text colour. On the light theme it is 4.4:1 on canvas, below the 4.5:1 that small text needs, and clay text reads as a warning that does not exist.

## Colour rules

- **`--primary` marks what you can act on**, plus the one exception below for figures. A green heading or a green decoration teaches readers that green is not clickable, and links stop standing out.
- **One `--primary` fill per view**: the single primary button. Two green buttons mean the page has no main action.
- **Never fill an area larger than a button with `--primary` or `--secondary`.** Large green or clay surfaces turn the brand into a theme colour and drown out links.
- **Links:** `--primary`, underlined, `text-decoration-thickness: from-font`, `text-underline-offset: 0.2em`; on hover the underline is 2 px. Never remove the underline in body text: colour alone fails readers who cannot tell green from grey.
- **Focus:** `outline: 2px solid var(--focus); outline-offset: 2px` on every interactive element.
- **Blockquote:** `--quote` text on the current background, a 3 px `--quote-rule` on the inline start, `--space-4` padding on that side, no background and no italics. Italics are for emphasis inside text, and a whole italic paragraph is harder to read.
- **Figures and diagrams:** shapes are filled with `--panel`, stroked with `--diagram-line` at 1.5 px and rounded with `--radius-inset`; connectors are 1.5 px `--diagram-line` lines ending in a filled `--diagram-line` arrowhead; text inside is 14 px (Small) in `--text`. Highlight at most one element with a 2 px `--primary` stroke (the element the figure is about) and one with a 2 px `--secondary` stroke or a `--secondary` step marker. Highlights are strokes, never fills.
- **Captions** under figures, diagrams, code blocks and tables sit `--space-2` below the block, Caption style in `--caption`, starting with a capital and ending without a full stop when it is not a sentence. Number them by kind: "Figure 1.", "Listing 1.", "Table 1.".
- **Blockquote attribution:** a `<footer>` inside the blockquote, Small in `--muted`, `--space-2` above.
- **Tables:** the header row is Label style in `--muted` on `--tray`; cells are Small in `--text`; rows are separated by a 1 px `--border` rule and nothing else (no zebra stripes, no vertical rules); cell padding `--space-2` vertical and `--space-3` horizontal. Text aligns to the start; columns of numbers align to the end and use `tabular-nums`.
- **Navigation:** items are Small in `--muted`, hover `--text`, current item `--primary` with `aria-current="page"`. No underline in navigation.
- **Metadata next to a heading** (a date, a version, an author) never goes inside the heading element: put it on its own line directly below, Small in `--muted`, `--space-1` below the heading.

Checked contrast (WCAG 2.1 / APCA Lc), light theme then dark:

| Pair | Light | Dark |
| --- | --- | --- |
| `--heading` on `--canvas` | 16.6:1 / 99 | 17.0:1 / −99 |
| `--text` on `--canvas` | 12.9:1 / 95 | 12.9:1 / −80 |
| `--text` on `--tray` | 11.6:1 / 88 | 10.9:1 / −79 |
| `--muted` / `--caption` on `--canvas` | 6.2:1 / 78 | 8.9:1 / −60 |
| `--muted` on `--tray` | 5.6:1 / 71 | 7.6:1 / −58 |
| `--quote` on `--canvas` | 9.5:1 / 88 | 11.3:1 / −73 |
| `--primary` on `--canvas` | 6.0:1 / 76 | 9.3:1 / −62 |
| `--primary` on `--tray` | 5.4:1 / 69 | 7.9:1 / −61 |
| `--on-primary` on `--primary` | 6.3:1 / −85 | 9.3:1 / 64 |
| `--secondary` on `--canvas` (non-text) | 4.4:1 | 7.5:1 |
| `--diagram-line` on `--canvas` (non-text) | 3.3:1 | 4.9:1 |
| `--code-text` on `--code-bg` | 11.8:1 / 89 | 13.5:1 / −81 |
| `--code-muted` on `--code-bg` | 5.7:1 / 72 | 8.7:1 / −57 |

All values are inside sRGB. Re-check this table when you change a token.

## Typography

Three faces and nothing else. Chakra Petch is the brand voice, the same face as the wordmark; IBM Plex Sans is for reading; IBM Plex Mono is for code.

| Role | Element | Face | Size token | Leading | Tracking |
| --- | --- | --- | --- | --- | --- |
| Display | landing headline | Chakra Petch 600 | `--text-display` (40–56 px) | `--leading-display` 1.05 | −0.02em |
| H1 | page title | Chakra Petch 600 | `--text-h1` 36 px | `--leading-heading` 1.15 | −0.015em |
| H2 | section | Chakra Petch 600 | `--text-h2` 28 px | `--leading-heading` 1.15 | −0.01em |
| H3 | subsection | Plex Sans 600 | `--text-h3` 20 px | `--leading-subheading` 1.3 | 0 |
| H4 | minor heading | Plex Sans 600 | `--text-h4` 16 px | `--leading-subheading` 1.3 | 0 |
| Lead | page intro | Plex Sans 400, `--muted` | `--text-lead` 18 px | `--leading-body` 1.6 | 0 |
| Body | paragraphs, lists | Plex Sans 400 | `--text-body` 16 px | `--leading-body` 1.6 | 0 |
| Small | table cells, nav, diagram text | Plex Sans 400 | `--text-small` 14 px | `--leading-small` 1.5 | 0 |
| Caption | figure, table, code captions | Plex Sans 400, `--caption` | `--text-caption` 13 px | `--leading-small` 1.5 | 0 |
| Label | kickers, table headers, tags | Chakra Petch 600, uppercase, `--muted` | `--text-label` 12 px | 1.3 | +0.08em |
| Code | blocks | Plex Mono 400 | `--text-code` 14 px | `--leading-code` 1.6 | 0 |
| Inline code | inside text | Plex Mono 400 | 0.875em | inherit | 0 |

Chakra Petch stops at H2 because its squared counters close up below 20 px and slow reading. A small uppercase kicker above a heading is a Label, never a smaller heading.

- **Never go below 12 px.** Body text is 16 px; inputs are 16 px on phones, because iOS Safari zooms into any smaller field.
- **Use only the size tokens.** A size outside the table is a gap to raise.
- **Measure:** Lead, body text, lists, blockquotes and callouts are at most `--measure` (65ch). Tables, code blocks and figures may be wider. Lists indent `1.25em`.
- **Wrapping:** headings and Display use `text-wrap: balance`; Lead, captions and card descriptions use `text-wrap: pretty`; body text uses neither.
- **Weights:** Chakra Petch 600 only; Plex Sans 400 and 600, plus 400 italic for emphasis; Plex Mono 400. Bold inside body text is Plex Sans 600, never 700.
- **Numbers** in tables, versions and counters use `font-variant-numeric: tabular-nums`.
- **Casing** stays in the source text; uppercase Labels come from `text-transform: uppercase`.
- Set `font-synthesis: none` and `-webkit-font-smoothing: antialiased` once on `:root`, so a missing weight shows as an obvious error instead of a faked bold.

**Loading:** self-host with Fontsource: `@fontsource/chakra-petch` (600), `@fontsource-variable/ibm-plex-sans` (400–600, normal and italic), `@fontsource/ibm-plex-mono` (400), subsets `latin` and `latin-ext` (Polish needs the second), woff2 only. Never link Google Fonts: the embed sends every visitor's IP to Google, which GDPR does not allow without consent.

## Spacing and rhythm

Use only the `--space-*` steps: 4, 8, 12, 16, 24, 32, 48, 64 and 96 px.

| Between | Space |
| --- | --- |
| Paragraphs, and a paragraph and a list | `--space-4` (16 px) |
| List items | `--space-2` (8 px) |
| Above an H2 / below it | `--space-7` (48 px) / `--space-4` (16 px) |
| Above an H3 or H4 / below it | `--space-6` (32 px) / `--space-2` (8 px) |
| A Label kicker and its heading | `--space-2` (8 px) |
| Above and below a figure, code block, table or blockquote | `--space-6` (32 px) |
| A figure, code block or table and its caption | `--space-2` (8 px) |
| Page sections on the landing page | `--space-9` (96 px), or `--space-8` below 600 px viewport width |

Top margins collapse into the previous block's bottom: the larger one wins, never the sum. A heading always sits closer to the text it introduces than to the text above it.

## Surfaces

- Panels use `--radius-panel` (8 px) and a 1 px `--border` ring (`box-shadow: 0 0 0 1px var(--border)`), with no drop shadow. A nested radius equals the outer one minus the inset: `--radius-inset` (4 px) for a tray 4 px inside a panel, and for code blocks.
- Code blocks: `--code-bg`, `--radius-inset`, `--space-4` padding, a 1 px `--border` ring; text `--code-text`, comments and output `--code-muted`. Inline code: `--code-bg`, `--radius-inset`, `0.1em 0.35em` padding.
- Content column: `--measure` for text; page max-width 1200 px; side padding `--space-5`, or `--space-4` below 600 px.
- Header logo: copy `brand/logo/svg/lockup-on-light.svg` and `lockup-on-dark.svg` into the site's public assets and show them as two `<img alt="cc-toolkit">`, 28 px tall, one hidden per theme with the same `prefers-color-scheme` and `data-theme` selectors that drive the tokens. A `<picture>` cannot follow `data-theme`. Besides the logo, the header holds no colour except the current nav item and the focus ring; a call-to-action button never goes in the header.

## Not defined yet

These have no rules yet. Do not invent a style for them: raise each one as a gap, and add its rules here (when to use it versus the alternative, variants with the default marked, states, one correct and one incorrect example) before building it.

- Buttons beyond the primary fill colour: the secondary variant, sizes, radius, padding, hover, active and disabled states.
- Form inputs, apart from the 16 px text size on phones.
- Callouts (note, tip, warning) and their titles.
- The site header's height and layout, and the footer.
- Hover and pressed states for anything other than links and navigation.
- Status colours: error, warning, success.
