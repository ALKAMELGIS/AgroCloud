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

## Server usage

Call `debitCreditsForUsage(client, userId, creditsUsed, { service, action, referenceId, metadata })` inside a DB transaction **after** computing cost on the server. Never trust client-supplied prices.

## Concurrency

`applyCreditDelta` locks the wallet row (`SELECT … FOR UPDATE`) before updating balance and inserting the transaction.
