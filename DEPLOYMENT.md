# AgroCloud — production deployment

## Live application (frontend)

| Item | Value |
|------|--------|
| **Public URL** | [https://alkamelgis.github.io/AgroCloud/#/](https://alkamelgis.github.io/AgroCloud/#/) |
| **Hosting** | GitHub Pages (branch `main`, site root) |
| **HTTPS** | Provided by `*.github.io` (Let's Encrypt) |
| **CDN** | GitHub / Fastly edge (global) |
| **PWA** | Enabled on production builds (install on mobile) |
| **Compression** | Brotli + gzip precompressed assets at build time |
| **Caching** | Service Worker (Workbox) + browser cache for static assets |

Every push to `main` (except automated `[pages-sync]` commits) runs **[Deploy to GitHub Pages](.github/workflows/deploy-pages.yml)**, which builds the SPA without local secrets and syncs `frontend/dist` to the repository root.

### GitHub Pages settings

**Settings → Pages → Build and deployment**

- **Source:** Deploy from a branch  
- **Branch:** `main`  
- **Folder:** `/ (root)`

If the site shows 404 while `index.html` exists on `main`, run the workflow manually or ensure **legacy branch deploy** is active (the workflow runs `scripts/ensure-pages-legacy-main.mjs`).

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Users (desktop / mobile / tablet — any browser)            │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Pages — static SPA (React + Vite + PWA)             │
│  https://alkamelgis.github.io/AgroCloud/                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
  Mapbox / ArcGIS      Gemini / weather      Optional Node API
  (tokens in browser   (external HTTPS)      (your VPS / Docker)
   or build-time)                           reverse proxy + TLS
```

**GitHub Pages serves only the frontend.** Maps, satellite layers, and AI features that call third-party APIs work from the browser when tokens are configured under **System Settings → API Tokens** (stored in the browser and optionally synced to your API server).

Features that call **`/api/*`** (login email, admin directory, server-side API secrets) require a **separately hosted Node backend** (see below).

---

## Full-stack hosting (recommended for teams)

For API routes, WebSockets, SMTP, and serving the SPA from the same origin (simplest CORS):

### Option A — Docker (single server)

```bash
# On a VPS with Docker, clone the repo and set production env (see .env.production.example)
docker build -t agrocloud .
docker run -d --name agrocloud -p 443:3001 \
  -e NODE_ENV=production \
  -e APP_ORIGIN=https://your-domain.com/AgroCloud \
  -e CORS_ALLOWED_ORIGINS=https://your-domain.com,https://alkamelgis.github.io \
  -v /data/agro:/app/backend/server \
  agrocloud
```

Put **nginx** or **Caddy** in front for TLS termination and HTTP/2. Example nginx snippet: [scripts/nginx-agrocloud.conf.example](scripts/nginx-agrocloud.conf.example).

### Option B — GitHub Pages + API on VPS

1. Keep the public app on GitHub Pages (this repo’s CI).  
2. Run `backend` on a VPS (Hostinger, Azure, AWS, etc.) with HTTPS.  
3. At build time (private CI or server build), set:
   - `VITE_AGRI_API_SECRETS_URL=https://api.your-domain.com/api/system/api-secrets`
   - `VITE_AGRI_USER_PROFILE_URL=https://api.your-domain.com/api/v1/account/profile-extra`
   - `VITE_AGRI_ADMIN_DIRECTORY_URL=https://api.your-domain.com/api/v1/admin/directory`
4. Set backend `CORS_ALLOWED_ORIGINS=https://alkamelgis.github.io`.

---

## Environment variables

| File | Purpose |
|------|---------|
| [.env.example](.env.example) | Local development |
| [docs/env.production.example](docs/env.production.example) | Production / VPS / private CI |

Never commit real API keys. GitHub Actions builds with **empty** `VITE_*` secrets.

---

## Performance checklist (already in repo)

- Vite code-splitting and hashed asset names  
- `buildCompressionPlugin()` — `.br` / `.gz` siblings for JS/CSS  
- PWA precache for shell and fonts  
- Tablet/mobile responsive CSS  
- Lazy-loaded heavy routes (maps, satellite, dashboards)

---

## Monitoring and logs

| Layer | Mechanism |
|-------|-----------|
| **CI** | [production-health.yml](.github/workflows/production-health.yml) — smoke-checks live URL after deploy |
| **Browser** | `initClientErrorMonitoring()` — ring buffer in `sessionStorage`; optional `VITE_CLIENT_ERROR_REPORT_URL` |
| **Server** | Node process logs to stdout; mount persistent volumes for `agri_*.json` data files |
| **External** | Optional: Sentry, Datadog, or Azure App Insights (point `VITE_CLIENT_ERROR_REPORT_URL` to your collector) |

---

## Browser and device support

Test matrix (manual QA recommended after each major release):

| Platform | Browsers |
|----------|----------|
| Windows | Chrome, Edge, Firefox |
| macOS | Chrome, Safari, Firefox |
| Android | Chrome, Samsung Internet |
| iOS / iPadOS | Safari (add to Home Screen for PWA) |

Use **hard refresh** (Ctrl+F5) after deploys because static assets are cached aggressively.

---

## Security

- HTTPS only on public endpoints  
- CORS restricted via `CORS_ALLOWED_ORIGINS` on the Node server  
- API secrets file protected with `AGRI_API_SECRETS_TOKEN` when exposed  
- GitHub Pages build never embeds local `.env` values  
- See [SECURITY.md](SECURITY.md) and [docs/SECURE_DEPLOYMENT.md](docs/SECURE_DEPLOYMENT.md) for secret handling and incident response  

---

## Quick commands

```bash
# Local full stack
npm install && npm run dev

# Production frontend build (matches CI)
ENABLE_PWA=true npm run build

# Sync to repo root (maintainers — CI normally does this)
node scripts/pages-dist-check.mjs
node scripts/sync-pages-dist-to-root.mjs --git-add
```

For repository layout and development, see [REPOSITORY.md](REPOSITORY.md).
