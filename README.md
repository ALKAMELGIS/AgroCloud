About AgroCloud

AgroCloud is a smart agriculture platform that combines AI, satellite imagery, and geospatial technology to help farmers and agricultural organizations monitor and understand their fields.

AgroCloud is designed to transform satellite data into practical agricultural information, making crop monitoring faster, more scalable, and easier to use.

## Repository structure

| Folder | Contents |
|---|---|
| `frontend/` | React + TypeScript web app |
| `backend/` | Express API, SQLite database schema, Python model services |
| `services/` | Optional Python services: satellite analysis engine, GeoDash API |
| `home/` | Documentation: architecture, deployment, authentication, design system |
| `deploy/` | Build, deploy and dev scripts, Windows launchers, standalone tools |

At the root: `start-agrocloud.cmd`, `server.js`, `package.json`, and the Docker / Railway files, which hosting platforms read from the root.

## Run it on Windows

Install [Node.js 22 LTS](https://nodejs.org/en/download), then double-click **`start-agrocloud.cmd`**. The first run installs and builds (5–10 minutes); after that it starts in seconds and opens http://localhost:3011/. Data is kept in `data\agrocloud.sqlite` next to the file. After updating the code, run `start-agrocloud.cmd rebuild`.

## For developers

```bash
npm install
npm run dev          # frontend http://localhost:5180/AgroCloud/  +  API http://localhost:3011
npm run lint         # ESLint (hook rules, correctness, backend undefined/unused names)
npm run typecheck    # TypeScript + strict-mode ratchet
npm test             # frontend (Vitest) + backend (node --test)
npm run test:e2e     # Playwright on desktop, tablet and mobile (runs against a production build)
```

- [home/ARCHITECTURE.md](home/ARCHITECTURE.md): repository tree, layer rules, module map, performance rules
- [home/design-system/IMPLEMENTATION.md](home/design-system/IMPLEMENTATION.md): design tokens and UI rules
- [home/DEPLOYMENT.md](home/DEPLOYMENT.md) · [home/AUTHENTICATION.md](home/AUTHENTICATION.md) · [SECURITY.md](.github/SECURITY.md)
