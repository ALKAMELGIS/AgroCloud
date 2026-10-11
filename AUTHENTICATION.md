# Authentication

## Routes (`/api/auth/*`)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/auth/status` | Server auth availability |
| POST | `/api/auth/register` | Self-signup (JSON directory; role constrained) |
| POST | `/api/auth/login` | PostgreSQL first via bridge, then JSON fallback; sets `agro_session` cookie when PG |
| POST | `/api/auth/logout` | Use `/api/v1/identity/logout` when using PG sessions |
| POST | `/api/auth/verify-email` | Email verification token |
| POST | `/api/auth/resend-verification` | Resend verification |
| POST | `/api/auth/forgot-password` | Rate-limited; sends reset email when SMTP configured |
| POST | `/api/auth/reset-password` | `{ token, password }` — invalidates PG sessions on success |

## Rate limiting

Configured in [backend/server/authRateLimit.js](backend/server/authRateLimit.js):

- `AUTH_RATE_LIMIT_WINDOW_MS` (default 15 min)
- `AUTH_RATE_LIMIT_LOGIN_MAX`, `REGISTER_MAX`, `FORGOT_MAX`, `RESET_MAX`, `VERIFY_MAX`

## Environment

See [.env.example](.env.example): `AUTH_REQUIRE_EMAIL_VERIFICATION`, `AUTH_REQUIRE_ADMIN_APPROVAL`, `IDENTITY_SESSION_SECRET`, `DATABASE_URL`.

## Password reset (PostgreSQL)

Migration `003_user_profile_auth.sql` — table `password_reset_tokens` (hashed token, single-use, 1h TTL).

## Sessions

Cookie `agro_session`, HTTP-only. Table `sessions` with `last_active_at` (migration 003).
