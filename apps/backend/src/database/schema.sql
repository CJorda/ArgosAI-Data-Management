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

CREATE TABLE IF NOT EXISTS tenant_features (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, feature_key)
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

CREATE TABLE IF NOT EXISTS sites (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS ponds (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  volume_m3 DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS hatchery_broodstock (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL,
  tag_code TEXT NOT NULL,
  species TEXT NOT NULL,
  sex TEXT NOT NULL,
  hatch_date DATE,
  avg_weight_g DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'active',
  origin TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, tag_code)
);

CREATE TABLE IF NOT EXISTS hatchery_layings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL,
  female_broodstock_id BIGINT REFERENCES hatchery_broodstock(id) ON DELETE SET NULL,
  male_broodstock_id BIGINT REFERENCES hatchery_broodstock(id) ON DELETE SET NULL,
  laying_code TEXT NOT NULL,
  laid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  egg_count INTEGER NOT NULL,
  fertilization_pct DOUBLE PRECISION,
  hatch_rate_pct DOUBLE PRECISION,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, laying_code)
);

CREATE TABLE IF NOT EXISTS hatchery_larval_batches (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL,
  laying_id BIGINT REFERENCES hatchery_layings(id) ON DELETE SET NULL,
  batch_code TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'larva',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  initial_count INTEGER NOT NULL,
  current_count INTEGER,
  survival_pct DOUBLE PRECISION,
  avg_weight_mg DOUBLE PRECISION,
  density_larvae_l DOUBLE PRECISION,
  feed_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, batch_code)
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
  protocol_status TEXT NOT NULL DEFAULT 'pending',
  protocol_owner BIGINT REFERENCES users(id) ON DELETE SET NULL,
  protocol_started_at TIMESTAMPTZ,
  protocol_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  protocol_steps JSONB NOT NULL DEFAULT '[]'::JSONB,
  protocol_notes TEXT,
  escalation_deadline TIMESTAMPTZ,
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
  ADD COLUMN IF NOT EXISTS volume_m3 DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS site_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ponds_site_id_fkey'
  ) THEN
    ALTER TABLE ponds
      ADD CONSTRAINT ponds_site_id_fkey
      FOREIGN KEY (site_id)
      REFERENCES sites(id)
      ON DELETE SET NULL;
  END IF;
END $$;

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

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS protocol_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS protocol_owner BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS protocol_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS protocol_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS protocol_steps JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS protocol_notes TEXT,
  ADD COLUMN IF NOT EXISTS escalation_deadline TIMESTAMPTZ;

UPDATE alerts
SET protocol_status = 'resolved',
    protocol_updated_at = NOW()
WHERE status = 'resolved'
  AND protocol_status <> 'resolved';

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

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pond_id BIGINT REFERENCES ponds(id) ON DELETE SET NULL,
  linked_alert_id BIGINT REFERENCES alerts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ,
  acknowledged_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  completed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  min_stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  location TEXT,
  supplier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  related_pond_id BIGINT REFERENCES ponds(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  related_lot_code TEXT,
  reason TEXT,
  unit_cost DOUBLE PRECISION,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pond_id BIGINT NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  lot_code TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  medication_name TEXT,
  dosage TEXT,
  biosecurity_level TEXT,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS harvest_plans (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pond_id BIGINT NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  lot_code TEXT NOT NULL,
  target_weight_g DOUBLE PRECISION,
  planned_biomass_kg DOUBLE PRECISION,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  destination TEXT,
  logistics_provider TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS harvest_shipments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  harvest_plan_id BIGINT NOT NULL REFERENCES harvest_plans(id) ON DELETE CASCADE,
  dispatch_code TEXT NOT NULL,
  truck_plate TEXT,
  driver_name TEXT,
  departure_at TIMESTAMPTZ,
  arrival_eta TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled',
  documents JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_transport_trips (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transport_code TEXT NOT NULL,
  origin_site TEXT NOT NULL,
  destination_site TEXT NOT NULL,
  species TEXT,
  lot_code TEXT,
  fish_units INTEGER,
  tank_count INTEGER NOT NULL DEFAULT 1,
  departure_at TIMESTAMPTZ,
  arrival_eta TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, transport_code)
);

CREATE TABLE IF NOT EXISTS live_transport_tank_readings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trip_id BIGINT NOT NULL REFERENCES live_transport_trips(id) ON DELETE CASCADE,
  tank_code TEXT NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ph DOUBLE PRECISION,
  dissolved_oxygen_mg_l DOUBLE PRECISION,
  temperature_c DOUBLE PRECISION,
  salinity_ppt DOUBLE PRECISION,
  risk_level TEXT NOT NULL DEFAULT 'low',
  risk_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS water_flow_config (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  calibration_k DOUBLE PRECISION NOT NULL DEFAULT 1,
  annual_concession_m3 DOUBLE PRECISION NOT NULL DEFAULT 8500000,
  deviation_warning_pct DOUBLE PRECISION NOT NULL DEFAULT 8,
  deviation_critical_pct DOUBLE PRECISION NOT NULL DEFAULT 14,
  concession_warning_pct DOUBLE PRECISION NOT NULL DEFAULT 85,
  concession_critical_pct DOUBLE PRECISION NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (calibration_k >= 0),
  CHECK (annual_concession_m3 > 0),
  CHECK (deviation_warning_pct > 0 AND deviation_critical_pct >= deviation_warning_pct),
  CHECK (concession_warning_pct > 0 AND concession_critical_pct >= concession_warning_pct)
);

CREATE TABLE IF NOT EXISTS water_flow_meters (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meter_code TEXT NOT NULL,
  meter_name TEXT NOT NULL,
  channel_key TEXT NOT NULL,
  calibration_k DOUBLE PRECISION NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (calibration_k >= 0),
  UNIQUE (tenant_id, meter_code),
  UNIQUE (tenant_id, channel_key)
);

DO $$
DECLARE
  cfg_constraint RECORD;
  meter_constraint RECORD;
BEGIN
  FOR cfg_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'water_flow_config'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%calibration_k%'
  LOOP
    EXECUTE format('ALTER TABLE public.water_flow_config DROP CONSTRAINT %I', cfg_constraint.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'water_flow_config'
      AND c.conname = 'water_flow_config_calibration_k_nonnegative'
  ) THEN
    ALTER TABLE public.water_flow_config
    ADD CONSTRAINT water_flow_config_calibration_k_nonnegative
    CHECK (calibration_k >= 0);
  END IF;

  FOR meter_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'water_flow_meters'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%calibration_k%'
  LOOP
    EXECUTE format('ALTER TABLE public.water_flow_meters DROP CONSTRAINT %I', meter_constraint.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'water_flow_meters'
      AND c.conname = 'water_flow_meters_calibration_k_nonnegative'
  ) THEN
    ALTER TABLE public.water_flow_meters
    ADD CONSTRAINT water_flow_meters_calibration_k_nonnegative
    CHECK (calibration_k >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS water_flow_readings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  incoming_measured_m3h DOUBLE PRECISION NOT NULL,
  outgoing_measured_m3h DOUBLE PRECISION NOT NULL,
  recirculated_m3h DOUBLE PRECISION,
  discharge_quality_pct DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (incoming_measured_m3h >= 0),
  CHECK (outgoing_measured_m3h >= 0),
  CHECK (recirculated_m3h IS NULL OR recirculated_m3h >= 0),
  CHECK (discharge_quality_pct IS NULL OR (discharge_quality_pct >= 0 AND discharge_quality_pct <= 100))
);

CREATE TABLE IF NOT EXISTS water_flow_alerts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metric_value DOUBLE PRECISION,
  threshold_value DOUBLE PRECISION,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CHECK (severity IN ('warning', 'critical')),
  CHECK (status IN ('open', 'resolved'))
);

CREATE INDEX IF NOT EXISTS idx_measurements_tenant_sensor_time
  ON measurements (tenant_id, sensor_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_measurements_tenant_pond_time
  ON measurements (tenant_id, pond_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status_created
  ON alerts (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_protocol_status
  ON alerts (tenant_id, protocol_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operations_tenant_pond_created
  ON operations (tenant_id, pond_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ponds_tenant_site
  ON ponds (tenant_id, site_id);

CREATE INDEX IF NOT EXISTS idx_sites_tenant_status
  ON sites (tenant_id, status, name);

CREATE INDEX IF NOT EXISTS idx_hatchery_broodstock_tenant_site
  ON hatchery_broodstock (tenant_id, site_id, status);

CREATE INDEX IF NOT EXISTS idx_hatchery_layings_tenant_site_laid
  ON hatchery_layings (tenant_id, site_id, laid_at DESC);

CREATE INDEX IF NOT EXISTS idx_hatchery_larval_batches_tenant_site_status
  ON hatchery_larval_batches (tenant_id, site_id, status, started_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_tenant_status_due
  ON maintenance_tasks (tenant_id, status, due_at ASC);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_tenant_pond_created
  ON maintenance_tasks (tenant_id, pond_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_category
  ON inventory_items (tenant_id, category, name);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_tenant_item_moved
  ON inventory_movements (tenant_id, item_id, moved_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_tenant_pond_moved
  ON inventory_movements (tenant_id, related_pond_id, moved_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_events_tenant_status_event
  ON health_events (tenant_id, status, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_events_tenant_pond_event
  ON health_events (tenant_id, pond_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_harvest_plans_tenant_status_window
  ON harvest_plans (tenant_id, status, window_start ASC);

CREATE INDEX IF NOT EXISTS idx_harvest_plans_tenant_pond_window
  ON harvest_plans (tenant_id, pond_id, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_harvest_shipments_tenant_plan_created
  ON harvest_shipments (tenant_id, harvest_plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_transport_trips_tenant_status_departure
  ON live_transport_trips (tenant_id, status, departure_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_transport_trips_tenant_code
  ON live_transport_trips (tenant_id, transport_code);

CREATE INDEX IF NOT EXISTS idx_live_transport_readings_tenant_trip_measured
  ON live_transport_tank_readings (tenant_id, trip_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_transport_readings_tenant_risk_measured
  ON live_transport_tank_readings (tenant_id, risk_level, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_water_flow_readings_tenant_recorded
  ON water_flow_readings (tenant_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_water_flow_meters_tenant_enabled
  ON water_flow_meters (tenant_id, enabled, channel_key);

CREATE INDEX IF NOT EXISTS idx_water_flow_alerts_tenant_status_created
  ON water_flow_alerts (tenant_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_water_flow_alerts_open_unique
  ON water_flow_alerts (tenant_id, alert_type)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON audit_logs (tenant_id, created_at DESC);

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS BIGINT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', TRUE), '')::BIGINT
$$;

CREATE OR REPLACE FUNCTION app.rls_bypass_enabled()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.rls_bypass', TRUE), ''), 'off') = 'on'
$$;

DO $$
DECLARE
  table_ref TEXT;
BEGIN
  FOR table_ref IN
    SELECT format('%I.%I', namespace_name, relation_name)
    FROM (
      SELECT DISTINCT
        n.nspname AS namespace_name,
        c.relname AS relation_name
      FROM pg_class c
      JOIN pg_namespace n
        ON n.oid = c.relnamespace
      JOIN pg_attribute a
        ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND a.attname = 'tenant_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND c.relname NOT IN ('users', 'refresh_tokens', 'tenant_features')
    ) tenant_tables
    ORDER BY relation_name
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_ref);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', table_ref);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', table_ref);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_id()) WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_id())',
      table_ref
    );
  END LOOP;
END
$$;
