CREATE TABLE IF NOT EXISTS tenants (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ponds (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  volume_m3 DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS oxygen_valve_setpoints (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_code TEXT NOT NULL,
  activation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  setpoint_on_pct DOUBLE PRECISION,
  setpoint_off_pct DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slot_code)
);

CREATE TABLE IF NOT EXISTS oxygen_color_setpoints (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_code TEXT NOT NULL,
  critical_value DOUBLE PRECISION,
  low_value DOUBLE PRECISION,
  high_value DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slot_code)
);

CREATE TABLE IF NOT EXISTS temperature_color_setpoints (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_code TEXT NOT NULL,
  critical_value DOUBLE PRECISION,
  high_value DOUBLE PRECISION,
  low_value DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slot_code)
);

CREATE TABLE IF NOT EXISTS phone_alert_setpoints (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  oxygen_min_pct DOUBLE PRECISION,
  oxygen_max_pct DOUBLE PRECISION,
  temperature_max_c DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slot_code)
);

CREATE TABLE IF NOT EXISTS sms_alert_setpoints (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  oxygen_min_pct DOUBLE PRECISION,
  oxygen_max_pct DOUBLE PRECISION,
  temperature_max_c DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slot_code)
);

CREATE TABLE IF NOT EXISTS sensors (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pond_id BIGINT NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  unit TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, pond_id, name)
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pond_id BIGINT REFERENCES ponds(id) ON DELETE CASCADE,
  sensor_type TEXT NOT NULL,
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  severity TEXT NOT NULL DEFAULT 'medium',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS measurements (
  id BIGSERIAL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sensor_id BIGINT NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  pond_id BIGINT NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  value DOUBLE PRECISION NOT NULL,
  quality TEXT NOT NULL DEFAULT 'ok',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

CREATE TABLE IF NOT EXISTS measurements_2025 PARTITION OF measurements
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS measurements_2026 PARTITION OF measurements
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS measurements_default PARTITION OF measurements DEFAULT;

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pond_id BIGINT NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  sensor_id BIGINT NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  rule_id BIGINT REFERENCES alert_rules(id) ON DELETE SET NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  message TEXT NOT NULL,
  current_value DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS operations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pond_id BIGINT NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  quantity_unit TEXT NOT NULL DEFAULT 'kg',
  lot_code TEXT,
  mix_with_lot_code TEXT,
  label_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  withdrawal_days INTEGER,
  withdrawal_until TIMESTAMPTZ,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS biomass_entries (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pond_id BIGINT NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  species_variant TEXT,
  lot_code TEXT,
  fish_count INTEGER NOT NULL,
  avg_weight_g DOUBLE PRECISION NOT NULL,
  mortality_pct DOUBLE PRECISION NOT NULL,
  vaccination_coverage_pct DOUBLE PRECISION,
  withdrawal_days_remaining INTEGER,
  feed_kg DOUBLE PRECISION NOT NULL,
  fcr DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feed_tables (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  species TEXT NOT NULL,
  min_weight_g DOUBLE PRECISION NOT NULL,
  max_weight_g DOUBLE PRECISION NOT NULL,
  daily_feed_pct DOUBLE PRECISION NOT NULL,
  fcr_target DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS lot_code TEXT,
  ADD COLUMN IF NOT EXISTS mix_with_lot_code TEXT,
  ADD COLUMN IF NOT EXISTS label_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS withdrawal_days INTEGER,
  ADD COLUMN IF NOT EXISTS withdrawal_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE ponds
  ADD COLUMN IF NOT EXISTS volume_m3 DOUBLE PRECISION;

ALTER TABLE phone_alert_setpoints
  ADD COLUMN IF NOT EXISTS oxygen_min_pct DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS oxygen_max_pct DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS temperature_max_c DOUBLE PRECISION;

ALTER TABLE sms_alert_setpoints
  ADD COLUMN IF NOT EXISTS oxygen_min_pct DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS oxygen_max_pct DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS temperature_max_c DOUBLE PRECISION;

ALTER TABLE biomass_entries
  ADD COLUMN IF NOT EXISTS species_variant TEXT,
  ADD COLUMN IF NOT EXISTS lot_code TEXT,
  ADD COLUMN IF NOT EXISTS vaccination_coverage_pct DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS withdrawal_days_remaining INTEGER;

UPDATE operations
SET event_at = created_at
WHERE event_at IS NULL;

UPDATE operations o
SET lot_code = CONCAT('LOT-', UPPER(REPLACE(p.name, ' ', '-')), '-', LPAD(o.id::text, 3, '0'))
FROM ponds p
WHERE o.pond_id = p.id
  AND (o.lot_code IS NULL OR o.lot_code = '');

UPDATE biomass_entries b
SET species_variant = p.species
FROM ponds p
WHERE b.pond_id = p.id
  AND b.species_variant IS NULL;

UPDATE biomass_entries b
SET lot_code = CONCAT('LOT-', UPPER(REPLACE(p.name, ' ', '-')), '-', LPAD(b.id::text, 3, '0'))
FROM ponds p
WHERE b.pond_id = p.id
  AND (b.lot_code IS NULL OR b.lot_code = '');

CREATE TABLE IF NOT EXISTS camera_sessions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  machine_type TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  viewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  stream_protocol TEXT NOT NULL,
  stream_url TEXT NOT NULL,
  fallback_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measurements_tenant_sensor_time
  ON measurements (tenant_id, sensor_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_measurements_tenant_pond_time
  ON measurements (tenant_id, pond_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status_created
  ON alerts (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operations_tenant_pond_created
  ON operations (tenant_id, pond_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operations_tenant_lot_event
  ON operations (tenant_id, lot_code, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_biomass_tenant_pond_captured
  ON biomass_entries (tenant_id, pond_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_biomass_tenant_lot_captured
  ON biomass_entries (tenant_id, lot_code, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_tables_tenant_species_weight
  ON feed_tables (tenant_id, species, min_weight_g, max_weight_g);

CREATE INDEX IF NOT EXISTS idx_oxygen_setpoints_tenant_slot
  ON oxygen_valve_setpoints (tenant_id, slot_code);

CREATE INDEX IF NOT EXISTS idx_oxygen_color_setpoints_tenant_slot
  ON oxygen_color_setpoints (tenant_id, slot_code);

CREATE INDEX IF NOT EXISTS idx_temperature_color_setpoints_tenant_slot
  ON temperature_color_setpoints (tenant_id, slot_code);

CREATE INDEX IF NOT EXISTS idx_phone_alert_setpoints_tenant_slot
  ON phone_alert_setpoints (tenant_id, slot_code);

CREATE INDEX IF NOT EXISTS idx_sms_alert_setpoints_tenant_slot
  ON sms_alert_setpoints (tenant_id, slot_code);
