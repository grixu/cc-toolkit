# cc-toolkit design system

A quiet, green-tinted neutral system with two colours. Bottle green is `--primary`, taken from the logo's front plate: it marks what you can act on. Clay is `--secondary`: it marks editorial emphasis such as quotes and the second highlight in a diagram, and is never text. Everything else is neutral, so the two colours stay rare enough to mean something. The site has a light and a dark theme, derived from one set of tokens.

The tokens live in `brand/tokens.css`. The logo, its files and its rules are in `docs/brand/logo.md`. Components are documented under Components below: when to use each one versus the alternative, its variants with the default marked, and one correct and one incorrect example.

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
| `--primary-hover` | Hover fill of the primary button |
| `--on-primary` | Text and icons on a `--primary` fill |
| `--secondary` | Quote rules, the second highlight in a diagram, step markers |
| `--focus` | Keyboard focus ring (alias of `--primary`) |
| `--selection` | `::selection` background; selected text stays `--text` |
| `--code-bg`, `--code-text`, `--code-muted` | Code blocks and inline code; `--code-muted` for comments and command output |
| `--diagram-line` | Strokes and connectors in diagrams and illustrations |
| `--info`, `--success`, `--warning`, `--danger` | Status tones: callout markers and titles, status words in command output |
| `--scrim` | Backdrop behind a dialog |
| `--shadow-overlay` | Ring and shadow of a dialog; the only drop shadow in the system |
| `--info-bg` … `--danger-bg` | Tinted fill for a status tone; reserved, no component uses it yet |

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
- **Captions** under figures, diagrams, code blocks and tables sit `--space-2` below the block, Caption style in `--caption`, starting with a capital and ending without a full stop when it is not a sentence. Number them by kind: "Figure 1.", "Listing 1.", "Table 1.".
- **Blockquote attribution:** a `<footer>` inside the blockquote, Small in `--muted`, `--space-2` above.
- **Tables:** the header row is Label style in `--muted` on `--tray`; cells are Small in `--text`; rows are separated by a 1 px `--border` rule and nothing else (no zebra stripes, no vertical rules); cell padding `--space-2` vertical and `--space-3` horizontal. Text aligns to the start; columns of numbers align to the end and use `tabular-nums`.
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
| `--secondary` on `--canvas` (non-text) | 4.4:1 | 7.5:1 |
| `--diagram-line` on `--canvas` (non-text) | 3.3:1 | 4.9:1 |
| `--code-text` on `--code-bg` | 11.8:1 / 89 | 13.5:1 / −81 |
| `--code-muted` on `--code-bg` | 5.7:1 / 72 | 8.7:1 / −57 |
| `--info` on `--canvas` / on `--info-bg` | 5.4:1 / 5.2:1 | 9.7:1 / 8.5:1 |
| `--success` on `--canvas` / on `--success-bg` | 6.0:1 / 5.8:1 | 9.9:1 / 8.7:1 |
| `--warning` on `--canvas` / on `--warning-bg` | 5.6:1 / 5.4:1 | 10.8:1 / 9.4:1 |
| `--danger` on `--canvas` / on `--danger-bg` | 6.0:1 / 5.7:1 | 8.7:1 / 7.7:1 |

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
- **Pressed:** `transform: scale(0.97)`.
- **Disabled:** `--tray` fill, `--muted` text, no ring, `cursor: not-allowed`; a disabled ghost has no fill. Prefer keeping a button enabled and explaining the problem on click.
- **Loading:** keep the width (stack both labels in one grid cell and hide the inactive one) and show a 14 px spinner; never swap to a shorter label.
- **Motion:** `background-color`, `color`, `box-shadow` and `transform` over 150 ms `ease-out`; under `prefers-reduced-motion` drop the `transform`.
- **Focus:** the shared ring, `2px solid var(--focus)` with a 2 px offset.

**Command strip:** `--code-bg` fill, 1 px `--border` ring, `--radius-inset`, height 44 px (36 px in a card), padding `--space-3` on the start and 4 px on the end. The command is Plex Mono 400 Small in `--code-text`, prefixed by `> ` in `--code-muted`, on one line that scrolls horizontally and never wraps or truncates, because a cut command pastes broken. The Copy button is a secondary button 4 px inside the strip's end (36 px tall, 28 px in a card); after copying, its label reads "Copied" for 2 s at the same width. In a card the strip spans the card width.

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

- **Anatomy:** an `<aside role="note" aria-label="Warning">` (the kind's name) on `--panel`, with a 1 px `--border` ring and a 3 px inset rule in the tone on the inline start (`box-shadow: 0 0 0 1px var(--border), inset 3px 0 0 var(--tone)`), `--radius-control`, padding `--space-3` vertical and `--space-4` plus 3 px on the start.
- **Title line:** Plex Mono 400 Small in the tone: the marker, a space, then the title. The title defaults to the kind's name ("Warning") and may be specific ("Danger: concurrent runs"). Never repeat the kind's name after the marker.
- **Body:** Small in `--text`, `--space-1` below the title, at most `--measure` wide, `text-wrap: pretty`. Inline code and links keep their usual style. One or two sentences; a callout that needs a list should be a section.
- **Spacing:** a callout takes the paragraph rhythm, `--space-4` above and below, never `--space-6`.
- **Limits:** at most one danger and two callouts of any kind per screen of text. Never stack two callouts directly, and never put one inside another panel: it would sit on `--panel` with no step left.
- **No tinted fill:** the status `-bg` tokens are not used here, because four tinted boxes on one page out-shout the text they support.

Correct: a warning before the step it guards, "! Warning — Commit or stash your local changes first. fd3 refuses to start on a dirty working tree."
Incorrect: a note saying "fd3 is great for big specs!" It holds nothing the reader would miss, and it teaches readers to skip callouts.

**Status words in command output** (inside a code block): `--success` for passed, `--danger` for failed, `--warning` for notes that need a look, each after its marker (`✓`, `✗`, `!`); durations and counts stay `--code-muted`.

### Text fields

Use a text field only where the reader types something the site keeps or acts on, such as a newsletter address. Search is not a text field on the page: it is the search palette below.

- **Anatomy:** a visible `<label>` above the field (Small, Plex Sans 600, `--heading`), `--space-1` gap, then the field, then an optional hint or error. The placeholder is an example value in `--muted`, never the label: it disappears as soon as the reader types.
- **Field:** height 40 px, padding `0 var(--space-3)`, `--panel` fill, a 1 px inset `--border` ring (`box-shadow: inset 0 0 0 1px var(--border)`), `--radius-control`. Text is Plex Sans 400 at 16 px on every screen, because iOS Safari zooms into anything smaller. A leading icon is 16 px in `--muted` with a `--space-2` gap.
- **Hover** (fine pointers only): the ring turns `--diagram-line`.
- **Focus:** the ring turns `--focus` and gains a 1 px outer ring (`inset 0 0 0 1px var(--focus), 0 0 0 1px var(--focus)`). This replaces the shared outline for fields, because an outline 2 px away from a field's own ring reads as two boxes.
- **Hint:** Caption in `--muted`, below the field.
- **Invalid:** set `aria-invalid="true"` and link the message with `aria-describedby`. The ring turns `--danger`, and the message replaces the hint: Caption in Plex Mono, `--danger`, prefixed `✗ `, saying how to fix it ("Add a domain, e.g. example.com"), not that it is wrong. Validate on blur and on submit, never on every keystroke.
- **Disabled:** `--tray` fill, no ring, `--muted` text. Prefer a read-only field, which can still be selected and copied.
- **Width** follows the expected value, capped at 360 px; never stretch a short field to the column width.

### Search palette

Developers expect documentation search behind a shortcut, so search opens a dialog instead of living as a field in the header.

- **Trigger:** a button in the header, styled as a field 32 px tall: a 16 px search icon, "Search" in Plex Mono Small `--muted`, and the shortcut in a key cap. The key cap reads `⌘K` on macOS and `Ctrl K` elsewhere: Caption in Plex Mono, `--code-muted` on `--code-bg`, a 1 px `--border` ring, `--radius-control`, padding `3px 5px`. Below 600 px viewport width the trigger is the icon alone with `aria-label="Search docs"`.
- **Opening:** the trigger, `⌘K` / `Ctrl K`, or `/` when focus is not in a field. The dialog is a modal `<dialog>`: focus moves into its field, Tab stays inside it, and on close focus returns to the trigger.
- **Dialog:** over a `--scrim` backdrop, 12vh from the top, at most 520 px wide (the viewport minus `--space-4` on each side on phones); `--panel`, `--radius-panel`, `--shadow-overlay`, 4 px padding.
- **Field in the dialog:** 48 px tall, no ring, a 1 px `--border` rule below it; otherwise as a text field.
- **Results:** a `role="listbox"` driven by `aria-activedescendant` from the field. Each option has the page path as its title (Small, Plex Sans 600, `--heading`, sections joined by ` › `) and one line of context (Caption, `--muted`). The matched term is `<mark>` in `--primary` at weight 600 with no background. Padding `--space-2` vertical and `--space-3` horizontal, `--radius-inset`; the active option has a `--tray` fill.
- **Keys:** ↑ and ↓ move the active option, Enter opens it, Esc closes. A footer row repeats them: Caption in Plex Mono, `--code-muted`, above a 1 px `--border` rule.
- **Empty and no-result states:** with no query, show the five most visited pages; with no match, one line "No results for ‘query’" in `--muted` and a link to the plugin index.
- **Motion:** the dialog fades in and scales from 0.98 over 150 ms `ease-out` and closes without animation; under `prefers-reduced-motion` it only fades.

Correct: pressing `⌘K` on any page opens the palette with the cursor in the field.
Incorrect: a 300 px search field in the header. It takes the space the navigation needs and still needs a results dropdown.

### Site header

One header on every page; the current section is marked like a tab.

- **Bar:** 56 px tall, `--canvas` fill, a 1 px `--border` rule along the bottom (`box-shadow: 0 1px 0 var(--border)`), padding `0 var(--space-5)`. Order: logo, navigation, flexible space, then the tools (search trigger, GitHub icon) with a `--space-2` gap.
- **Logo:** the lockup, 28 px tall (see Surfaces); it links home with `aria-label="cc-toolkit home"`.
- **Navigation:** `<nav aria-label="Main">`, items `--space-5` apart and stretched to the full bar height so the tab underline sits on the header's bottom edge. The current item: `--heading` text and `box-shadow: inset 0 -2px 0 var(--primary)`. Other items carry a transparent underline of the same size, so nothing shifts when the current item changes.
- **Icon buttons:** 32 px square with a 44 px hit area, 18 px icon in `--muted`, hover `--text`, `--radius-control`, and an `aria-label`.
- **Below 600 px:** the lockup becomes the mark alone (28 px), the navigation moves behind a menu icon button at the end, and the search trigger becomes its icon.
- **Not sticky.** Docs pages are read top to bottom and the palette shortcut works from anywhere, so the header scrolls away.

Correct: on any fd3 page, "docs" is the current item with the green underline.
Incorrect: the current item in `--primary` text as well. Green text next to a green underline marks it twice and reads as a link.

### Site footer

The footer is where readers look for the plugin list, the licence and who made the site.

- **Frame:** a 1 px `--border` rule along the top, padding `--space-6` vertical and `--space-5` horizontal, `--canvas` fill.
- **Columns:** a grid of link groups, `repeat(auto-fit, minmax(140px, 1fr))` with a `--space-5` gap: Plugins (the core plugins, then "All plugins"), Docs (Install, Changelog, Contributing) and grixu.dev (Blog, GitHub, Contact). Each group has a Label-style heading in `--muted` and a list of Small links in `--muted` with `--space-1` between them; hover `--text`. On phones the groups wrap to two columns, then one.
- **Legal line:** spans all columns below a 1 px `--border` rule with `--space-4` above it; Caption in `--caption`: "© 2026 grixu.dev · cc-toolkit is MIT-licensed · Not affiliated with Anthropic". The last clause always stays, because the plugins extend Claude Code and readers should not mistake the site for Anthropic's.

Correct: the legal line keeps "Not affiliated with Anthropic" on every page.
Incorrect: the footer links in `--primary`. A block of green links outweighs the page content above it.

## Not defined yet

These have no rules yet. Do not invent a style for them: raise each one as a gap, and add its rules under Components (when to use it versus the alternative, variants with the default marked, states, one correct and one incorrect example) before building it.

- The mobile menu panel that the header's menu button opens.
- Hover and pressed states for components other than links, navigation, buttons and fields.
- Selects, checkboxes, radios and textareas.
- Any use of the status `-bg` tints.
