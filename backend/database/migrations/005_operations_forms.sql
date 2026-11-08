-- Operations forms (Harvest, EC/pH, PPP, Irrigation & Fertigation, Fertigation worksheet).
-- One table per form; every record table shares the same bookkeeping columns:
--   farm, source (manual | import:<file>), created/updated by+at, deleted_at (soft delete).
-- Field definitions, labels and computed columns live in backend/server/operations/formSchemas.js.

CREATE TABLE IF NOT EXISTS ops_harvest (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  farm              TEXT,
  harvest_date      TEXT NOT NULL,            -- YYYY-MM-DD
  start_time        TEXT,                     -- HH:MM
  end_time          TEXT,
  shift             TEXT,
  batch_no          TEXT,
  product           TEXT NOT NULL,
  variety           TEXT,
  location          TEXT NOT NULL,            -- field / house id (NH 01, GH 02, Open Field…)
  segment           TEXT,                     -- valve / side / section
  harvested_area    TEXT,                     -- as recorded ("0.5", "1 Ha", "5 Bed")
  quantity_kg       REAL NOT NULL DEFAULT 0,
  packhouse         TEXT,
  authorized_by     TEXT,
  notes             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by        TEXT,
  updated_at        TEXT,
  updated_by        TEXT,
  deleted_at        TEXT
);
CREATE INDEX IF NOT EXISTS ops_harvest_date_idx ON ops_harvest (harvest_date);
CREATE INDEX IF NOT EXISTS ops_harvest_location_idx ON ops_harvest (location);
CREATE INDEX IF NOT EXISTS ops_harvest_product_idx ON ops_harvest (product);

CREATE TABLE IF NOT EXISTS ops_ec_ph (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  farm              TEXT,
  record_date       TEXT NOT NULL,
  location          TEXT NOT NULL,
  valve             TEXT,
  record_time       TEXT,
  ec_in             REAL,
  ec_out            REAL,
  ph_in             REAL,
  ph_out            REAL,
  drip_volume_ml    REAL,                     -- one dripper
  drip_total_ml     REAL,                     -- computed: drip × drippers per sample (12)
  drain_volume_ml   REAL,
  drain_pct         REAL,                     -- computed: drain ÷ drip total × 100
  water_qty_m3      REAL,
  cycles            REAL,
  total_water_m3    REAL,                     -- computed: water qty × cycles
  operator          TEXT,
  notes             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by        TEXT,
  updated_at        TEXT,
  updated_by        TEXT,
  deleted_at        TEXT
);
CREATE INDEX IF NOT EXISTS ops_ec_ph_date_idx ON ops_ec_ph (record_date);
CREATE INDEX IF NOT EXISTS ops_ec_ph_location_idx ON ops_ec_ph (location);

CREATE TABLE IF NOT EXISTS ops_ppp (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  farm                  TEXT,
  crop                  TEXT NOT NULL,
  variety               TEXT,
  location              TEXT NOT NULL,
  segment               TEXT,
  scouting_date         TEXT,
  justification         TEXT,
  seen_pct              TEXT,
  application_date      TEXT NOT NULL,
  start_time            TEXT,
  end_time              TEXT,
  ppp_name              TEXT NOT NULL,
  active_ingredient     TEXT,
  dose_per_l            REAL,                 -- ml or g per litre of water
  rate_per_ha           REAL,
  unit_price            REAL,
  cost                  REAL,                 -- computed: rate/ha × unit price ÷ 1000
  uom                   TEXT,
  total_qty_applied     REAL,                 -- litres of spray solution
  machinery             TEXT,
  phi_days              REAL,
  clear_to_harvest_date TEXT,                 -- computed: application date + PHI
  weather               TEXT,
  operator              TEXT,
  authorized_by         TEXT,
  notes                 TEXT,
  source                TEXT NOT NULL DEFAULT 'manual',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by            TEXT,
  updated_at            TEXT,
  updated_by            TEXT,
  deleted_at            TEXT
);
CREATE INDEX IF NOT EXISTS ops_ppp_date_idx ON ops_ppp (application_date);
CREATE INDEX IF NOT EXISTS ops_ppp_location_idx ON ops_ppp (location);
CREATE INDEX IF NOT EXISTS ops_ppp_product_idx ON ops_ppp (ppp_name);

CREATE TABLE IF NOT EXISTS ops_irrigation (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  farm              TEXT,
  week_no           INTEGER,                  -- computed: ISO week of record_date
  record_date       TEXT NOT NULL,
  method            TEXT,
  flow_rate_m3      REAL,
  operator          TEXT,
  authorized_by     TEXT,
  location          TEXT NOT NULL,
  water_qty_m3      REAL,
  frequency         REAL,
  daily_total_m3    REAL,                     -- computed: water qty × frequency
  fertilizer_type   TEXT,
  fertilizer_qty    REAL,
  notes             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by        TEXT,
  updated_at        TEXT,
  updated_by        TEXT,
  deleted_at        TEXT
);
CREATE INDEX IF NOT EXISTS ops_irrigation_date_idx ON ops_irrigation (record_date);
CREATE INDEX IF NOT EXISTS ops_irrigation_location_idx ON ops_irrigation (location);

CREATE TABLE IF NOT EXISTS ops_fertigation (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  farm              TEXT,
  week_no           INTEGER,
  record_date       TEXT NOT NULL,
  station           TEXT,                     -- pump room
  system            TEXT,                     -- dosing unit (Netajet…)
  method            TEXT,
  operator          TEXT,
  authorized_by     TEXT,
  location          TEXT NOT NULL,            -- field id
  valves            REAL,
  crop              TEXT,
  crop_stage        TEXT,
  flow_rate_m3      REAL,
  water_per_valve_m3 REAL,
  frequency         REAL,
  daily_total_m3    REAL,                     -- computed: valves × water per valve × frequency
  recipe            TEXT,
  notes             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by        TEXT,
  updated_at        TEXT,
  updated_by        TEXT,
  deleted_at        TEXT
);
CREATE INDEX IF NOT EXISTS ops_fertigation_date_idx ON ops_fertigation (record_date);
CREATE INDEX IF NOT EXISTS ops_fertigation_location_idx ON ops_fertigation (location);

CREATE TABLE IF NOT EXISTS ops_fertilizer_issue (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  farm              TEXT,
  issue_date        TEXT NOT NULL,
  pump_room         TEXT,
  fertilizer        TEXT NOT NULL,
  quantity          REAL NOT NULL DEFAULT 0,
  uom               TEXT,
  notes             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by        TEXT,
  updated_at        TEXT,
  updated_by        TEXT,
  deleted_at        TEXT
);
CREATE INDEX IF NOT EXISTS ops_fertilizer_issue_date_idx ON ops_fertilizer_issue (issue_date);

-- Lookup lists shared by every form (crops, locations, products, staff…).
CREATE TABLE IF NOT EXISTS ops_master_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  list_key    TEXT NOT NULL,
  value       TEXT NOT NULL,
  label_ar    TEXT,
  meta        TEXT,                           -- JSON (e.g. active ingredient, UoM, PHI)
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (list_key, value)
);

-- Report / form settings (company name, document codes, EC/pH limits…).
CREATE TABLE IF NOT EXISTS ops_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,                  -- JSON
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by  TEXT
);

-- Who changed what, when.
CREATE TABLE IF NOT EXISTS ops_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  form        TEXT NOT NULL,
  record_id   INTEGER,
  action      TEXT NOT NULL,                  -- create | update | delete | restore | import
  actor       TEXT,
  at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  changes     TEXT                            -- JSON: { field: [before, after] } or import summary
);
CREATE INDEX IF NOT EXISTS ops_audit_record_idx ON ops_audit (form, record_id);

-- Generic reference values (no company data): methods, units, weather, shifts.
INSERT OR IGNORE INTO ops_master_items (list_key, value, label_ar, sort_order) VALUES
  ('methods', 'Drip', 'تنقيط', 1),
  ('methods', 'Sprinkler', 'رش', 2),
  ('methods', 'Pivot', 'محوري', 3),
  ('methods', 'Flood', 'غمر', 4),
  ('uom', 'ML', 'مل', 1),
  ('uom', 'GM', 'غرام', 2),
  ('uom', 'L', 'لتر', 3),
  ('uom', 'Kg', 'كغ', 4),
  ('weather', 'Sunny', 'مشمس', 1),
  ('weather', 'Cloudy', 'غائم', 2),
  ('weather', 'Windy', 'عاصف', 3),
  ('weather', 'Humid', 'رطب', 4),
  ('weather', 'Rainy', 'ممطر', 5),
  ('justification', 'Preventive', 'وقائي', 1),
  ('justification', 'Pest', 'آفة', 2),
  ('justification', 'Disease', 'مرض', 3),
  ('shifts', 'Morning', 'صباحي', 1),
  ('shifts', 'Evening', 'مسائي', 2),
  ('shifts', 'N/A', 'غير محدد', 3);
