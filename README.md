# Agro Cloud

## [→ Open the app ←](https://alkamelgis.github.io/AgroCloud/#/)

### GitHub Pages

**Live site:** [https://alkamelgis.github.io/AgroCloud/#/](https://alkamelgis.github.io/AgroCloud/#/) (HashRouter).

The [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) workflow builds the frontend with empty public env vars, copies the output to the **`main` branch root**, and pushes with `[pages-sync]`. In repository **Settings → Pages**: **Deploy from a branch** → **`main`** → **`/(root)`**.

**Important:** Root `assets/` and `index.html` are listed in `.gitignore` — **do not commit them from your local machine** (a local `.env` may be merged and the push rejected). Updates go through **CI only**.

**If you see 404 while `index.html` exists on `main`:** Pages may still be set to **GitHub Actions (workflow)** instead of branch deploy. The workflow runs `scripts/ensure-pages-legacy-main.mjs` to set **legacy + main + /**. If the API rejects the default token, add a **`PAGES_ADMIN_TOKEN`** secret (repo or Administration+Contents scope).

### Updates not showing on the live site?

1. Confirm your change is **merged into `main`** (not only on a feature branch) and the latest push ran **Deploy to GitHub Pages** successfully under **Actions**.
2. If the workflow failed or did not run: **Actions** → **Deploy to GitHub Pages** → **Run workflow** (manual run on `main`).
3. The live site serves **`index.html` and `assets/` at the root of `main`** after the CI build — not directly from `frontend/src`.
4. Try a **hard refresh** (Ctrl+F5) or a private window; GitHub Pages can cache static files aggressively.
5. Do not put **`[pages-sync]`** in your commit message if you expect a deploy (the workflow skips commits with that text to avoid loops).

**Documentation:** [REPOSITORY.md](REPOSITORY.md) · [DEPLOYMENT.md](DEPLOYMENT.md) (production hosting, HTTPS, API, monitoring)
