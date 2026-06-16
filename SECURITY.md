# Security policy

## Supported versions

| Branch | Supported |
|--------|-----------|
| `main` | Yes |

## Reporting a vulnerability

If you discover a security issue in AgroCloud:

1. **Do not** open a public GitHub issue with exploit details or leaked credentials.
2. Email the maintainers privately (use your organization’s security contact if available).
3. Include steps to reproduce, affected URLs/commits, and suggested severity.

We aim to acknowledge reports within **5 business days**.

## Secrets and credentials

- **Never commit** `.env`, `.env.production`, API keys, tokens, JWT secrets, database passwords, or private keys (`.pem`, `.key`, `.p12`).
- Use [`.env.example`](.env.example) and [`.env.production.example`](.env.production.example) as templates only.
- Production API keys belong in:
  - Hosting panel environment variables (VPS / Docker / Hostinger)
  - GitHub Actions **Secrets** (private CI builds only)
  - Encrypted server storage (`agri_api_secrets.json` on the Node backend, protected by `AGRI_API_SECRETS_TOKEN` / `JWT_SECRET`)
  - End-user browser storage via **System Settings → API Tokens** for the public GitHub Pages app

### GitHub Pages builds

The public SPA is built in CI with **empty** `VITE_*` variables. Root deploy artifacts (`/assets/`, `/index.html`, `/sw.js`, …) are **gitignored locally** so a developer machine with a filled `.env` cannot accidentally push embedded keys. CI commits those paths with `git add -f` after [`scripts/pages-dist-secrets-check.mjs`](scripts/pages-dist-secrets-check.mjs) passes.

If GitGuardian or GitHub Secret Scanning alerts on this repository:

1. **Rotate** the exposed credential immediately at the provider.
2. Remove secrets from the **current tree** (clean CI rebuild).
3. Purge secrets from **git history** — see [docs/GIT_HISTORY_SECRET_CLEANUP.md](docs/GIT_HISTORY_SECRET_CLEANUP.md).
4. Add rotated key prefixes to [`scripts/secret-scan-blocklist.txt`](scripts/secret-scan-blocklist.txt).

## Dependency updates

Run audits before releases:

```bash
npm audit -w frontend
npm audit -w backend
```

Address high/critical findings in direct dependencies when fixes are available. Document accepted risk for dev-only or transitive issues without fixes (e.g. `xlsx`).

## Secure deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) and [docs/SECURE_DEPLOYMENT.md](docs/SECURE_DEPLOYMENT.md).

## Security checklist (maintainers)

- [ ] `.env` is not tracked (`git check-ignore -v .env`)
- [ ] `npm run build` for Pages uses empty public env vars
- [ ] `node scripts/pages-dist-check.mjs` passes after build
- [ ] No secret patterns in `frontend/dist` or repo root `/assets`
- [ ] Backend `CORS_ALLOWED_ORIGINS` lists only trusted origins
- [ ] `JWT_SECRET` / `AGRI_API_VAULT_MASTER_KEY` set in production
- [ ] Rotated any key ever flagged by secret scanning
