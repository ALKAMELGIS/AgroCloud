-- AgroCloud identity: organizations, RBAC, users, sessions, manpower, audit, credits (SQLite).
-- Consolidates PostgreSQL migrations 001, 003 and 004 (see ../postgres-legacy/).
--
-- Conventions
--   ids         TEXT UUIDs (app inserts use gen_random_uuid(); defaults keep the CLI usable)
--   timestamps  TEXT ISO-8601 UTC, e.g. 2026-11-06T07:45:53.240Z — sorts and compares correctly
--   booleans    INTEGER 0/1
--   json        TEXT holding JSON (query with ->, ->> and json_* functions)

CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  settings    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  code         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  resource     TEXT NOT NULL DEFAULT '',
  action       TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS roles (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  organization_id  TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  level            INTEGER NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  is_system_role   INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id        TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id  TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id                       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  organization_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  legacy_directory_id      INTEGER,
  email                    TEXT NOT NULL,
  name                     TEXT NOT NULL DEFAULT '',
  phone                    TEXT,
  role_id                  TEXT NOT NULL REFERENCES roles(id),
  parent_user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  data_scope               TEXT NOT NULL DEFAULT 'USER_SCOPE',
  status                   TEXT NOT NULL DEFAULT 'PENDING',
  password_hash            TEXT,
  email_verified           INTEGER NOT NULL DEFAULT 0,
  verification_token       TEXT,
  verification_expires_at  TEXT,
  scope_label              TEXT,
  department               TEXT,
  position                 TEXT,
  employee_code            TEXT,
  avatar_url               TEXT,
  created_by               TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_login_at            TEXT,
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_org_parent  ON users (organization_id, parent_user_id);
CREATE INDEX IF NOT EXISTS idx_users_org_role    ON users (organization_id, role_id);
CREATE INDEX IF NOT EXISTS idx_users_org_status  ON users (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_users_org_created ON users (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_login  ON users (organization_id, last_login_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email       ON users (email COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_active_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ip_address      TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ip_address  TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user    ON password_reset_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS manpower_allocations (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  holder_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  role_code        TEXT NOT NULL,
  total            INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  used             INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  reserved         INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (used + reserved <= total),
  UNIQUE (organization_id, role_code, holder_user_id)
);

CREATE TABLE IF NOT EXISTS manpower_transactions (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  role_code        TEXT NOT NULL,
  type             TEXT NOT NULL,
  quantity         INTEGER NOT NULL DEFAULT 1,
  previous_value   INTEGER,
  new_value        INTEGER,
  reason           TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_manpower_tx_org ON manpower_transactions (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  organization_id  TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action           TEXT NOT NULL,
  resource_type    TEXT NOT NULL DEFAULT '',
  resource_id      TEXT,
  metadata         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
  ip_address       TEXT,
  user_agent       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_resource_assignments (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type    TEXT NOT NULL,
  resource_id      TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, user_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_ura_user ON user_resource_assignments (user_id, resource_type);

CREATE TABLE IF NOT EXISTS wallets (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id      TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,
  balance_after  INTEGER NOT NULL CHECK (balance_after >= 0),
  type           TEXT NOT NULL,
  reason         TEXT NOT NULL DEFAULT '',
  reference_id   TEXT,
  metadata       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
  actor_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user_created ON credit_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_wallet       ON credit_transactions (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type         ON credit_transactions (type, created_at DESC);
