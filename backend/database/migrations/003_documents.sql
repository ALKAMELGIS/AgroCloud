-- Document stores: settings-style data that is read and written as one JSON document.
-- Replaces the JSON files the API used to keep next to its code (admin directory, API secrets,
-- user profiles, EC/pH entries, Esri dashboards, weather-layer config). On first read, each store
-- imports its legacy JSON file once (legacy_path), so existing data carries over.

CREATE TABLE IF NOT EXISTS documents (
  store        TEXT PRIMARY KEY,                -- stable store name, e.g. 'admin-directory'
  value        TEXT NOT NULL CHECK (json_valid(value)),
  legacy_path  TEXT,                            -- JSON file imported on first use (kept as a backup)
  imported_at  TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
