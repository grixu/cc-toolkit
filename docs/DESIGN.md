# cc-toolkit design system

A quiet, green-tinted neutral system with two colours. Bottle green is `--primary`, taken from the logo's front plate: it marks what you can act on. Clay is `--secondary`: it marks editorial emphasis such as quotes and the second highlight in a diagram, and is never text. Everything else is neutral, so the two colours stay rare enough to mean something. The site has a light and a dark theme, derived from one set of tokens.

The tokens live in `brand/tokens.css`. The logo, its files and its rules are in `docs/brand/logo.md`. Components are documented under Components below: when to use each one versus the alternative, its variants with the default marked, and one correct and one incorrect example.

## Tokens

Use only the semantic tokens from `brand/tokens.css`. Never write a raw `oklch()`, hex or `rgb()` value in a component, and never add a token there that this file does not describe. A colour you need that is missing is a gap to raise, not a value to invent.

Each colour token is a `light-dark()` pair, so a component never branches on the theme. A token that shares another's value is an alias (`var(--muted)`), never a copied pair, so the two cannot drift apart by accident; give it its own pair only when the roles really need different colours. The theme follows the system setting; `data-theme="light"` or `"dark"` on `<html>` overrides it.

| Token | Role |
| --- | --- |
| `--canvas` | Page background |
| `--panel` | Cards, sidebars, callouts |
| `--tray` | Inset areas inside a panel, table header rows |
| `--border` | 1 px hairlines: panel rings, table rules, dividers |
| `--heading` | h1–h4 and the display headline |
| `--text` | Body text, list items, table cells |
| `--muted` | Secondary text: metadata, nav items, hints, breadcrumbs |
| `--caption` | Captions under figures, diagrams, tables and code blocks (alias of `--muted`) |
| `--quote` | Blockquote text |
| `--quote-rule` | The blockquote's left rule (alias of `--secondary`) |
| `--primary` | Links, the current nav item, the primary button fill, active tab underline |
| `--primary-hover` | Hover fill of the primary button |
| `--tray-pressed` | Pressed fill of anything whose hover is `--tray` |
| `--on-primary` | Text and icons on a `--primary` fill |
| `--secondary` | Quote rules, the second highlight in a diagram, step markers |
| `--focus` | Keyboard focus ring (alias of `--primary`) |
| `--selection` | `::selection` background; selected text stays `--text` |
| `--code-bg`, `--code-text`, `--code-muted` | Code blocks and inline code; `--code-muted` for comments and command output; `--code-text` is an alias of `--text` |
| `--diagram-line` | Strokes and connectors in diagrams and illustrations |
| `--line-fd3`, `--line-code-review`, `--line-tester`, `--line-pr-proof`, `--line-dev-kit` | Diagram palette: the line colour of each core plugin, on the lifecycle map and wherever a plugin is marked (swatch, card rule, skill-flow connector) |
| `--info`, `--success`, `--warning`, `--danger` | Status tones: callout markers and titles, status words in command output |
| `--scrim` | Backdrop behind a dialog |
| `--shadow-overlay` | Ring and shadow of a dialog; the only drop shadow in the system |
| `--info-bg` … `--danger-bg` | Tinted fill for a status tone; only badges use it |

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
Is it the current nav item?                 → --heading (underline --primary)
Is it secondary: metadata, nav, hint?       → --muted
Is it a link?                               → --primary
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
- **Diagram palette:** each of the five core plugins owns one `--line-*` colour, so a reader can follow a plugin from the lifecycle map to its card, its sidebar and its skill flows. The colours are graphics only: lines, station rings, 4 px swatches, 3 px inset rules and connectors, never text and never a fill larger than a station dot. A colour always sits next to the plugin's name, so it is never the only signal. Supporting plugins have no colour: they use `--diagram-line`. The palette is outside the two-colour rule above because it identifies plugins, not actions or emphasis; `--primary` still marks only what you can act on.
- **Captions** under figures, diagrams, code blocks and tables sit `--space-2` below the block, Caption style in `--caption`, starting with a capital and ending without a full stop when it is not a sentence. Number them by kind: "Figure 1.", "Listing 1.", "Table 1.".
- **Blockquote attribution:** a `<footer>` inside the blockquote, Small in `--muted`, `--space-2` above.
- **Tables:** the header row is Label style in `--muted` on `--tray`; cells are Small in `--text`; rows are separated by a 1 px `--border` rule and nothing else (no zebra stripes, no vertical rules); cell padding `--space-2` vertical and `--space-3` horizontal. Text aligns to the start; columns of numbers align to the end and use `tabular-nums`. Every table sits in a `<div role="region" tabindex="0" aria-labelledby="…">` named by its caption, with `overflow-x: auto`, so a table wider than the screen scrolls on its own instead of the page, a keyboard can scroll it, and its end fades out over 24 px (`mask-image`) while there is more to the right.
- **Navigation:** items are Small in `--muted`, hover `--text`. The current item has `aria-current="page"`, text in `--heading` and a 2 px `--primary` underline at the header's bottom edge (see Site header). No text underline in navigation.
- **Status tones** mean a state, never a brand accent. Use them only in callouts and for status words in output (passed, failed, a review note), always next to a symbol or word that says the same thing, so the state never depends on colour alone. `--success` is close to `--primary` in hue; never put a success-coloured word where it could be mistaken for a link.
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
| `--on-primary` on `--primary-hover` | 7.5:1 | 10.2:1 |
| `--text` / `--muted` on `--tray-pressed` | 10.7:1 / 5.1:1 | 9.9:1 / 6.8:1 |
| `--secondary` on `--canvas` (non-text) | 4.4:1 | 7.5:1 |
| `--diagram-line` on `--canvas` (non-text) | 3.3:1 | 4.9:1 |
| `--line-fd3` / `-code-review` / `-tester` / `-pr-proof` / `-dev-kit` on `--canvas` (non-text) | 4.3 / 3.2 / 8.4 / 5.5 / 3.2:1 | 7.7 / 11.2 / 4.9 / 6.6 / 10.6:1 |
| `--diagram-line` field ring on `--code-bg` / on `--panel` (non-text) | 3.1:1 / 3.6:1 | 5.1:1 / 4.5:1 |
| `--code-text` on `--code-bg` | 11.8:1 / 89 | 13.5:1 / −81 |
| `--code-muted` on `--code-bg` | 5.7:1 / 72 | 8.7:1 / −57 |
| `--info` on `--canvas` / on `--info-bg` | 5.4:1 / 5.2:1 | 9.7:1 / 8.5:1 |
| `--success` on `--canvas` / on `--success-bg` | 6.0:1 / 5.8:1 | 9.9:1 / 8.7:1 |
| `--warning` on `--canvas` / on `--warning-bg` | 5.6:1 / 5.4:1 | 10.8:1 / 9.4:1 |
| `--danger` on `--canvas` / on `--danger-bg` | 6.0:1 / 5.7:1 | 8.7:1 / 7.7:1 |

All values are inside sRGB. Re-check this table when you change a token. The diagram palette also stays distinguishable under colour-vision deficiency: every pair, including `--primary` and `--secondary`, keeps at least ΔE_ok 6.3 under simulated protanopia and deuteranopia and 3.7 under tritanopia.

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

Chakra Petch stops at H2 because its squared counters close up below 20 px and slow reading. The one exception is Label: uppercase letters with +0.08em tracking keep their counters open at 12 px, and a Label is a word or two, never a sentence. A small uppercase kicker above a heading is a Label, never a smaller heading.

- **Never go below 12 px.** Body text is 16 px; inputs are 16 px on phones, because iOS Safari zooms into any smaller field.
- **Use only the size tokens.** A size outside the table is a gap to raise.
- **Measure:** Lead, body text, lists, blockquotes and callouts are at most `--measure` (65ch). Tables, code blocks and figures may be wider. Lists indent `1.25em`.
- **Wrapping:** headings and Display use `text-wrap: balance`; Lead, captions and card descriptions use `text-wrap: pretty`; body text uses neither.
- **Weights:** Chakra Petch 600 only; Plex Sans 400 and 600, plus 400 italic for emphasis; Plex Mono 400. Bold inside body text is Plex Sans 600, never 700.
- **Numbers** in tables, versions and counters use `font-variant-numeric: tabular-nums`.
- **Casing** stays in the source text; uppercase Labels come from `text-transform: uppercase`.
- Set `font-synthesis: none` and `-webkit-font-smoothing: antialiased` once on `:root`, so a missing weight shows as an obvious error instead of a faked bold.

**Loading:** self-host with Fontsource: `@fontsource/chakra-petch` (600), `@fontsource-variable/ibm-plex-sans` (400–600, normal and italic), `@fontsource/ibm-plex-mono` (400), subsets `latin` and `latin-ext` (Polish needs the second), woff2 only. Never link Google Fonts: the embed sends every visitor's IP to Google, which GDPR does not allow without consent.

**No layout shift on load:** preload the two faces above the fold, Chakra Petch 600 and Plex Sans (`<link rel="preload" as="font" type="font/woff2" crossorigin>`), and keep Fontsource's `font-display: swap`. Give each family a metric-matched fallback `@font-face` over a local system face with `size-adjust`, `ascent-override` and `descent-override`, listed right after it in the font stack, because Chakra Petch is much wider than any system sans and headings would otherwise reflow when it arrives.

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

## Components

### Buttons and the command strip

The site's main action is installing a plugin, and installing is a command, not a click. So the main action on a plugin page is the **command strip**: the install command itself with a Copy button. A filled primary button is for actions that have no command, such as "Read the docs" on the landing page.

```
Does the action run a command the user pastes into Claude Code?
 ├── Yes → command strip
 └── No
      ├── Is it the one main action of the view?     → primary button
      ├── Is it an alternative action next to it?    → secondary button
      └── Is it a minor action inside a card or row? → ghost button
```

| Variant | Fill and text | Face |
| --- | --- | --- |
| Primary | `--primary` fill, `--on-primary` text | Plex Sans 600, Small |
| Secondary (default) | no fill, `--heading` text, 1 px inset `--border` ring | Plex Mono 400, Small |
| Ghost | no fill, `--primary` text, `--space-2` side padding | Plex Mono 400, Small |

- **Shape:** `--radius-control` (2 px), height 40 px and `--space-4` side padding; the small size is 32 px and `--space-3`, with its hit area extended to 44 px by a 6 px `::after` above and below. Icons are 16 px with a `--space-2` gap. Labels never wrap.
- **Why two faces:** secondary and ghost buttons are in Plex Mono so they read as tool controls next to code; the primary keeps Plex Sans 600 because it is the one call to action and must read as a sentence.
- **Hover** (only under `@media (hover: hover) and (pointer: fine)`, so touch screens never keep a stuck state): primary `--primary-hover`, secondary and ghost `--tray`.
- **Pressed:** `transform: scale(0.97)`, the one press scale in the system, icon buttons included.
- **Disabled:** `--tray` fill, `--muted` text, no ring, `cursor: not-allowed`; a disabled ghost has no fill. Prefer keeping a button enabled and explaining the problem on click.
- **Loading:** keep the width (stack both labels in one grid cell and hide the inactive one) and show a 14 px spinner; never swap to a shorter label.
- **Motion:** `background-color`, `color` and `box-shadow` over 150 ms `ease`; `transform` over 150 ms `ease-out`; under `prefers-reduced-motion` drop the `transform`.
- **Focus:** the shared ring, `2px solid var(--focus)` with a 2 px offset.

**Command strip:** `--code-bg` fill, 1 px `--border` ring, `--radius-inset`, height 44 px (36 px in a card), padding `--space-3` on the start and 4 px on the end. The command is Plex Mono 400 Small in `--code-text`, prefixed by `> ` in `--code-muted`, on one line that scrolls horizontally and never wraps or truncates, because a cut command pastes broken. The scrolling region has `tabindex="0"` and `aria-label="Install command"`, so a keyboard can scroll it, and when the command overflows its end fades out over 24 px (`mask-image`) to show there is more.

The Copy button is a secondary button 4 px inside the strip's end (36 px tall, 28 px in a card, both with the hit area extended to 44 px like the small button). After copying, its label reads "Copied" for 2 s at the same width, and the same word is announced through a visually hidden `aria-live="polite"` region next to it. If the clipboard refuses (no HTTPS, no permission), the label reads "Select and copy" and the command text is selected, so the reader can press ⌘C. In a card the strip spans the card width.

Correct: a plugin card with a command strip for `/plugin install fd3@cc-toolkit` and a ghost "Changelog" link below it.
Incorrect: a green "Install" button that opens a modal with the command. It adds a step and a second primary fill, and hides what will actually run.

### Callouts

A callout interrupts the reading flow, so use it only for something the reader would regret missing. A side remark that is merely interesting stays a sentence in the text; a quotation is a blockquote.

```
Will skipping it cost the reader data, money or a broken run?  → danger
Will skipping it make the next step fail or surprise them?     → warning
Does it save them time or a mistake they would otherwise make? → tip
Is it context they need, but not urgently?                     → note (default)
Otherwise                                                      → no callout
```

| Kind | Tone | Marker |
| --- | --- | --- |
| Note (default) | `--info` | `i` |
| Tip | `--success` | `✓` |
| Warning | `--warning` | `!` |
| Danger | `--danger` | `✗` |

- **Anatomy:** an `<aside role="note" aria-labelledby="…">` pointing at the title line's `id`, so a screen reader names it by the visible title once, on `--panel`, with a 1 px `--border` ring and a 3 px inset rule in the tone on the inline start (`box-shadow: 0 0 0 1px var(--border), inset 3px 0 0 var(--tone)`), `--radius-control`, padding `--space-3` vertical and `--space-4` plus 3 px on the start.
- **Title line:** Plex Mono 400 Small in the tone: the marker in `<span aria-hidden="true">`, a space, then the title. The title defaults to the kind's name ("Warning") and may be specific ("Danger: concurrent runs"). Never repeat the kind's name after the marker.
- **Body:** Small in `--text`, `--space-1` below the title, at most `--measure` wide, `text-wrap: pretty`. Inline code and links keep their usual style. One or two sentences; a callout that needs a list should be a section.
- **Spacing:** a callout takes the paragraph rhythm, `--space-4` above and below, never `--space-6`.
- **Limits:** at most one danger and two callouts of any kind per screen of text. Never stack two callouts directly, and never put one inside another panel: it would sit on `--panel` with no step left.
- **No tinted fill:** the status `-bg` tokens are not used here, because four tinted boxes on one page out-shout the text they support.

Correct: a warning before the step it guards, "! Warning — Commit or stash your local changes first. fd3 refuses to start on a dirty working tree."
Incorrect: a note saying "fd3 is great for big specs!" It holds nothing the reader would miss, and it teaches readers to skip callouts.

**Status words in command output** (inside a code block): `--success` for passed, `--danger` for failed, `--warning` for notes that need a look, each after its marker (`✓`, `✗`, `!`); durations and counts stay `--code-muted`.

### Badges

A badge is a one-word status attached to something else: a changelog entry, a plugin, a run, a flag in the text. It is the only place the status `-bg` tints are used, because a badge is small enough that the tint marks it without out-shouting the text.

```
Is it a status the reader acts on (broken, failed, going away)? → danger or warning
Is it a good outcome or something new?                          → success
Is it a change or a state in progress?                          → info
Is it a plain fact without a status (beta, since 0.3)?          → neutral
Is it longer than two words, or does it need a sentence?        → not a badge: a callout or the text itself
```

| Tone | Fill and text | Words |
| --- | --- | --- |
| Success | `--success-bg`, `--success` | added, new, passed |
| Info | `--info-bg`, `--info` | changed, fixed, running |
| Warning | `--warning-bg`, `--warning` | deprecated, needs review |
| Danger | `--danger-bg`, `--danger` | breaking, failed, removed |
| Neutral (default) | no fill, `--muted` text, 1 px inset `--border` ring | beta, skipped, since 0.3 |

- **Shape:** an inline `<span>`, Caption in Plex Mono 400, lowercase, padding `4px 6px`, `--radius-control`, `white-space: nowrap`, `vertical-align: 1px` so it sits on the text's baseline. In running text use `line-height: 1` and padding `2px 6px`, so the badge fits inside the 1.6 line box and the paragraph keeps an even rhythm; the taller `4px 6px` is for changelog entries, cards and table cells. No icon and no marker: the word carries the status, so colour is never the only signal.
- **Placement:** in a changelog it leads the entry, `--space-3` before the text, with a fixed `min-width: 9ch` so entries line up. Next to a name (plugin card, heading) it follows the name with a `--space-2` gap. In a table it is the whole cell. In running text it follows the thing it describes.
- **Limits:** one badge per item. A plugin that is both new and beta shows only the badge that matters more to the reader (beta). Never make a badge a link or a button; it has no hover or pressed state.

Correct: a changelog entry led by a `breaking` badge, then "Task files need a `branch` field".
Incorrect: a `✓ passed` badge. The marker belongs to callouts and command output; inside a badge it says the status twice.

### Text fields

Use a text field only where the reader types something the site keeps or acts on, such as a newsletter address. Search is not a text field on the page: it is the search palette below.

Every field the reader types into (text field, select, textarea) is the same box: `--code-bg` and Plex Mono, so a form reads like the command strip and the `[x]` controls beside it. Labels, hints and the surrounding text stay in Plex Sans.

- **Anatomy:** a visible `<label>` above the field (Small, Plex Sans 600, `--heading`), `--space-1` gap, then the field, then an optional hint or error. The placeholder is an example value in `--code-muted`, never the label: it disappears as soon as the reader types.
- **Field:** height 40 px, padding `0 var(--space-3)`, `--code-bg` fill, a 1 px inset `--diagram-line` ring (`box-shadow: inset 0 0 0 1px var(--diagram-line)`), `--radius-control`. Text is Plex Mono 400 at 16 px in `--code-text` on every screen, because iOS Safari zooms into anything smaller. A leading icon is 16 px in `--muted` with a `--space-2` gap.
- **Why `--diagram-line`, not `--border`:** a field's edge is the only thing that shows it is a field, so it needs 3:1 (WCAG 1.4.11). `--border` reaches 1.3:1 on `--code-bg`, and the fill alone differs from the page by 1.1:1.
- **Hover** (fine pointers only): the ring turns `--muted`.
- **Focus:** the ring turns `--focus` and gains a 1 px outer ring (`inset 0 0 0 1px var(--focus), 0 0 0 1px var(--focus)`). This replaces the shared outline for fields, because an outline 2 px away from a field's own ring reads as two boxes.
- **Hint:** Caption in `--muted`, below the field.
- **Invalid:** set `aria-invalid="true"` and link the message with `aria-describedby`. The ring turns `--danger`, and the message replaces the hint: Caption in Plex Mono, `--danger`, prefixed `✗ `, saying how to fix it ("Add a domain, e.g. example.com"), not that it is wrong. Validate on blur and on submit, never on every keystroke.
- **Disabled:** no fill, a 1 px inset `--border` ring, `--muted` text, `cursor: not-allowed`. Not `--tray`: on the light theme it is within a hair of `--code-bg` and a disabled field would look enabled. Prefer a read-only field, which can still be selected and copied.
- **Width** follows the expected value, capped at 360 px; never stretch a short field to the column width.

### Choice controls, select and textarea

Checkboxes and radios are drawn as terminal glyphs, so filters and forms read like the command strip and command output beside them.

```
Can the reader pick more than one option?      → checkboxes
One option from 2–5 that should all be visible → radios
One option from 6 or more, or a long value     → select
Free text longer than one line                 → textarea
```

| Control | Off | On | Mixed | Disabled |
| --- | --- | --- | --- | --- |
| Checkbox | `[ ]` | `[x]` | `[-]` (`indeterminate`) | glyph and label `--muted` |
| Radio | `( )` | `(•)` | — | glyph and label `--muted` |

- **Markup:** a real `<input type="checkbox">` or `radio`, visually hidden (`position: absolute; opacity: 0; width: 1px; height: 1px`), followed by an `aria-hidden="true"` glyph span, both inside one `<label>`. The input keeps keyboard, form and screen-reader behaviour; the glyph is only paint, so it must be updated from the input's state, never the other way round.
- **Option row:** the whole label is clickable, at least 32 px tall on fine pointers and 44 px under `@media (pointer: coarse)`, glyph and label `--space-2` apart, both in Plex Mono 400 Small. The glyph is `--code-muted` when off and `--primary` when on; the label stays `--text`. The glyph changes colour only, never weight: only Plex Mono 400 is loaded, and `font-synthesis: none` would silently ignore a bolder one. An optional count sits at the row's end in Caption, `--muted`, `tabular-nums`.
- **Group:** a `<fieldset>` with a `<legend>` styled as the text-field label (Small, Plex Sans 600, `--heading`), `--space-2` below it; rows `--space-2` apart; groups `--space-5` apart.
- **Focus:** the shared ring goes on the glyph (`input:focus-visible + .glyph`), with `--radius-control`, because the input itself is invisible.
- **Select:** a native `<select>` with `appearance: none` in the text-field box, with all its states, and a 12 px chevron in `--muted` 12 px from the end. The open list stays native: it is the only one that works on phones.
- **Textarea:** the text-field box with all its states, padding `--space-2` vertical and `--space-3` horizontal, at least 104 px tall, `resize: vertical`. With a `maxlength`, show a counter below its end: Caption in Plex Mono, `--code-muted`, `tabular-nums`, as "39 / 500".

Correct: a plugin filter "Lifecycle stage" with `[x] Plan  1` rows and a `(•) Recently updated` sort.
Incorrect: a toggle switch for a filter. A switch means "applies now" in settings; a filter is a choice in a list, and it breaks the glyph set.

### Search palette

Developers expect documentation search behind a shortcut, so search opens a dialog instead of living as a field in the header.

- **Trigger:** a button in the header, styled as a field 32 px tall: a 16 px search icon, "Search" in Plex Mono Small `--muted`, and the shortcut in a key cap. The key cap reads `⌘K` on macOS and `Ctrl K` elsewhere: Caption in Plex Mono, `--code-muted` on `--code-bg`, a 1 px `--border` ring, `--radius-control`, padding `3px 5px`. Its hit area is extended to 44 px like the small button. Below 600 px viewport width the trigger is the icon alone with `aria-label="Search docs"`.
- **Opening:** the trigger, `⌘K` / `Ctrl K`, or `/` when focus is not in a field. The dialog is a modal `<dialog>`: focus moves into its field, Tab stays inside it, and on close focus returns to the trigger.
- **Dialog:** over a `--scrim` backdrop, 12vh from the top, at most 520 px wide (the viewport minus `--space-4` on each side on phones); `--panel`, `--radius-panel`, `--shadow-overlay`, 4 px padding.
- **Field in the dialog:** 48 px tall, no fill and no ring, a 1 px `--border` rule below it, because the dialog's own edge already frames it; otherwise as a text field.
- **Results:** a `role="listbox"` driven by `aria-activedescendant` from the field. Each option has the page path as its title (Small, Plex Sans 600, `--heading`, sections joined by ` › `) and one line of context (Caption, `--muted`). The matched term is `<mark>` in `--primary` at weight 600 with no background. Padding `--space-2` vertical and `--space-3` horizontal, `--radius-inset`; the active option has a `--tray` fill.
- **Keys:** ↑ and ↓ move the active option, Enter opens it, Esc closes. A footer row repeats them: Caption in Plex Mono, `--code-muted`, above a 1 px `--border` rule.
- **Empty and no-result states:** with no query, show the five most visited pages; with no match, one line "No results for ‘query’" in `--muted` and a link to the plugin index.
- **Motion:** none. The palette opens and closes instantly, because it is mostly opened from the keyboard many times a day, and any animation there reads as lag.

Correct: pressing `⌘K` on any page opens the palette with the cursor in the field.
Incorrect: a 300 px search field in the header. It takes the space the navigation needs and still needs a results dropdown.

### Site header

One header on every page; the current section is marked like a tab.

- **Bar:** 56 px tall, `--canvas` fill, a 1 px `--border` rule along the bottom (`box-shadow: 0 1px 0 var(--border)`), padding `0 var(--space-5)`. Order: logo, navigation, flexible space, then the tools (search trigger, GitHub icon) with a `--space-3` gap, so their 44 px hit areas do not overlap.
- **Skip link:** the first element in the page is a "Skip to content" link to `<main id="content">`, visually hidden until focused, then shown at the header's start as a secondary button.
- **Logo:** the lockup, 28 px tall (see Surfaces); it links home with `aria-label="cc-toolkit home"`.
- **Navigation:** `<nav aria-label="Main">`, items `--space-5` apart and stretched to the full bar height so the tab underline sits on the header's bottom edge. The current item: `--heading` text and `box-shadow: inset 0 -2px 0 var(--primary)`. Other items carry a transparent underline of the same size, so nothing shifts when the current item changes.
- **Icon buttons:** 32 px square with a 44 px hit area, 18 px icon in `--muted`, hover `--text`, `--radius-control`, and an `aria-label`.
- **Below 600 px:** the lockup becomes the mark alone (28 px), the navigation moves behind a menu icon button at the end (see Mobile menu), and the search trigger becomes its icon.
- **Not sticky.** Docs pages are read top to bottom and the palette shortcut works from anywhere, so the header scrolls away.

Correct: on any fd3 page, "docs" is the current item with the green underline.
Incorrect: the current item in `--primary` text as well. Green text next to a green underline marks it twice and reads as a link.

### Site footer

The footer is where readers look for the plugin list, the licence and who made the site.

- **Frame:** a 1 px `--border` rule along the top, padding `--space-6` vertical and `--space-5` horizontal, `--canvas` fill.
- **Columns:** a grid of link groups, `repeat(auto-fit, minmax(140px, 1fr))` with a `--space-5` gap: Plugins (the core plugins, then "All plugins"), Docs (Install, Changelog, Contributing) and grixu.dev (Blog, GitHub, Contact). Each group has a Label-style heading in `--muted` and a list of Small links in `--muted` with `--space-1` between them; hover `--text`. Under `@media (pointer: coarse)` each link is a block at least 44 px tall. On phones the groups wrap to two columns, then one.
- **Legal line:** spans all columns below a 1 px `--border` rule with `--space-4` above it; Caption in `--caption`: "© 2026 grixu.dev · cc-toolkit is MIT-licensed · Not affiliated with Anthropic". The last clause always stays, because the plugins extend Claude Code and readers should not mistake the site for Anthropic's.

Correct: the legal line keeps "Not affiliated with Anthropic" on every page.
Incorrect: the footer links in `--primary`. A block of green links outweighs the page content above it.

### Mobile menu

Below 600 px the header's menu button opens a drawer from the right. It is the only navigation on phones, so it carries the sections, the plugin list and the footer's essentials.

- **Trigger:** the header's menu icon button, `aria-label="Open menu"`, `aria-expanded` and `aria-controls` pointing at the drawer.
- **Drawer:** a modal `<dialog>` pinned to the right edge, full height, 84% of the viewport width (at most 360 px), `--panel` fill, `--shadow-overlay`, no radius. The strip of page left of it stays visible under a `--scrim`, so the reader keeps their place; tapping it closes the drawer.
- **Top bar:** 56 px, the same height as the header it covers, with a 1 px `--border` rule below it. The lockup (24 px) on the left links home; a close icon button (as in the header, `aria-label="Close menu"`) on the right sits where the menu button was.
- **Sections:** a list of the header's navigation items, each 48 px tall with `--space-4` side padding, Body in `--muted`. The current item is `--heading` with `box-shadow: inset 2px 0 0 var(--primary)`: the tab underline turned to the side.
- **Plugins:** a Label-style heading in `--muted`, then a two-column grid of plugin names in Plex Mono Small, `--muted`, at least 44 px tall each, ending with "All plugins →". Gap `--space-1` vertical and `--space-4` horizontal, `--space-5` above the group.
- **Bottom bar:** pinned to the bottom above a 1 px `--border` rule, padding `--space-4`: the marketplace version and licence ("cc-toolkit 1.0.0 · MIT") in Caption, `--caption`, and the GitHub icon button. The version is the top-level `version` in `.claude-plugin/marketplace.json`, which `scripts/release.sh` bumps with every plugin release; never show a plugin's own version here.
- **Behaviour:** focus moves to the close button, Tab stays inside, Esc or a tap on the scrim closes it, and focus returns to the menu button. The page behind does not scroll while it is open. Following a link closes it.
- **Motion:** the drawer slides in from the right (`translateX(100%)` to `0`) and the scrim fades in, over 200 ms `cubic-bezier(0.32, 0.72, 0, 1)`; closing takes 150 ms on the same curve. Use transitions, not keyframes, so a quick tap mid-slide reverses it. A `<dialog>` only animates its exit with `transition-behavior: allow-discrete` on `display` and `overlay`, and its entry with `@starting-style`; without them it vanishes at once. Under `prefers-reduced-motion` both only fade.

Correct: on a phone, the menu shows "Docs" marked with the green side bar and the plugin list below it.
Incorrect: a drawer from the left. The menu button sits at the right end of the header, and the drawer should come from where the thumb tapped.

### Docs sidebar

On a plugin's docs pages a sidebar lists that plugin's pages, so the reader sees where the current page sits and what comes next. The site sections stay in the header; the sidebar never repeats them.

- **Layout:** from 900 px viewport width the page is a grid of a 232 px sidebar and the content column, `--space-6` apart. The sidebar is `position: sticky; top: 0`, at most `100dvh` tall with its own vertical scroll, because the header scrolls away and a long list must stay reachable.
- **Markup:** `<nav aria-label="fd3 docs">` (the plugin's name), one `<ul>` per group, each led by a Label-style heading in `--muted` (`--space-5` above it, `--space-2` below; none above the first).
- **Rail:** each group's list has a 1 px `--border` rail on the inline start (`box-shadow: inset 1px 0 0 var(--border)`). Links are Small in Plex Sans 400, `--muted`, at least 32 px tall, `--space-4` from the rail, with no underline.
- **Current page:** `aria-current="page"`, text `--heading` and a 2 px `--primary` segment on the rail (`box-shadow: inset 2px 0 0 var(--primary)`): the same side bar as the mobile menu. Weight stays 400, so nothing reflows when the current page changes.
- **Hover** (fine pointers only): text `--text`, no fill. Pressed: text `--heading`. The rail is reserved for the current page.
- **Below 900 px:** the sidebar moves above the content as a `<details>` bar, 48 px tall with a 1 px `--border` rule below it: "Pages ·" in `--muted`, then the current page's title in Plex Mono Small `--heading`, and a chevron in `--muted` at the end. Open, it shows the same list with rows at least 44 px tall. Following a link closes it.

Correct: the fd3 sidebar with Start, Guides and Reference, "implement" marked by the green segment.
Incorrect: the current page in `--primary` text. Green text plus the green segment marks it twice, and green text in a list of links reads as one more link.

### Table of contents

A docs page with at least three H2s gets an "On this page" list of its H2s and H3s, so the reader can see the page's shape and jump within it. Shorter pages get none; two links are not worth a column.

- **Layout:** from 1200 px viewport width it is a third grid column, 200 px wide and `--space-6` from the content, `position: sticky; top: var(--space-5)`. Between 900 and 1200 px there is no room for it beside the sidebar, so it takes the below-900 px form.
- **Markup:** `<nav aria-labelledby>` pointing at a Label-style "On this page" heading in `--muted`, then an `<ol>` of H2 links with a nested `<ol>` of H3 links. H4 and below never appear.
- **Rail:** the outer list has the same 1 px `--border` rail as the sidebar (`box-shadow: inset 1px 0 0 var(--border)`). Links are Small in Plex Sans 400, `--muted`, line-height 1.35, `6px` block padding, `--space-4` from the rail; H3 links add `--space-3`. No underline.
- **Current section:** the section being read gets `aria-current="true"`, text `--heading` and a 2 px `--diagram-line` segment on the rail. The segment is grey on purpose: green already marks the current page in the sidebar, and two green markers on one screen compete. It is the last heading whose top has passed 25% of the viewport height, tracked with an `IntersectionObserver`; before the first H2 nothing is current.
- **Hover** (fine pointers only): text `--text`. Pressed: text `--heading`.
- **Jumping:** every heading has an `id` and `scroll-margin-top: var(--space-5)`. Scrolling is smooth (`scroll-behavior: smooth`) except under `prefers-reduced-motion`, and following a link moves focus to the heading (`tabindex="-1"`) so keyboard reading continues from there.
- **Below 1200 px:** the list moves into the article, under the lead, as a `<details>` closed by default, with a 1 px `--border` rule above and below. The summary is the Label "On this page" with a chevron, 44 px tall; open, rows are at least 44 px. No current section is marked, because the list is out of view while reading.

Correct: on a long guide, "Merging a wave" in `--heading` with a grey segment on the right-hand rail while the sidebar marks "implement" in green.
Incorrect: a green segment in the table of contents. With the sidebar's green segment the screen has two "you are here" markers and the reader cannot tell which is the page.

### Pagination

Every docs page that has a neighbour in the sidebar's order ends with links to the previous and next page, so a reader going through a guide never has to find the sidebar again. The order is the sidebar's, across groups; the first page has no "Previous" and the last no "Next".

- **Markup:** `<nav aria-label="Pages">` after the article's last block, `--space-7` below it, with two links carrying `rel="prev"` and `rel="next"`. A missing side leaves its grid cell empty, so "Next" stays on the right.
- **Layout:** a two-column grid, `--space-4` apart, as wide as the content column (`--measure`). Below 600 px the links stack, "Previous" above "Next", both left-aligned.
- **Card:** each link is a whole clickable card: padding `--space-4`, a 1 px `--border` ring (`box-shadow: inset 0 0 0 1px var(--border)`), `--radius-panel`, at least 44 px tall. Inside, top to bottom: "Previous" or "Next" as a Label in `--muted`, the page title in Plex Sans 600 Body, `--heading`, and the page's sidebar group in Caption, `--caption`. "Next" aligns right on wide screens.
- **No arrows or icons:** the Label already says the direction.
- **States:** hover and pressed follow the clickable-card rule in Hover and pressed (`--tray`, then `--tray-pressed`); focus rings the whole card.

Correct: at the end of "implement", "Previous · split-to-tasks" and "Next · validate-spec", both in the Guides group.
Incorrect: the next page's title in `--primary`. The card is already the link; a green title makes it one more link inside a link.

### Hover and pressed

One rule for everything interactive that the sections above do not give its own states: a hover fills with `--tray`, a press fills one step deeper with `--tray-pressed`. It is the rule secondary and ghost buttons already follow, so every control in the system answers a pointer the same way, and green stays reserved for the current item.

| Element | Hover | Pressed |
| --- | --- | --- |
| Clickable card (whole card is one link) | `--tray` fill | `--tray-pressed` fill |
| Menu row, option row, search result | `--tray` fill, text one step up (`--muted` → `--text`) | `--tray-pressed` fill, text `--heading` |
| Navigation tab | text `--text` | text `--heading`, 2 px `--border` underline |
| Icon button | `--tray` fill, icon `--text` | `--tray-pressed` fill, `scale(0.97)` |
| Link | 2 px underline | 2 px underline, `opacity: 0.75` |

- **Hover only on fine pointers:** wrap every hover in `@media (hover: hover) and (pointer: fine)`, so a tap never leaves a stuck state. Pressed (`:active`) applies everywhere; on touch it is the only feedback.
- **Shape stays:** a fill keeps the element's own radius (`--radius-panel` on cards, `--radius-inset` on results, `--radius-control` on option rows and icons, none on full-width menu rows). Nothing grows, lifts or casts a shadow on hover.
- **Clickable card:** make the title the one link and stretch its hit area over the card (`a::after { content: ""; position: absolute; inset: 0 }`). Buttons and links inside the card, such as the command strip's Copy, sit above it with `position: relative` and keep their own states; hovering them does not fill the card. Keyboard focus rings the whole card, because that is what a click hits: `a:focus-visible { outline: none }` and `a:focus-visible::after { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--radius-panel) }`.
- **Motion:** `background-color`, `color` and `box-shadow` over 150 ms `ease`; `transform` only on icon buttons, 150 ms `ease-out`, dropped under `prefers-reduced-motion`.
- **Never:** hover or pressed on badges, callouts, code blocks or plain cards without a link. A fill on something that does nothing on click is a false promise.

Correct: hovering a plugin card fills it `--tray`; hovering its Copy button fills only the button.
Incorrect: a pressed nav tab with a `--primary` underline. For a moment it claims to be the current page before the page has changed.

### Lifecycle map

The site's spine. It shows the development cycle (Plan, Build, then Review & test as Self-review, Test and Human review) as a transit map: each core plugin is a line in its `--line-*` colour, each skill a station on it, and a reader finds a plugin by where it works rather than by name.

```
Is the page about the whole toolkit?            → full map (landing, Lifecycle overview)
Is it a plugin's overview or a placeholder?     → map zoomed to the plugin: its stations full, the rest at 0.18 opacity
Is it a lifecycle stage page?                   → map zoomed to the stage: its band filled --tray, other stations dimmed
Is it one skill's page?                         → no map: the skill flow below
```

- **Frame:** a `<figure>` on `--panel` with `--radius-panel` and a 1 px `--border` ring, captioned "Figure 1. …" like any figure. The inside is at least 980 px wide and scrolls horizontally on narrow screens, because a transit map squeezed to a phone loses its stations' labels.
- **Stage header:** Label-style stage numbers (`01`, `02`, `03a`…) in `--muted` and stage titles in Small 600 `--heading`, each a link to its stage page. "Review & test" is one Label over its three columns, ruled with 1 px `--diagram-line`, and never spans Maintain.
- **Lines and stations:** main-line segments 7 px, round caps; branches 4 px, dotted (`2 7`) when a skill is called by another rather than run by hand (ci-fix, called by pr-shepherd). Core stations are 3.5 px rings in the line colour on `--panel`; supporting plugins' stations are 1.5 px `--diagram-line` rings with no colour. Labels are Plex Mono 14 px in `--text`, one under or over each station, with a 12 px `--muted` subline for a feature ("+ risk label"). A dashed `--diagram-line` loop returns from the merge marker to the start, labelled "merged · next change".
- **Interaction:** every station is a link to its skill's page with the station label as its name. Hovering a station fills its dot with the line colour and underlines its label. Hovering a plugin in the key under the map dims every other plugin to 0.15 opacity. Focus rings the station's hit area.
- **Motion (full map only):** once the map scrolls into view, the change builds the line: the track dims to 0.25, a full-colour copy is revealed station by station over 1100 ms `cubic-bezier(0.65, 0, 0.35, 1)`, the current station's dot fills, grows to 11 px and sends out one ring in its line colour, and the artefact it leaves (`spec.md · ready`, `PR #142 · risk: medium`) fades in on one row below all labels, so it never covers a station. At the end the merge marker fills `--heading`, the line holds for a moment, then fades and the cycle restarts. There is no separate travelling dot. Under `prefers-reduced-motion` the line is full and still: no ring, no artefacts.
- **Key:** under the map, one row per core plugin (4 px swatch, name in Plex Mono, its promise in `--muted`) and one entry for supporting plugins (an uncoloured ring).

Correct: the landing map with fd3's blue line from build-spec to implement, handing over to code-review's line at start-cr.
Incorrect: an orange dot travelling along the line with a floating label. It covers the next station's name, and `--secondary` beside five line colours reads as a sixth plugin.

### Maintain band

Maintenance is not a stage of the cycle: it happens whenever it is needed, and the toolkit has no deploy step to anchor it to. So it sits under the map, outside the cycle.

- **Frame:** a panel with a 1 px inset `--border` ring, `--radius-panel`, `--space-4` padding and a faint 45° hatch of `--tray` lines, the one patterned surface in the system, so it reads as "off the line" next to the map.
- **Header:** "Maintain" as a Label in `--heading`, linked to its stage page, then "outside the cycle, whenever it's needed" in Caption `--caption`.
- **Items:** a grid of clickable tiles (`minmax(220px, 1fr)`), each on `--panel` with a 3 px inset rule in its plugin's line colour, or `--diagram-line` for a supporting plugin: the command in inline code, then one Small line on what it does. Hover and pressed follow Hover and pressed.

Correct: `/dev-kit:dep-upgrade-check` with a teal rule next to `/hookify:hookify` with a grey one.
Incorrect: dep-upgrade-check as a station after pr-shepherd. Upgrades do not follow a merge, and the line would claim they do.

### Skill flow

A skill page shows how that one skill runs, step by step, from what you give it to what it hands over. It is the map's third zoom level: the map shows where the skill sits, the flow what happens inside it.

- **Stage row:** above the flow, the cycle's stages as a row of Small links in `--muted`; the skill's own stage is `--heading` with a 3 px underline in the plugin's line colour.
- **Steps:** an ordered list on `--panel` (`--radius-panel`, 1 px `--border` ring, `--space-5` padding), laid out in a row when the container is wider than 940 px and as a column below that (a container query, so it follows the content column, not the viewport).
- **Ends:** the first item is "You give it" and the last "Hands over to", both Label-style headings on a `--tray` tile with `--radius-inset`; the hand-over links to the next skill's page.
- **Step:** a 28 px circular marker with the step number in Plex Mono Caption and a 2 px `--secondary` inset ring (the figure's one secondary step marker), the step name in Plex Sans 600 `--heading`, what it does in Small, and what it leaves as inline code with a 2 px inset rule in the line colour. Connectors are 2 px in the line colour, fading to `--diagram-line` before an end tile; an optional step has a dashed connector, a 1.5 px `--diagram-line` marker ring and "optional" in `--muted`.
- **Motion:** steps rise 6 px and fade in once, 400 ms `cubic-bezier(0.23, 1, 0.32, 1)`, 70 ms apart; nothing under `prefers-reduced-motion`.

Correct: build-spec's flow ending in "Hands over to · split-to-tasks".
Incorrect: the flow drawn as a Mermaid flowchart. Mermaid cannot carry the plugin's line colour or link its ends, and its boxes are a second figure style on the same page.

### Plugin card

A card stands for one plugin on the landing page and in the catalog: what it promises, the skills it brings, and how to install it.

- **Variants:** the core card (landing) has the plugin's illustration on top, then the name, the promise, a one-sentence description, its main skills as inline code and a command strip; the first two cards span three columns of six, the rest two. The catalog card has no illustration: name, a `supporting` neutral badge when it is not core, the description, the skills and the strip.
- **Marking:** a 4 px swatch in the plugin's line colour before its name; a supporting plugin shows an uncoloured `--diagram-line` ring instead.
- **States:** the whole card is one link (see Hover and pressed); the strip's Copy sits above it and keeps its own states.

Correct: the fd3 card with its blue swatch and `/plugin install fd3@cc-toolkit` in the strip.
Incorrect: a card with a "Learn more" button. The card is already the link, and the button is a second target pointing to the same page.

### Plugin illustrations

Each core plugin and the landing hero have an isometric line illustration, so a card is recognisable before its name is read.

- **Paint:** shapes in `--panel` and `--tray`, ink lines in `--muted`, and one flat spot in the plugin's `--line-*` colour, at most about 15% of the drawing: the block fd3 builds, the face tester checks. The hero uses `--diagram-line` for its spot. This is the one exception to "highlights are strokes": an illustration is not a diagram and highlights nothing, and the spot is what ties the card to its line on the map. Diagrams stay stroke-only.
- **Frame:** on `--panel` inside a 1 px `--border` ring with `--radius-panel`; square, 200 px beside a plugin's overview title and hidden below 760 px, 132 px tall on a card. Decorative, so `aria-hidden="true"` with no alt text.
- **Source:** inline SVG with classes `p` (panel), `m` (tray), `i` (ink) and `a` (accent) mapped to tokens, so both themes follow without a second file. A new illustration is recoloured to these four classes before it ships.

Correct: tester's clamped block with one violet face.
Incorrect: an illustration in full colour from an image model. It ignores the theme and outweighs the text beside it.

## Languages

The site is in English and Polish, and every page exists in both.

- **Paths:** English is the root locale (`/plugins/fd3/`), Polish lives under `/pl/` with the same slugs (`/pl/plugins/fd3/`). Slugs, anchors in links, commands, file names and code stay in English in both, so a link or a command copied from one version works in the other.
- **Switch:** the header's language link (`PL` / `EN`, Plex Mono Small `--muted`, `hreflang` and `lang` set) goes to the same page in the other language.
- **Missing translation:** a page with no Polish file falls back to English with a note callout at the top, "This page isn't translated yet". This is a stopgap, not a state to ship: a page and its translation land in the same change.
- **Polish copy:** written for Polish readers, not translated word for word. Address the reader with "ty"; keep established English terms (pull request, branch, worktree, spec, review, commit) and decline them where Polish does; dates in the Polish format through `toLocaleDateString('pl-PL')`.

Correct: `/pl/plugins/dev-kit/pr-open/` explaining the risk label in Polish, with `/dev-kit:pr-open` unchanged in its strip.
Incorrect: a Polish slug such as `/pl/pluginy/dev-kit/`. The language switch and every cross-language link would need a mapping table.

## Not defined yet

Every component the site uses so far has rules. When a page needs something not covered above, do not invent a style for it: raise it as a gap here, and add its rules under Components (when to use it versus the alternative, variants with the default marked, states, one correct and one incorrect example) before building it.
