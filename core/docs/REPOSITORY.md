# AgroCloud — repository documentation

> **GitHub Pages:** `deploy-pages.yml` builds the SPA and publishes it to **`main:/docs`** (`[pages-sync]` commits). Pages: **Deploy from a branch** → **main** → **/docs**. `docs/` is gitignored locally; only CI commits it (a local `.env` would otherwise be embedded).
>
> **App URL (HashRouter):** https://www.eliteagrocloud.com/#/

AgroCloud is a monorepo containing a React/Vite frontend and an Express backend.

## Project structure

The repository tree, layer rules and module map are maintained in one place: [ARCHITECTURE.md](../../ARCHITECTURE.md).

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
npm run lint
npm run typecheck   # includes the strict-mode ratchet
npm test
npm run test:e2e
```

## Notes

- System settings are stored in browser localStorage under `agri_system_settings_v1`.
- Versioned backend routes are available under `/api/v1` and `/api/v2`.
- Existing legacy API endpoints remain backward-compatible.
