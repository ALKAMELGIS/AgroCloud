# Legacy global CSS (sunset order)

Do not add new rules here unless bridging MUI migration.

1. **Keep until shell QA passes:** `app-design-system.css`, `theme-system.css`, `mobile-app.css`
2. **Module-by-module removal:** GIS (`gisModalSystem.css`), operations (`EC.css` consumers)
3. **Last:** `geodash-tailwind.css` when no `@apply` / utility consumers remain
4. **MUI replaces:** duplicate modal rules in `index.css` vs `app-design-system.css`

New UI must use `frontend/src/theme/*` and MUI components under `frontend/src/components/`.
