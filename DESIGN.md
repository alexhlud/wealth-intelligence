# Design — The Observatory

## Direction

The Observatory is a calm instrument panel for long-horizon investors. It
turns personal wealth into something one can inspect: measured, legible, and
honest about the limits of the data. It is not a trading terminal and never
uses urgency, celebration, or market-theater as decoration.

Public pages are nocturnal and expansive, like looking through a precisely
made viewing instrument. Authenticated work is daylight-bright and quieter,
like a well-kept field notebook. The same signal grammar connects both.

## Instrument grammar

- Purple is the active signal: the selected period, focused datum, primary
  action, or one line a reader should follow. It is never decorative fill.
- IBM Plex Mono is for measured facts: dates, values, percentages, tickers,
  price freshness, axes, and comparison deltas. Financial figures use tabular
  numerals.
- Fine crosshairs mark inspection. They identify a selected chart point or
  a focused comparison without relying on color alone.
- Dashed strokes mean uncertainty, estimates, unavailable live data, or
  projections. Supporting copy must name which of these applies.
- Hairline rules establish scale and alignment. They should organize a
  composition, not outline every container.
- Empty space is hierarchy. A primary number, chart, or statement earns
  substantial unoccupied room; secondary information compacts around it.

Gain and loss always pair color with a signed value and directional mark:
`+` / upward-right for gains, `−` / downward-right for losses. Selected data
has a crosshair and explicit date/value label; projections have a dashed
line and label. Freshness is never communicated by color alone.

## Color systems

### Public / dark observation

- Canvas: `#09090D`
- Raised field: `#111118`
- Instrument panel: `#171720`
- Rule / quiet grid: `#2A2935`
- Primary ink: `#F4F2F8`
- Secondary ink: `#B9B5C4`
- Muted measurement: `#817D8D`
- Active signal: `#A78BFA`
- Active signal, strong: `#C4B5FD`
- Gain: `#75D6A6`
- Loss: `#F18B97`
- Warning / stale: `#E5B76A`
- Focus ring: `#D8CCFF`

### Authenticated / light fieldbook

- Canvas: `#F8F8F6`
- Surface: `#FFFFFF`
- Quiet surface: `#F1F0ED`
- Selected field: `#EEEAFE`
- Structural rule: `#D9D7D2`
- Strong rule: `#BDBAB3`
- Primary ink: `#17161B`
- Secondary ink: `#625F68`
- Muted measurement: `#817D85`
- Active signal: `#6D4CCB`
- Active signal, strong: `#5135AE`
- Gain: `#177B54`
- Loss: `#B54453`
- Warning / stale: `#966313`
- Focus ring: `#5B3CC4`

Text and interactive states meet WCAG AA contrast. Warning surfaces retain
their status label and time. Do not introduce gradients, glows, or glass as
an identity substitute.

## Typography

- **Space Grotesk** carries display headings and large, human-facing wealth
  statements. It is confident, compact, and used sparingly.
- **Geist** carries navigation, labels, body copy, actions, and explanatory
  language. It is the everyday reading voice.
- **IBM Plex Mono** carries measurements and all numerical systems. Its
  tabular numerals keep changing figures stable and visually comparable.

Headings are direct and unprefixed by decorative eyebrows. Use clear scale
steps, moderate negative tracking only on large Space Grotesk display text,
and readable line lengths. Never use mono for prose decoration.

## Composition and responsiveness

Desktop work uses a broad field with one dominant observation and aligned
secondary evidence. Avoid grids of equally weighted cards. On smaller
screens, preserve the primary observation first, then stack related evidence
in reading order. Tables become labelled records or horizontally scrollable
measurements only when their columns are essential.

Public compositions may use an almost-black field, wide margins, and a
single vivid signal. Authenticated compositions use warm light surfaces,
precise rules, and fewer containers. Mobile inspection makes the selected
date and value persistent, then places the chart beneath it with a clear
touch target for inspection.

## Charts and tables

Charts favor one active path, thin neutral reference lines, labelled axes,
and a precise inspection state. Area fills are unnecessary by default.
Live observations are solid; projections and unavailable regions are dashed.
Tooltips or selected summaries include the full date, value, and relevant
freshness or source context.

Tables prioritize scanability over density: left-align names, right-align
measures, reserve mono for numerical columns, and use rules to establish rows
rather than boxed cells. Long security names may wrap to two lines without
colliding with values. A stale quote displays its last successful timestamp;
an empty table states what is absent and offers the next appropriate action.

## Interaction, accessibility, and motion

Every keyboard focus state uses the focus color with a visible outline.
Controls name their action; icon-only controls have accessible names. Do not
make color the sole indication of performance, selection, projection, or
staleness. Charts provide an equivalent selected-data summary in text.

Motion is restrained: one purposeful inspection transition (crosshair and
selected data settling into place) may run around 180–240ms with an ease-out
curve. All motion respects `prefers-reduced-motion`; no number should animate
in a way that obscures its final value.
