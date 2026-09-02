---
name: Midnight Scope
description: A warm-dark, instrument-grade workspace for inspecting personal wealth over time.
colors:
  canvas: "#211F1E"
  surface: "#292625"
  quiet: "#302C2A"
  ink: "#F3EEE9"
  muted: "#C5BCB4"
  faint: "#998E86"
  rule: "#4A443F"
  strong-rule: "#6F665F"
  violet: "#BAA5FF"
  violet-deep: "#D4C7FF"
  violet-wash: "#393044"
  gain: "#7CDDB0"
  loss: "#FF9EAA"
  warning: "#F1C775"
  warning-surface: "#30291F"
  warning-rule: "#80673A"
  warning-ink: "#F3D9A1"
  focus: "#EFE9FF"
  public-canvas: "#171514"
  public-surface: "#201D1C"
  public-quiet: "#282422"
  public-ink: "#F6F0EA"
  public-muted: "#C9BEB5"
  public-faint: "#998E86"
  public-rule: "#413B37"
  public-strong-rule: "#625A54"
  public-violet: "#C4B0FF"
  public-violet-deep: "#DED3FF"
  public-violet-wash: "#383043"
  public-gain: "#86E2B6"
  public-loss: "#FFA6AF"
  public-warning: "#F0CA7D"
  public-focus: "#F0EAFF"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontWeight: 500
    lineHeight: 1.03
    letterSpacing: "-0.035em"
  body:
    fontFamily: "IBM Plex Sans, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.52
  mono:
    fontFamily: "IBM Plex Mono, monospace"
    fontWeight: 400
    fontFeature: "tabular-nums"
rounded:
  control: "6px"
  button: "7px"
  segmented: "8px"
spacing:
  8: "8px"
  12: "12px"
  16: "16px"
  20: "20px"
  24: "24px"
  30: "30px"
  36: "36px"
  44: "44px"
  52: "52px"
  70: "70px"
  72: "72px"
components:
  button-primary:
    backgroundColor: "{colors.violet}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.button}"
    padding: "9px 13px"
  nav-active:
    backgroundColor: "{colors.quiet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
---

# Design System: Midnight Scope

## Overview

**Creative North Star: “The Midnight Scope.”**

Midnight Scope is a private, warm-dark financial instrument: quiet enough for sustained reading and exact enough for evidence-led inspection. The authenticated workspace is a continuous field of `#211F1E`, not a collection of floating dark cards. Wealth is presented as a measured record, never market theatre.

The visual system has one stable grammar across overview, holdings, history, and future modelling. Purple identifies the reader’s active inquiry; the remaining palette creates scale, status, and legibility without decoration. This replaces The Observatory’s light authenticated workspace entirely.

## Colors

All values below are normative and taken from the revised mockups.

| Token | Value | Fixed role |
| --- | --- | --- |
| Canvas | `#211F1E` | Authenticated workspace field and the interior of selected chart points. |
| Surface | `#292625` | Raised or bounded working surface when a tonal separation is genuinely needed. |
| Quiet | `#302C2A` | Active-navigation field and low-emphasis selected background. |
| Primary ink | `#F3EEE9` | Primary reading, headings, and high-confidence values. |
| Secondary label | `#C5BCB4` | Supporting labels, explanatory copy, and axis text. |
| Muted metadata | `#998E86` | Timestamps, overlines, provenance, and low-priority metadata. |
| Rule | `#4A443F` | Default table rule, chart grid, and structural alignment line. |
| Strong rule | `#6F665F` | Higher-emphasis boundaries, segmented-control outlines, and deliberate section starts. |
| Active signal | `#BAA5FF` | Selected period, active control, crosshair, primary action, and active signal marker. |
| Active signal, strong | `#D4C7FF` | The observed chart line and selected point stroke. |
| Active signal wash | `#393044` | Restrained selected-state wash only. |
| Gain | `#7CDDB0` | Positive performance reinforcement. |
| Loss | `#FF9EAA` | Negative performance reinforcement. |
| Warning | `#F1C775` | Stale, incomplete, or attention-required data. |
| Warning surface / rule / ink | `#30291F` / `#80673A` / `#F3D9A1` | Bounded stale-data callout. |
| Focus | `#EFE9FF` | Keyboard focus outline. |

The public exterior uses the same grammar with its exact existing field tokens: canvas `#171514`, surface `#201D1C`, quiet `#282422`, ink `#F6F0EA`, muted `#C9BEB5`, faint `#998E86`, rule `#413B37`, strong rule `#625A54`, violet `#C4B0FF`, strong violet `#DED3FF`, violet wash `#383043`, gain `#86E2B6`, loss `#FFA6AF`, warning `#F0CA7D`, and focus `#F0EAFF`. These are for public presentation only; authenticated workspace tokens above remain authoritative for product work.

Purple is scarce: it is the active signal, never decorative fill. Do not use gradients, glows, glass effects, neon, or colorized KPI tiles. Gain, loss, warning, selection, and freshness always retain a textual or geometric cue.

## Typography

- **Newsreader** (`500`): display face for page statements, brand, empty-state headings, and large financial readings. It supplies warm editorial authority; it is not body copy.
- **IBM Plex Sans** (`400`, `500`, `600`): reading face for body text, navigation, security names, controls, and explanations. Default text is `15px/1.52`.
- **IBM Plex Mono** (`400`, `500`, `tabular-nums`): measured facts—currency, percentages, dates, times, tickers, axes, freshness, deltas, and dense numeric columns. Never use it as prose decoration.

Text hierarchy is luminance-first and fixed:

| Level | Color | Use |
| --- | --- | --- |
| Primary reading | `#F3EEE9` | Headlines, key values, table values, and decisive labels. |
| Secondary label | `#C5BCB4` | Labels that explain a nearby primary reading, navigation, and axes. |
| Muted metadata | `#998E86` | Overlines, timestamps, account provenance, and contextual detail. |

Use compact uppercase mono labels only for short metadata. Large Newsreader text may use negative tracking; ordinary text and mono measurements do not.

## Layout

The application content area is `1240px` maximum width, centered. Main page padding is `44px clamp(20px, 4vw, 52px) 72px`; at narrow widths it becomes `30px 20px 48px`. The top navigation is `72px` high desktop and `62px` on mobile.

Use the observed spacing scale: `8, 12, 16, 20, 24, 30, 36, 44, 52, 70, 72px`. A primary page statement has roughly `42px` before the next major region. Two-column evidence layouts use `36–70px` separation and collapse to one column below `780px`.

Empty space establishes hierarchy: one principal reading or chart owns the field, with related evidence aligned beside or beneath it. Do not replace this with equal-weight card grids. Containers are flat; rules and tonal shifts, not elevation, create grouping.

Navigation is centered in the top bar between the brand and contextual metadata. Use this pattern while the primary destinations remain few, peer-level, and frequently switched. A sidebar becomes the right choice only when the app gains persistent secondary navigation, deeply nested sections, many workspace-level controls, or task context that must remain visible while content scrolls.

## Elevation & Depth

Midnight Scope is flat by default. There are no ambient shadows in the authenticated workspace. Separate layers with the canvas/surface/quiet tones, a `1px` rule, and intentional breathing room. The only illustrated depth is the device frame in the mobile mockup; it is not an app-surface pattern.

## Shapes

Geometry is restrained and functional: `6px` for navigation controls, `7px` for buttons, `8px` for segmented controls, and full rounding only for status dots or compact tags. Rules are `1px`. Avoid large rounded cards, pills used as decoration, and ornamental containers.

## Components

### Charts

- Actual observed path: `3.5px`, no area fill, `#D4C7FF`.
- Projection or uncertain continuation: `2.5px`, `#C5BCB4`, `7 6` dash pattern, with direct text naming it as projected, estimated, stale, or unavailable as appropriate.
- Grid: sparse `1.25px` `#4A443F` horizontal rules. Axes use `11px` IBM Plex Mono in `#C5BCB4`; never turn the field into graph paper.
- Inspection: a selected datum receives a `1px` `#BAA5FF` vertical and horizontal crosshair, plus a `12px` hollow point with a `2px` `#D4C7FF` stroke. Pair it with an explicit date/value reading in text; the crosshair is not a color-only state.
- Multi-series comparisons must use direct labels, line weight, or dash pattern before adding colors.

### Tables and dense data

Tables are measurements, not card collections. Left-align names; right-align figures; set all numeric columns in IBM Plex Mono with tabular figures. Keep the security name in IBM Plex Sans and allow it to wrap to two lines without colliding with its facts.

Dark fields need more air and more disciplined rules: table body cells use `16px 10px` padding, headers use `0 10px 11px`, and each row begins with a `1px #4A443F` rule. Reserve `#6F665F` for a meaningful boundary, not every row. On small screens, preserve essential columns with horizontal scrolling (`720px` table minimum) rather than compressing numerical facts into ambiguity.

### Navigation and controls

The centered top nav uses IBM Plex Sans at `13px`. Inactive destinations are `#C5BCB4`; the active destination is `#F3EEE9` on `#302C2A` with a `#BAA5FF` inset bottom rule. Primary buttons use `#BAA5FF` with `#211F1E` text; secondary buttons are transparent with a `#6F665F` border.

### Status and uncertainty

Stale data is a bounded warning callout with `#30291F` background, `#80673A` border, `#F3D9A1` text, an exclamation marker, and the exact last-known timestamp. Dashes in text or an underline indicate uncertainty only when supporting copy explains it.

## Do's and Don'ts

### Do:

- **Do** use purple only for the active signal: selection, crosshair, primary action, and the single observed series the reader should follow.
- **Do** pair gain/loss color with a signed number and directional mark (`↗ +` or `↘ −`), and name status in text where context could be lost.
- **Do** use crosshairs for inspection, dashes for uncertainty or projection, and rules for scale.
- **Do** preserve a text equivalent for every selected chart reading, freshness status, and chart distinction.
- **Do** honor `prefers-reduced-motion`; the optional inspection settle is `0.8s cubic-bezier(.2,.8,.2,1)` and must be removed when motion is reduced.
- **Do** meet WCAG 2.1 AA: at least `4.5:1` for normal text, `3:1` for large text, UI component boundaries, and focus indicators.

### Don't:

- **Don't** revive a light authenticated field, The Observatory naming, or the old split public/light-workspace system.
- **Don't** use color alone for gain/loss, freshness, selection, projection, or uncertainty.
- **Don't** add permanent chart glows, filled areas by default, dense grids, stock-ticker theatre, or decorative telemetry.
- **Don't** animate numbers in a way that delays or obscures the final financial reading.
