# Credits ledger

## Model

- **Wallet** — one per user (`wallets.balance`, non-negative).
- **Credit transaction** — append-only ledger row with `amount`, `balance_after`, `type`, `reason`, `metadata`.

Schema: tables `wallets` and `credit_transactions` in [backend/database/migrations/001_identity_schema.sql](../../backend/database/migrations/001_identity_schema.sql) (SQLite).

## Types

`welcome_bonus`, `purchase`, `subscription`, `usage`, `refund`, `admin_adjustment`, `promotional`, `expiration`.

## API (`/api/v1`, session required)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/credits/wallet` | `credits.read` |
| GET | `/credits/transactions` | `credits.read` |
| POST | `/admin/credits/adjust` | `credits.add` / `credits.remove` — body: `{ userId, amount, reason }` |

Routes: [backend/server/identity/identityRoutes.js](../../backend/server/identity/identityRoutes.js); tests: [backend/tests/creditsRoutes.test.js](../../backend/tests/creditsRoutes.test.js).

- `wallet` and `transactions` always return the **caller's own** wallet (`{ balance }`, newest transactions first; `?limit=` ≤ 200, `?offset=`).
- `adjust` accepts the identity UUID or the numeric id shown for directory-era users. The target must be in the caller's organisation and management scope (OWNER/DIRECTOR: whole organisation), otherwise `404` / `403`. Every adjustment writes an audit-log entry.
- Errors: `401` no session · `403 INSUFFICIENT_PERMISSION` · `404` unknown user · `409 INSUFFICIENT_CREDITS` · `422 VALIDATION_ERROR` (zero / non-numeric amount).
- No screen uses these endpoints yet; the client functions are in `frontend/src/modules/identity/api/identityApi.ts`.

## Server usage

Call `debitCreditsForUsage(client, userId, creditsUsed, { service, action, referenceId, metadata })` inside a DB transaction **after** computing cost on the server. Never trust client-supplied prices.

## Concurrency

Run `applyCreditDelta` inside a transaction started with `BEGIN IMMEDIATE`, as the adjust route does. In SQLite that takes the write lock before the wallet is read, so the read, the balance update and the ledger row are one atomic write; it replaces PostgreSQL's `SELECT … FOR UPDATE`. A failed adjustment rolls back completely, leaving no wallet change and no ledger row.
