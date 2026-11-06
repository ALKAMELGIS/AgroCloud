# Authentication

## Routes (`/api/auth/*`)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/auth/status` | Server auth availability |
| POST | `/api/auth/register` | Self-signup (JSON directory; role constrained) |
| POST | `/api/auth/login` | Identity module first via bridge (when `AGROCLOUD_IDENTITY=on`), then the directory; sets `agro_session` cookie for identity users |
| POST | `/api/auth/logout` | Use `/api/v1/identity/logout` for identity sessions (cookie or Bearer) |
| POST | `/api/auth/verify-email` | Email verification token |
| POST | `/api/auth/resend-verification` | Resend verification |
| POST | `/api/auth/forgot-password` | Rate-limited; sends reset email when SMTP configured |
| POST | `/api/auth/reset-password` | `{ token, password }` — invalidates identity sessions on success |

## Rate limiting

Configured in [backend/server/middleware/authRateLimit.js](../../backend/server/middleware/authRateLimit.js):

- `AUTH_RATE_LIMIT_WINDOW_MS` (default 15 min)
- `AUTH_RATE_LIMIT_LOGIN_MAX`, `REGISTER_MAX`, `FORGOT_MAX`, `RESET_MAX`, `VERIFY_MAX`

## Environment

See [.env.example](../../.env.example): `AUTH_REQUIRE_EMAIL_VERIFICATION`, `AUTH_REQUIRE_ADMIN_APPROVAL`, `IDENTITY_SESSION_SECRET`, `AGROCLOUD_IDENTITY`, `AGROCLOUD_DATA_DIR`. Storage: [backend/database/README.md](../../backend/database/README.md).

## Password reset

Migration `001_identity_schema.sql` — table `password_reset_tokens` (hashed token, single-use, 1h TTL).

## Sessions

Cookie `agro_session`, HTTP-only. Table `sessions` with `last_active_at` (migration 001); the last-active write is throttled to once a minute.
