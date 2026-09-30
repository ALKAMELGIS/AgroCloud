# Agri Cloud — repository documentation

> **GitHub Pages:** سير `deploy-pages.yml` يبني ثم يزامن `frontend/dist` إلى **جذر `main`** (`[pages-sync]`). الإعدادات: **Deploy from a branch** → **main** → **/**. مخرجات الجذر مُتجاهلة في git محلياً (`.gitignore`) — الالتزام من CI فقط.
>
> **رابط التشغيل (HashRouter):** https://alkamelgis.github.io/AgroCloud/#/
>
> **GitHub Pages:** `deploy-pages.yml` copies the build to **main** repo root. Pages: **main** / **(root)**. Root deploy outputs are **gitignored** locally; only CI commits them (avoids embedding local `.env` secrets).
>
> **App URL:** https://alkamelgis.github.io/AgroCloud/#/

Agri Cloud is a monorepo containing a React/Vite frontend and an Express backend.

## Project Structure

```text
.
├─ frontend/
│  ├─ src/
│  │  ├─ app/             # entry, routes, providers, layouts, startup
│  │  ├─ core/            # auth, authorization, config, api, state, routing, hooks
│  │  ├─ modules/         # features: gis, remote-sensing, ai, operations, forms,
│  │  │                   #   dashboards, reports, master-data, data-management
│  │  ├─ roles/           # who may use which module (no copied feature code)
│  │  ├─ shared/          # reusable UI: components, layouts, maps, charts, dialogs
│  │  ├─ data/            # domains, schemas, templates, seeds, samples
│  │  └─ assets/          # styles, images, icons, logos, fonts
│  ├─ public/             # static assets
│  └─ config/
├─ backend/
│  ├─ server/             # current runtime entrypoint
│  ├─ src/
│  │  ├─ config/
│  │  ├─ routes/
│  │  │  ├─ v1/
│  │  │  └─ v2/
│  │  ├─ controllers/
│  │  ├─ middleware/
│  │  ├─ models/
│  │  └─ services/
│  ├─ tests/
│  └─ docs/
├─ services/              # auxiliary microservices (geodash-api)
├─ analysis_engine/       # Python analysis engine
├─ sentinel-crop-alert/   # standalone Sentinel crop alert app
├─ tools/                 # Python report / chart utilities
├─ scripts/               # build, deploy and dev scripts (used by npm & CI)
├─ core/                  # docs, database SQL, standalone tools, Windows launchers
└─ .github/workflows/
```

## Requirements

- Node.js 18+
- npm 9+

## Install

From repository root:

```bash
npm install
```

## Development

- Frontend + backend:

```bash
npm run dev
```

- Frontend only:

```bash
npm run dev:client
```

- Backend only:

```bash
npm run dev:server
```

## Build and Preview

```bash
npm run build
npm run preview
```

Frontend output is generated in `frontend/dist`.

## Testing

```bash
npm run typecheck
npm test
npm run test:e2e
```

## Notes

- System settings are stored in browser localStorage under `agri_system_settings_v1`.
- Versioned backend routes are available under `/api/v1` and `/api/v2`.
- Existing legacy API endpoints remain backward-compatible.
