import { env } from "../config/env.js";
import { query } from "../database/pool.js";
import { emitToTenant } from "./realtimeHub.js";
import { buildAlertProtocolTemplate } from "../utils/alertProtocol.js";

const rangesByType = {
  temperature: { min: 12, max: 26 },
  oxygen: { min: 5, max: 10 },
  salinity: { min: 28, max: 39 },
  ph: { min: 6.8, max: 8.4 },
  turbidity: { min: 1, max: 45 }
};

let timer = null;

function randomWithDrift(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

async function evaluateRules(measurement, sensorType) {
  const rulesResult = await query(
    `
      SELECT id, min_value, max_value, severity
      FROM alert_rules
      WHERE tenant_id = $1
        AND sensor_type = $2
        AND enabled = TRUE
        AND (pond_id IS NULL OR pond_id = $3)
    `,
    [measurement.tenant_id, sensorType, measurement.pond_id]
  );

  for (const rule of rulesResult.rows) {
    const breachedMin = rule.min_value !== null && measurement.value < Number(rule.min_value);
    const breachedMax = rule.max_value !== null && measurement.value > Number(rule.max_value);

    if (!breachedMin && !breachedMax) {
      continue;
    }

    const openAlert = await query(
      `
        SELECT id
        FROM alerts
        WHERE tenant_id = $1
          AND rule_id = $2
          AND sensor_id = $3
          AND status = 'open'
        LIMIT 1
      `,
      [measurement.tenant_id, rule.id, measurement.sensor_id]
    );

    if (openAlert.rowCount > 0) {
      continue;
    }

    const message = breachedMin
      ? `${sensorType} below minimum threshold`
      : `${sensorType} above maximum threshold`;
    const protocolSteps = buildAlertProtocolTemplate(sensorType, rule.severity);

    const created = await query(
      `
        INSERT INTO alerts (
          tenant_id,
          pond_id,
          sensor_id,
          rule_id,
          severity,
          status,
          protocol_status,
          protocol_steps,
          message,
          current_value
        )
        VALUES ($1, $2, $3, $4, $5, 'open', 'pending', $6::jsonb, $7, $8)
        RETURNING
          id,
          tenant_id,
          pond_id,
          sensor_id,
          rule_id,
          severity,
          status,
          protocol_status,
          protocol_owner,
          protocol_started_at,
          protocol_updated_at,
          protocol_steps,
          protocol_notes,
          escalation_deadline,
          message,
          current_value,
          created_at
      `,
      [
        measurement.tenant_id,
        measurement.pond_id,
        measurement.sensor_id,
        rule.id,
        rule.severity,
        JSON.stringify(protocolSteps),
        message,
        measurement.value
      ]
    );

    emitToTenant(measurement.tenant_id, "alert:new", created.rows[0]);
  }
}

async function tick() {
  const sensors = await query(
    `
      SELECT id, tenant_id, pond_id, type, unit, name
      FROM sensors
      WHERE enabled = TRUE
    `
  );

  for (const sensor of sensors.rows) {
    const range = rangesByType[sensor.type] || { min: 0, max: 100 };
    const value = randomWithDrift(range.min, range.max);

    const inserted = await query(
      `
        INSERT INTO measurements (tenant_id, sensor_id, pond_id, value, recorded_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id, tenant_id, sensor_id, pond_id, value, quality, recorded_at
      `,
      [sensor.tenant_id, sensor.id, sensor.pond_id, value]
    );

    const measurement = inserted.rows[0];

    emitToTenant(sensor.tenant_id, "reading:new", {
      ...measurement,
      sensor_type: sensor.type,
      sensor_name: sensor.name,
      unit: sensor.unit
    });

    await evaluateRules(measurement, sensor.type);
  }
}

export function startSimulator() {
  if (!env.simulatorEnabled) {
    return;
  }

  if (timer) {
    clearInterval(timer);
  }

  timer = setInterval(() => {
    tick().catch((error) => {
      console.error("Simulator tick failed", error);
    });
  }, env.simulatorIntervalMs);
}

export function stopSimulator() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
