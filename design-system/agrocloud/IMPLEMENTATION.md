# AgroCloud design system — implementation guide

Generated recommendation: `MASTER.md` (UI UX Pro Max). This file says where it lives in code and how to use it.

## Sources of truth

| Layer | File | Used by |
|---|---|---|
| Tokens (colors, radius, motion, elevation, fonts) | `frontend/src/theme/tokens.ts` | MUI theme, canvas/map overlays |
| MUI theme + component overrides | `frontend/src/theme/createAgroTheme.ts`, `components.ts`, `palette.ts`, `typography.ts` | every MUI component |
| CSS custom properties (`--ds-*`) | `frontend/src/assets/styles/agro-premium.css` (loaded last) | legacy CSS pages, map chrome |
| Shared page kit | `frontend/src/components` (`PageContainer`, `PageHeader`, `StatePanel`, `KpiCard`, `SectionHeader`, `ResponsiveDataTable`) | all non-map pages |
| Living reference | route `/style-guide` | team |

`tokens.ts` and `agro-premium.css` must stay in sync. Light/dark is driven by `<html data-theme>` (set by System Settings); the "custom" accent writes `--ds-color-primary*` inline and is passed to the MUI theme as `customPrimary`.

## Palette (both modes pass WCAG AA 4.5:1 for text)

| Token | Light | Dark |
|---|---|---|
| primary | `#047857` | `#22C55E` (ink on it: `#05200F`) |
| accent (harvest gold) | `#A16207` | `#EAB308` |
| secondary (GIS blue) | `#0369A1` | `#38BDF8` |
| bg / surface | `#F4F7F5` / `#FFFFFF` | `#0B1210` / `#121B17` |
| text / secondary / muted | `#17241E` / `#475569` / `#5F6B66` | `#E6EDE9` / `#A9B8B0` / `#8A9992` |

## Rules for new UI

- Build pages as `PageContainer` → `PageHeader` → cards. Empty / error / offline / coming-soon states use `StatePanel`.
- No raw hex in components; use theme palette or `var(--ds-*)`. Data colors (NDVI ramps, severities, chart series) are exempt.
- Dark-mode filled primary buttons use `var(--ds-color-on-primary)` text, never white.
- Labels above fields, errors next to the field, 44px touch targets and 16px inputs on phones.
- Wide tables go inside `.ds-table-wrap` (scrolls itself, sticky header) — the page never scrolls horizontally.
- Floating map panels use glass: `--ds-glass-bg`, `--ds-glass-border`, `backdrop-filter: blur(var(--ds-glass-blur))`, `--ds-shadow-md`.
- Use logical CSS properties (`margin-inline-start`) — the app runs in Arabic RTL too.

## Tooling

- UI UX Pro Max skill: `.claude/skills/ui-ux-pro-max` — e.g. `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "data table" --domain ux`.
- 21st.dev Magic MCP: configured in `.mcp.json`, reads the key from `TWENTY_FIRST_API_KEY`. Export the variable before starting Claude Code and check with `/mcp`.
