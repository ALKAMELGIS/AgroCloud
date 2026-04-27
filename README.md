# AgroCloud

AgroCloud is a Vite + React (frontend) and Express (backend) web application, designed for agricultural management and satellite/GIS workflows. The frontend is configured for GitHub Pages (hash routing) and standard static hosting.

## Project Structure

- `src/` React application source (pages, components, state, utilities)
- `public/` Static assets served as-is (favicons, SVGs, etc.)
- `config/` Shared configuration used by build/runtime (repository base path, app metadata)
- `server/` Express API server (local development)
- `.github/workflows/` GitHub Actions workflows (GitHub Pages deployment)

## Requirements

- Node.js (LTS recommended)
- npm

## Install

```bash
npm install
```

## Run (Development)

Runs frontend and backend together:

```bash
npm run dev
```

- Frontend: http://localhost:5173/
- Backend: http://localhost:3001/

Run only the frontend (helpful for GitHub Pages-style routing):

```bash
npm run dev:client:clean
```

## Build (Production)

```bash
npm run build
```

## Typecheck

```bash
npm run typecheck
```

## Tests

```bash
npm test
```

## Environment Variables

Do not commit secrets to GitHub. Use `.env.example` as a template and create `.env.local` (or set variables in your hosting provider).

Frontend (Vite) variables must start with `VITE_`:

- `VITE_API_BASE_URL` (default `http://localhost:3001`)
- `VITE_ENABLE_PWA` (`true`/`false`, default `false`)

Backend variables (used by `server/`) can be set in your environment:

- `OPENAI_API_KEY` (optional, enables AI features)
- `GITHUB_CLIENT_ID` (optional, enables GitHub OAuth integration)
- `GITHUB_CLIENT_SECRET` (optional, enables GitHub OAuth integration)
- `GITHUB_WEBHOOK_SECRET` (optional, enables webhook signature verification)
- `APP_ORIGIN` (optional, default `http://localhost:5173`)
- `GITHUB_OAUTH_REDIRECT_URL` (optional, default `http://localhost:3001/api/github/oauth/callback`)

## GitHub Pages

This project is configured to work on GitHub Pages using hash routing.

- Home: `https://alkamelgis.github.io/AgroCloud/`
- Login: `https://alkamelgis.github.io/AgroCloud/#/login`

Deployment is done via GitHub Actions by building the project and publishing the generated `dist/` output.

## Contributing

- Create a feature branch from `main` (or `master`) and keep changes focused.
- Verify locally before opening a PR:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
- Avoid committing secrets (use `.env.local` and GitHub secrets for CI/deployments).
- Use clear PR descriptions (what changed, why, how to test).
