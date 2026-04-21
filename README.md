# AgroCloud

AgroCloud is a web application built with Vite + React (frontend) and Express (backend).

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

## Build (Production)

```bash
npm run build
```

## Tests

```bash
npm test
```

## Environment Variables

Do not commit secrets to GitHub. Configure these on your machine (or in your deployment environment):

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

To deploy, build the project and publish the generated `dist/` output (commonly via a `gh-pages` branch or GitHub Actions).
