# Wealth Intelligence design directions

## Decision — Midnight Scope selected

**Date:** 2026-09-01

**Selected direction:** Midnight Scope

**Authenticated workspace:** warm dark `#211F1E`
**Display face:** Newsreader

Midnight Scope was selected over The Observatory. The team chose a single private, low-light analytical field for authenticated work instead of The Observatory’s dark public shell paired with a warm-light workspace. This better preserves the desired immersive, instrument-like character across the product and avoids asking users to cross an unnecessary visual boundary when signing in.

The selected direction is not generic fintech dark mode. Its identity comes from a fixed instrument grammar: purple marks the active signal, mono marks measured facts, crosshairs mark inspection, dashes mark uncertainty or projection, rules establish scale, and empty space establishes hierarchy. The warm-dark field keeps dense financial data calm while Newsreader gives large statements a considered, human reading voice.

The tradeoff is deliberate: dark data surfaces need more spacing, more careful rule contrast, explicit non-color status cues, and strong focus treatment to remain comfortable and accessible over long sessions. The canonical requirements now live in `DESIGN.md`; future implementation must follow them before introducing components or tokens in `src/`.

## Superseded direction — The Observatory

The Observatory’s split dark-public / light-authenticated concept is no longer the active direction. Its durable insight—the instrument grammar—was retained. Its light workspace, Space Grotesk/Geist type pairing, and brand framing were superseded by Midnight Scope’s warm-dark authenticated environment and Newsreader/IBM Plex pairing.

## Scope boundary

This decision records design direction only. No `src/` implementation begins in this step. The next implementation phase must be planned and reviewed separately under the project working agreement.
