# AgroCloud database (SQLite)

All server data lives in **one SQLite file**. No database server is needed. The file sits next to the app, or on a mounted volume in production.

| What | Where |
|---|---|
| Database file | `backend/data/agrocloud.sqlite` (default) |
| Schema (migrations) | `backend/database/migrations/NNN_name.sql` — applied in order on every start |
| Connection, query API, transactions | `backend/server/database/connection.js` |
| Migration runner | `backend/server/database/migrate.js` |
| JSON document stores | `backend/server/database/documentStore.js` (table `documents`) |
| PostgreSQL → SQLite import | `backend/server/database/importPostgres.js` |
| Old PostgreSQL schema (import reference only) | `backend/database/postgres-legacy/` |

## Location

The first match wins:

| Variable | Effect |
|---|---|
| `AGROCLOUD_DB_FILE` | Exact path, or `:memory:` |
| `AGROCLOUD_DATA_DIR` (or the older `AGRI_DATA_DIR`) | `<dir>/agrocloud.sqlite` |
| *(none)* | `backend/data/agrocloud.sqlite` |

Tests (`node --test`) default to an in-memory database. Docker images set `AGROCLOUD_DATA_DIR=/var/lib/agrocloud`, and every compose file mounts the `agrocloud_data` volume there. In production, always keep the file on persistent storage.

The connection uses WAL journaling (readers never block the writer), `foreign_keys=ON`, `busy_timeout=5000` and `synchronous=NORMAL`.

## Tables

```text
agrocloud.sqlite
├─ schema_migrations          applied migration files
│
├─ identity & access          (001, 002 — used when AGROCLOUD_IDENTITY=on)
│  ├─ organizations
│  ├─ users                   hierarchy via parent_user_id, soft delete via deleted_at
│  ├─ roles · permissions · role_permissions     OWNER > DIRECTOR > MANAGER > SUPERVISOR > STAFF
│  ├─ sessions                agro_session cookie / Bearer token (hash only)
│  ├─ password_reset_tokens   single use, hash only
│  ├─ user_resource_assignments
│  └─ audit_logs
├─ manpower                   (001, 004)
│  ├─ manpower_allocations    one org pool row per role (holder_user_id NULL) + per-holder rows
│  └─ manpower_transactions
├─ credits                    (001)
│  ├─ wallets                 balance ≥ 0
│  └─ credit_transactions     append-only ledger
│
└─ documents                  (003) named JSON documents
   ├─ agri_api_secrets              API tokens saved from System Settings
   ├─ agri_admin_directory          users + audit log when identity is off
   ├─ agri_user_profiles            extended profile fields by email
   ├─ ecph_entries                  EC/pH data-entry records
   ├─ esri_dashboards               registered Esri dashboards
   └─ acp_weather_layer_config      weather-alert layer visibility
```

Conventions:
- ids are UUID v4 text.
- Timestamps are ISO-8601 UTC text (`2026-11-06T08:00:00.000Z`), so text comparison equals time comparison.
- Booleans are `0/1`.
- JSON columns are text with a `json_valid` check.

## Query API

Services call `pool.query(sql, params)` and get `{ rows, rowCount }` back, the same shape as the `pg` driver used before:

- **Placeholders.** PostgreSQL-style `$1, $2…` placeholders work and may repeat.
- **Value mapping.** `Date` maps to ISO text and back. `boolean` maps to `0/1` (`is_system_role`, `email_verified`). `settings` and `metadata` JSON is parsed on read. `*_at` / `expires` columns come back as `Date`.
- **Functions.** `now()` and `gen_random_uuid()` are available in SQL.
- **Transactions.** Use `pool.connect()` → `client.query('BEGIN IMMEDIATE')` … `COMMIT` / `ROLLBACK`, then `client.release()`, or the `withTransaction(fn)` helper. `BEGIN IMMEDIATE` takes the write lock up front; it replaces PostgreSQL's `SELECT … FOR UPDATE`. While a transaction is open, other `pool.query` calls wait for it instead of running inside it. Inside a transaction, always use the transaction's `client`.

## Document stores

A document is one row of `documents` (`store`, JSON `value`).
- **Calls.** Code that used to read and write a JSON file calls `readFileDocument(path)` and `writeFileDocument(path, value)` with the same path as before.
- **First read.** An existing JSON file is imported, recorded in `legacy_path` / `imported_at`, and then left untouched as a backup.
- **Reads** are synchronous and come from an in-process cache.
- **Writes** update the cache at once and are saved through the queued query path.

Crop-classification job artifacts (PNG, GeoTIFF) stay as files under `backend/server/data/crop-classification-jobs/`, because they are binary outputs, not records.

## Commands

```bash
npm run db:migrate -w backend          # apply pending migrations (the server also does this on start)
npm run db:status -w backend           # file, migrations, row counts, document stores
npm run db:backup -w backend           # consistent online copy → <data dir>/backups/agrocloud-<time>.sqlite
npm run db:import-postgres -w backend  # copy an existing PostgreSQL identity DB in (needs DATABASE_URL)
npm run identity:import -w backend     # load admin-directory users into the identity tables
```

## Adding a migration

1. Create `backend/database/migrations/NNN_short_name.sql` with the next number.
2. Make it safe to run on existing data. Use `IF NOT EXISTS`, and clean up data before adding a constraint (see `004`).
3. Never edit a migration that has already shipped. Add a new one instead.

Each file runs once, inside a transaction, and is recorded in `schema_migrations`.

## Moving from PostgreSQL

Older deployments kept identity in PostgreSQL (`DATABASE_URL`). Either:
- **Automatic:** keep `DATABASE_URL` set for one start. When the SQLite users table is empty, the server copies every identity table across (ids, password hashes, sessions, wallets, ledgers) and logs `imported PostgreSQL identity data into SQLite`. Or
- **Manual:** `DATABASE_URL=… npm run db:import-postgres -w backend` (add `-- --force` to replace existing SQLite users).

Then remove `DATABASE_URL` and set `AGROCLOUD_IDENTITY=on`. PostgreSQL is only read, never modified.
