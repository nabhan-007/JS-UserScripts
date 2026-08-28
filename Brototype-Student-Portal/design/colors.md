# MNM Portal Companion — Color Palette

Single source of truth for all colors in the script. Every color used in the codebase must map to a token here. If it's not listed, it shouldn't be in the code.

The `COLORS` object in `modules/core.js` is the code-level source of truth. This document is the design-level reference.

## Neutral Scale

| Token | Hex | Usage |
|-------|-----|-------|
| `text-primary` | `#1a1a1a` | Body text, card titles, primary labels |
| `text-secondary` | `#444` | Description text, off-state labels |
| `text-muted` | `#888` | Version text, secondary info |
| `text-faint` | `#b8b8b8` | Section headers, kbd text, close buttons |
| `surface` | `#fff` | Card backgrounds, button backgrounds (light mode) |
| `surface-hover` | `#f7f7f7` | Card/button hover background |
| `border-light` | `#e2e2e2` | All borders — cards, segments, kbd, switches |
| `border-separator` | `#efefef` | Row separators, footer dividers |
| `overlay-scrim` | `rgba(0,0,0,0.5)` | Modal backdrop |
| `shadow-card` | `rgba(0,0,0,0.08)` | Card drop shadow |
| `shadow-lifted` | `rgba(0,0,0,0.15)` | Elevated card shadow (update modal) |

### Dark Mode Neutrals

| Token | Value | Notes |
|-------|-------|-------|
| `dm-border` | `rgba(255,255,255,.25)` | Visible on dark bg |
| `dm-segment-bg` | `rgba(255,255,255,.06)` | Subtle container tint |
| `dm-hover` | `rgba(255,255,255,.12)` | Hover feedback |
| `dm-spinner` | `rgba(255,255,255,0.25)` | Overlay spinner ring |

## Action Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `action-primary` | `#111` | Done button, switch checked, icon badges |
| `action-primary-hover` | `#333` | Button hover when bg is #111 |

## Status Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `status-pass` | `#109d58` | "Passed" badge, pass rate >= 50% |
| `status-fail` | `#db4437` | "Failed" badge, fail rate < 50% |
| `status-absent` | `#9a9a9a` | "Absent" badge, description text |

## Danger (Settings Reset)

| Token | Hex | Usage |
|-------|-----|-------|
| `danger-text` | `#c0392b` | Reset ALL label |
| `danger-border` | `#f0cdcd` | Reset ALL border |
| `danger-border-hover` | `#e8b7b7` | Reset ALL border hover |
| `danger-bg` | `#fdf7f6` | Reset ALL background |
| `danger-bg-hover` | `#fbeeed` | Reset ALL background hover |

## Accent (Topic Counter)

| Token | Hex / Value | Mode | Usage |
|-------|-------------|------|-------|
| `accent-text` | `#1a6ddb` | Light | Counter number |
| `accent-bg` | `#eaf1fc` | Light | Counter pill background |
| `dm-accent-text` | `#7db4f5` | Dark | Counter number |
| `dm-accent-bg` | `rgba(125,180,245,.2)` | Dark | Counter pill background |

## Warning (Upload Tip)

| Token | Hex | Usage |
|-------|-----|-------|
| `warning-icon-bg` | `#fdf0ef` | Tip toast icon background |

## Rules

1. **One border gray** — use `border-light` everywhere. No `#e4e4e4`, `#e6e6e6`, or `#eee` variants.
2. **One hover gray** — use `surface-hover`. No `#fafafa` as hover.
3. **One danger pink** — use `danger-bg`. No `#fbeeed`, `#fdf0ef`, or `#f0cdcd` for backgrounds.
4. **One red** — use `status-fail` (`#db4437`). Not `#c0392b` for status (keep it for danger-text only).
5. **One accent** — blue counter only. Don't add green/orange/other accents.
6. **Dark mode**: check `parseInt(bodyBg[0]) < 80`. Flip border/hover/bg to white-based `rgba` values.
7. **New colors**: add to `COLORS` in `core.js` AND update this file. Both must stay in sync.
