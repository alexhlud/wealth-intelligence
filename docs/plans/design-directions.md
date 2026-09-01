# Wealth Intelligence design directions

## The point of view

Wealth Intelligence should treat money as a measured system: calm enough to trust, precise enough to interrogate, and spacious enough to understand. The transferable device from the reference is not “dark mode” or orbital decoration. It is the visual grammar of an instrument—calibration marks, coordinates, crosshairs, sparse labels, and readings with an explicit time and source.

This also defines a boundary. Instrument details must carry information or establish scale; they cannot become sci-fi wallpaper. No glowing panels, fake telemetry, decorative gauges, generic KPI card grids, or icon tiles. The app is for long-horizon investors, so it should feel observational rather than urgent.

## Resolving dark versus light

The proposed dark public landing page and lighter authenticated workspace is the strongest solution. The public experience has a short attention window and can be dramatic. The workspace has long reading sessions, more data, and more varied ambient conditions; a light field is more comfortable and makes dense tables easier to scan.

The challenge is that these cannot feel like two unrelated brands. They should not be simple color inversions, either. They must share the same typography, hairline geometry, crosshair interaction, annotation syntax, chart behavior, square-ended controls, and disciplined use of purple. In this interpretation, `DESIGN.md`’s white-dominant principle applies to the authenticated workspace, while the public site becomes the deliberate exception.

## Direction 1 — The Observatory (recommended)

**Idea in one sentence:** The public site is a dark, distant view of a financial life; signing in brings the same instrument into a warm, daylight control surface built for sustained use.

### Type treatment

- **Headlines:** Space Grotesk, 500–600 weight, tight but not compressed, sentence case by default. Its geometric construction carries the reference’s technical confidence without turning futuristic.
- **Body and navigation:** Geist, 400–500 weight, with generous line height and compact labels.
- **Numbers, timestamps, axes, and annotations:** IBM Plex Mono, 400–500 weight, with `font-variant-numeric: tabular-nums slashed-zero`. Important numbers remain mono rather than merely inheriting tabular numerals from the body face.
- Display headlines may be large, but authenticated page titles stay restrained. Small instrument labels use uppercase only when short, with modest tracking; prose never does.

### Color and the light/dark decision

- **Public:** a warm near-black field (`#181615`) with soft bone text (`#EEE9E2`) and muted warm gray (`#8D8780`). A luminous orchid-purple (`#C794FF`) is reserved for the primary claim, active crosshairs, and one key plotted signal. Hairlines and orbital marks use warm white at very low opacity. No green or red appears in the marketing composition.
- **Authenticated:** a warm mineral canvas (`#F5F2EC`) with near-black ink (`#211E22`), paper surfaces (`#FCFAF6`), and cool-gray structure (`#D8D2CB`). Purple deepens to `#7040C7` for accessible text, selected states, and the main series. Surfaces are separated primarily by rules, spacing, and tone—not shadows and floating cards.
- Positive and negative values use restrained green and red only as a secondary cue. Every change also includes a sign, directional arrow, and plain-language label such as `↑ +2.4% gain` or `↓ −1.1% loss`. In monochrome or screen-reader contexts, the meaning remains intact.
- Purple is the identity signal, not a surface wash. Avoid lavender backgrounds except for a selected row or focus state at low tint.

### A single large financial number

The number is a **reading**, not a slogan. `£1,284,320` (or the user’s locale and currency) sits left-aligned in IBM Plex Mono at roughly 80–96 px on a wide screen and 44–52 px on a phone, with optical grouping and tabular figures. Above it is a compact label such as `NET WORTH / ALL ACCOUNTS`; below it are the timestamp and provenance: `AS OF 31 AUG 2026 · 16:00 ET · 7 ACCOUNTS`. The period change sits on the same baseline when space allows and wraps beneath on mobile, carrying sign, arrow, percentage, and word label. Purple may mark the currency glyph or a tiny acquisition crosshair, but the monetary digits remain high-contrast ink.

### The line chart

The chart looks like a time-measurement instrument, not a stock-trading chart. The observed net-worth path is a crisp 2 px purple line with square or round line caps and no permanent glow. Historical snapshots appear as tiny neutral registration dots, becoming crosshairs on focus. Grid lines are sparse: a few hairline horizontal rules and calibrated time ticks, not graph paper. Hover or keyboard focus introduces a dotted vertical guide and a compact mono readout outside the line so the data is never obscured. Contributions, withdrawals, and rebalances use distinct marker shapes plus text labels; projections switch to a dashed line, a light confidence envelope, and the explicit word `PROJECTED`. On mobile the default view reduces labels, preserves the crosshair, and exposes a concise reading below the plot instead of a floating tooltip under the finger.

### Why it will not look like every other fintech dashboard

The layout is built around one dominant reading and one dominant plot rather than a row of equal KPI cards. Secondary facts live in aligned marginal readouts, rails, and ruled sections. Dotted orbital geometry appears only on the public hero and in rare empty/loading moments; inside the product it resolves into functional crosshairs, timeline marks, and snapshot coordinates. Icons are scarce and never sit in rounded colored tiles. Corners are modest, shadows nearly absent, and every technical mark either establishes time, scale, selection, source, or uncertainty.

### Direction-specific risk

If the public page overuses orbit graphics, the product will drift into aerospace cosplay. Use one memorable orbital field in the hero, then let the instrument language become quieter and more literal through the rest of the site and app.

## Direction 2 — The Archival Ledger

**Idea in one sentence:** Wealth is presented as a beautifully maintained longitudinal record—part scientific field notebook, part private family ledger.

### Type treatment

- **Headlines:** Instrument Sans, 500–600 weight, with a calm editorial scale and slightly tighter tracking at display sizes.
- **Body and navigation:** Source Sans 3, 400–600 weight, chosen for dense, highly legible interfaces.
- **Numbers, dates, axes, and record IDs:** Source Code Pro, 400–600 weight, with tabular numerals and slashed zero.
- Typography is deliberately mixed by role: human interpretation in sans; recorded facts in mono. Section titles sit on strong baselines rather than inside decorated header blocks.

### Color and the light/dark decision

- **Public and authenticated:** predominantly light. A warm paper field (`#F3F0E9`) carries dark plum-black ink (`#201B20`), with brighter paper (`#FCFAF5`) used sparingly for editable regions. Deep aubergine (`#5D2E91`) is the principal purple, and pale lavender (`#E8DDF4`) marks selections or ranges.
- The landing page earns drama through scale, cropping, and a single near-black “historical record” band—not a fully dark shell. This is the closest evolution of the current `DESIGN.md` and the lowest-risk direction for long sessions.
- Gain and loss use signed values, `GAIN`/`LOSS` labels, up/down arrows, and different marker shapes. Muted green (`#2F6B52`) and oxblood (`#8B3A46`) are optional reinforcements, never the sole distinction.
- Rules are warm gray rather than lavender. Purple should identify active inquiry—selected date, active series, current comparison—not divide every surface.

### A single large financial number

The value appears like the total at the head of a formal record: Source Code Pro at 72–88 px desktop and 42–48 px mobile, aligned to a visible baseline rule. Its label and date occupy a narrow left margin, creating a ledger-like reading order. A small record locator—`SNAPSHOT 0261`—and `ACTUAL` or `PROJECTED` status make provenance explicit. No gradient, pill, or colored card contains it. Change information is written as a second line: `↑ GAIN +$18,420 / +1.46% SINCE 31 JUL`.

### The line chart

The plot uses a thin aubergine line over a warm paper field, with precise horizontal rules and typographic annotations in the margins. Actual snapshots are small circles; portfolio events are notches on the time axis; estimated or projected segments are dashed and labeled directly. The chart avoids a permanent area fill. Selecting a range lightly washes the interval in lavender, while a fine crosshair connects the chosen point to a structured readout beneath the chart. Multiple series use line weight, dash pattern, and direct labels before introducing more colors. On mobile, period comparisons become vertically stacked “then / now / difference” readings paired with a simplified plot.

### Why it will not look like every other fintech dashboard

Its primary organizing device is the ruled page, not the card. Information hangs from shared baselines, dates, and margin annotations. Tables feel native to the visual system instead of being squeezed beneath a decorative dashboard. The result is closer to a contemporary archival publication than a banking portal, while record IDs, immutable snapshot language, and visible provenance make Wealth Intelligence’s genuine history feature part of the brand.

### Direction-specific risk

Without aggressive scale and cropping on the landing page, this can feel overly polite. The art direction must use oversized dates, plotted fragments, and wide empty margins to keep the public experience distinctive.

## Direction 3 — Midnight Scope

**Idea in one sentence:** The entire product is a private, low-light analytical scope in which financial signals emerge from near-black space.

### Type treatment

- **Headlines:** Manrope, 500–600 weight, with broad, clean forms and compact line-height.
- **Body and navigation:** Manrope, 400–500 weight, to keep the dark interface typographically quiet.
- **All financial values and telemetry:** Geist Mono, 400–600 weight, with tabular numerals. Large values use generous spacing; dense tables tighten without becoming terminal-like.
- Hierarchy comes from scale and luminance rather than many font weights. Micro-labels are short, tracked, and mono; never paragraphs of uppercase text.

### Color and the light/dark decision

- **Public and authenticated:** warm near-black (`#141313`) throughout, with raised working fields only slightly lighter (`#1C1A1D`). Primary text is soft white (`#F0ECEF`), secondary data is stone gray (`#969096`), and structure is visible at low contrast.
- Purple is a cool, electric orchid (`#B98CFF`) used for the active series, selection reticle, focus ring, and primary action. It does not become a glow around every object.
- Gains and losses combine `+`/`−`, arrows, the words `GAIN`/`LOSS`, and distinct solid versus hatched micro-markers. Desaturated mint and coral may reinforce meaning after these cues.
- Users may switch to a high-contrast light reading mode for tables and reports, but the default remains dark. This is a real product-wide commitment, not only a campaign skin.

### A single large financial number

The figure sits alone in a large field, left aligned, with its label and timestamp positioned like reticle coordinates. Geist Mono at 84–104 px desktop and 44–52 px mobile gives the number authority without a containing card. A thin purple crosshair touches the baseline at the most recently refreshed digit; an adjacent neutral status says `CURRENT`, `STALE`, or `PROJECTED`. The change readout is separate and fully textual so green/red is unnecessary.

### The line chart

The plot is a dark field with nearly invisible axes until interaction. A fine orchid line traces actual history; a brighter point marks the selected snapshot. Dotted vertical acquisition lines, crosshairs, and mono coordinate readouts make inspection tactile. Sparse horizontal calibration ticks replace a full grid. Forecasts use a lower-luminance dashed line and diagonally hatched uncertainty band so they remain distinct without another hue. Keyboard and touch selection lock a crosshair and place the full reading in a fixed strip below the chart.

### Why it will not look like every other fintech dashboard

It is composed as a continuous visual field, not a collection of dark rounded cards. There are no neon gradients, coins, candlesticks, glowing buttons, or ticker tape. Large quiet zones, low-chroma surfaces, calibrated markings, and one active signal create focus. Dense views use aligned data rails and thin separators rather than turning every metric into a widget.

### Direction-specific risk

This is the strongest brand statement and the closest to the reference, but it is the weakest fit for long sessions, printable reports, bright environments, and the current white-dominant guidance. A light reading mode would add design and QA cost while diluting the purity of the concept. It should only be chosen if the brand value of an all-dark product outweighs that usability tradeoff.

## Recommendation

Choose **The Observatory**. It preserves the emotional impact of the reference where drama is useful and preserves the light, durable workspace where financial comprehension matters most. More importantly, it turns the dark/light conflict into a product narrative: the landing page reveals the scale of a financial life; the authenticated product brings that life into focus.

The non-negotiable element is the shared instrument grammar. Purple marks the active signal. Mono marks measured facts. Crosshairs indicate inspection. Dashes indicate uncertainty or projection. Muted rules establish scale. Empty space establishes hierarchy. Those meanings must remain stable across public, authenticated, desktop, and phone experiences.

## Decision snapshot

| Direction | Public site | Authenticated workspace | Distinctive strength | Principal tradeoff |
| --- | --- | --- | --- | --- |
| The Observatory | Dark | Warm light | Best balance of brand drama and data endurance | Requires disciplined continuity across two surfaces |
| The Archival Ledger | Warm light with one dark feature band | Warm light | Makes immutable history and provenance feel native | Less immediate visual drama |
| Midnight Scope | Dark | Dark, with optional light reading mode | Boldest and closest to the reference | Long-session comfort and extra mode complexity |

## Selection gate

No component or token implementation should begin until one direction is selected. Once selected, the next design phase should define a small set of signature compositions—the public hero, dashboard overview, net-worth history, holdings table, and mobile history inspection—before translating the direction into reusable tokens or components.
