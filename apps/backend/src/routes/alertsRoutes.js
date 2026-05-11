import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureAccess.js";
import { validate } from "../middleware/validate.js";
import {
  createDemoRule,
  getDemoRiskForecast,
  listDemoAlerts,
  listDemoRules,
  resolveDemoAlert,
  updateDemoAlertProtocol
} from "../services/noDbDemoService.js";
import { FEATURE_KEYS } from "../security/featureCatalog.js";
import { emitToTenant } from "../services/realtimeHub.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { buildAlertProtocolTemplate, normalizeAlertProtocolSteps } from "../utils/alertProtocol.js";
import { HttpError } from "../utils/httpError.js";

const createRuleSchema = z.object({
  pondId: z.number().int().positive().nullable().optional(),
  sensorType: z.string().min(2),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium")
});

const protocolStatusSchema = z.enum(["pending", "acknowledged", "in_progress", "blocked", "resolved"]);

const protocolStepSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(2).max(120),
  description: z.string().max(320).optional().default(""),
  done: z.boolean().optional().default(false)
});

const updateProtocolSchema = z
  .object({
    protocolStatus: protocolStatusSchema.optional(),
    protocolOwnerId: z.number().int().positive().nullable().optional(),
    protocolNotes: z.string().trim().max(1200).nullable().optional(),
    escalationDeadline: z.string().datetime().nullable().optional(),
    protocolSteps: z.array(protocolStepSchema).max(12).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one protocol field is required"
  });

const alertsSelectProjection = `
  a.id,
  a.pond_id,
  a.sensor_id,
  a.rule_id,
  a.severity,
  a.status,
  a.protocol_status,
  a.protocol_owner,
  a.protocol_started_at,
  a.protocol_updated_at,
  COALESCE(a.protocol_steps, '[]'::jsonb) AS protocol_steps,
  a.protocol_notes,
  a.escalation_deadline,
  a.message,
  a.current_value,
  a.created_at,
  a.resolved_at,
  a.resolved_by,
  p.name AS pond_name,
  s.name AS sensor_name,
  s.type AS sensor_type,
  protocol_owner_user.full_name AS protocol_owner_name,
  resolved_user.full_name AS resolved_by_name
`;

const alertsSelectJoins = `
  FROM alerts a
  JOIN ponds p ON p.id = a.pond_id
  JOIN sensors s ON s.id = a.sensor_id
  LEFT JOIN users protocol_owner_user ON protocol_owner_user.id = a.protocol_owner
  LEFT JOIN users resolved_user ON resolved_user.id = a.resolved_by
`;

const riskHorizonHours = [24, 48, 72];
const fallbackThresholdBySensor = {
  oxygen: { min: 6, max: 9.5 },
  temperature: { min: 15, max: 22 },
  ph: { min: 7.1, max: 8.0 },
  salinity: { min: 30, max: 37 },
  turbidity: { min: 0, max: 15 }
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

function resolveRiskLevel(score) {
  if (score >= 78) {
    return "critical";
  }

  if (score >= 58) {
    return "high";
  }

  if (score >= 35) {
    return "medium";
  }

  return "low";
}

function evaluateProximityRisk(value, minThreshold, maxThreshold, span) {
  if (!Number.isFinite(value)) {
    return 0.55;
  }

  const lower = toNumberOrNull(minThreshold);
  const upper = toNumberOrNull(maxThreshold);

  if (lower !== null && value < lower) {
    return clamp(0.66 + (lower - value) / Math.max(span, 0.001), 0, 1);
  }

  if (upper !== null && value > upper) {
    return clamp(0.66 + (value - upper) / Math.max(span, 0.001), 0, 1);
  }

  const distances = [];
  if (lower !== null) {
    distances.push((value - lower) / Math.max(span, 0.001));
  }

  if (upper !== null) {
    distances.push((upper - value) / Math.max(span, 0.001));
  }

  if (distances.length === 0) {
    return 0.22;
  }

  const nearest = Math.max(0, Math.min(...distances));
  return clamp(0.48 - nearest * 0.7, 0.05, 0.5);
}

function evaluateRiskForHorizon({
  latestValue,
  trendPerHour,
  stddevValue,
  minThreshold,
  maxThreshold,
  openAlerts,
  samples,
  hours
}) {
  const lower = toNumberOrNull(minThreshold);
  const upper = toNumberOrNull(maxThreshold);
  const fallbackSpan = Math.max(Math.abs(latestValue || 1) * 0.35, 1);
  const span =
    lower !== null && upper !== null && upper > lower ? upper - lower : fallbackSpan;
  const safeTrend = Number.isFinite(trendPerHour) ? trendPerHour : 0;
  const predictedValue = Number.isFinite(latestValue)
    ? latestValue + safeTrend * hours
    : null;

  const currentRisk = evaluateProximityRisk(latestValue, lower, upper, span);
  const forecastRisk = evaluateProximityRisk(predictedValue, lower, upper, span);
  const volatilityRisk = clamp(Math.abs(stddevValue || 0) / Math.max(span, 0.001), 0, 1);
  const trendRisk = clamp(Math.abs(safeTrend) * hours / Math.max(span, 0.001), 0, 1);
  const openAlertRisk = openAlerts > 0 ? clamp(0.35 + openAlerts * 0.18, 0, 1) : 0;
  const lowSampleRisk = samples < 6 ? 0.6 : samples < 12 ? 0.35 : 0.1;

  const outsideNow =
    Number.isFinite(latestValue) &&
    ((lower !== null && latestValue < lower) || (upper !== null && latestValue > upper));
  const outsideForecast =
    Number.isFinite(predictedValue) &&
    ((lower !== null && predictedValue < lower) || (upper !== null && predictedValue > upper));

  let score =
    (forecastRisk * 0.44 +
      currentRisk * 0.24 +
      volatilityRisk * 0.12 +
      trendRisk * 0.1 +
      openAlertRisk * 0.06 +
      lowSampleRisk * 0.04) *
    100;

  if (outsideNow) {
    score += 8;
  }

  if (outsideForecast) {
    score += 10;
  }

  score = clamp(score, 0, 99.5);
  const level = resolveRiskLevel(score);

  const reasons = [];
  if (outsideNow) {
    reasons.push("Lectura actual fuera de umbral");
  }

  if (outsideForecast) {
    reasons.push(`Proyeccion ${hours}h fuera de umbral`);
  }

  if (Math.abs(safeTrend) * hours >= span * 0.35) {
    reasons.push(`Tendencia acelerada (${round(safeTrend, 3)} por hora)`);
  }

  if (volatilityRisk >= 0.45) {
    reasons.push("Alta variabilidad reciente");
  }

  if (openAlerts > 0) {
    reasons.push(`${openAlerts} alerta(s) abierta(s) en este sensor`);
  }

  if (samples < 8) {
    reasons.push("Muestreo reciente limitado");
  }

  return {
    score: round(score, 1),
    level,
    predictedValue: Number.isFinite(predictedValue) ? round(predictedValue, 3) : null,
    reasons: reasons.slice(0, 3)
  };
}

function aggregatePondRisk(sensorForecasts, hours) {
  const key = `risk${hours}`;
  const rows = sensorForecasts
    .map((item) => ({
      sensorType: item.sensorType,
      ...item[key]
    }))
    .sort((a, b) => b.score - a.score);

  const topRisk = rows[0] || {
    score: 0,
    level: "low",
    predictedValue: null,
    reasons: []
  };

  return {
    score: topRisk.score,
    level: topRisk.level,
    topSensorType: topRisk.sensorType || null,
    sensorsAtRisk: rows.filter((row) => row.level === "high" || row.level === "critical").length,
    reasons: topRisk.reasons || []
  };
}

async function ensureProtocolOwnerBelongsToTenant(protocolOwnerId, tenantId) {
  if (protocolOwnerId === null || protocolOwnerId === undefined) {
    return;
  }

  const ownerResult = await query(
    `
      SELECT id
      FROM users
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1
    `,
    [protocolOwnerId, tenantId]
  );

  if (ownerResult.rowCount === 0) {
    throw new HttpError(404, "Protocol owner user not found for tenant");
  }
}

async function getAlertByIdForTenant(alertId, tenantId) {
  const result = await query(
    `
      SELECT
        ${alertsSelectProjection}
      ${alertsSelectJoins}
      WHERE a.id = $1
        AND a.tenant_id = $2
      LIMIT 1
    `,
    [alertId, tenantId]
  );

  return result.rows[0] || null;
}

export const alertsRoutes = Router();

alertsRoutes.use(requireAuth, requireFeature(FEATURE_KEYS.ALERTS_VIEW));

alertsRoutes.use((req, res, next) => {
  if (!env.noPostgresMode) {
    next();
    return;
  }

  if (req.method === "GET" && req.path === "/") {
    const status = String(req.query.status || "open").toLowerCase();
    res.json(listDemoAlerts(status));
    return;
  }

  if (req.method === "GET" && req.path === "/risk-forecast") {
    res.json(getDemoRiskForecast());
    return;
  }

  if (req.method === "GET" && req.path === "/rules") {
    res.json(listDemoRules());
    return;
  }

  if (req.method === "POST" && req.path === "/rules") {
    const parsed = createRuleSchema.safeParse(req.body);

    if (!parsed.success) {
      next(new HttpError(400, parsed.error.issues[0]?.message || "Invalid payload"));
      return;
    }

    if (parsed.data.minValue === null && parsed.data.maxValue === null) {
      next(new HttpError(400, "At least one threshold is required"));
      return;
    }

    res.status(201).json(createDemoRule(parsed.data));
    return;
  }

  const protocolMatch = req.path.match(/^\/(\d+)\/protocol$/);
  if (req.method === "PATCH" && protocolMatch) {
    const alertId = Number(protocolMatch[1]);

    if (!alertId) {
      next(new HttpError(400, "Invalid alert id"));
      return;
    }

    const parsed = updateProtocolSchema.safeParse(req.body);

    if (!parsed.success) {
      next(new HttpError(400, parsed.error.issues[0]?.message || "Invalid payload"));
      return;
    }

    const payload = updateDemoAlertProtocol(alertId, parsed.data, req.user);

    if (!payload) {
      next(new HttpError(404, "Alert not found"));
      return;
    }

    emitToTenant(req.user.tenantId, "alert:updated", payload);

    if (payload.status === "resolved") {
      emitToTenant(req.user.tenantId, "alert:resolved", payload);
    }

    res.json(payload);
    return;
  }

  const resolveMatch = req.path.match(/^\/(\d+)\/resolve$/);
  if (req.method === "PATCH" && resolveMatch) {
    const alertId = Number(resolveMatch[1]);

    if (!alertId) {
      next(new HttpError(400, "Invalid alert id"));
      return;
    }

    const payload = resolveDemoAlert(alertId, req.user);

    if (!payload) {
      next(new HttpError(404, "Open alert not found"));
      return;
    }

    emitToTenant(req.user.tenantId, "alert:resolved", payload);
    res.json(payload);
    return;
  }

  next();
});

alertsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || "open").toLowerCase();

    const result = await query(
      `
        SELECT
          ${alertsSelectProjection}
        ${alertsSelectJoins}
        WHERE a.tenant_id = $1
          AND ($2 = 'all' OR a.status = $2)
        ORDER BY a.created_at DESC
        LIMIT 300
      `,
      [req.user.tenantId, status]
    );

    const rows = result.rows.map((row) => {
      if ((row.protocol_steps || []).length > 0) {
        return row;
      }

      return {
        ...row,
        protocol_steps: buildAlertProtocolTemplate(row.sensor_type, row.severity)
      };
    });

    res.json(rows);
  })
);

alertsRoutes.get(
  "/risk-forecast",
  asyncHandler(async (req, res) => {
    const pondId = req.query.pondId ? Number(req.query.pondId) : null;

    if (req.query.pondId && !pondId) {
      throw new HttpError(400, "pondId must be a valid number");
    }

    const [telemetryResult, rulesResult, openAlertsResult] = await Promise.all([
      query(
        `
          WITH recent_measurements AS (
            SELECT
              m.pond_id,
              p.name AS pond_name,
              s.type AS sensor_type,
              s.unit AS sensor_unit,
              m.value,
              m.recorded_at
            FROM measurements m
            JOIN ponds p ON p.id = m.pond_id
            JOIN sensors s ON s.id = m.sensor_id
            WHERE m.tenant_id = $1
              AND ($2::bigint IS NULL OR m.pond_id = $2)
              AND m.recorded_at >= NOW() - INTERVAL '96 hours'
          )
          SELECT
            pond_id,
            pond_name,
            sensor_type,
            sensor_unit,
            COUNT(*)::int AS samples,
            MAX(recorded_at) AS latest_at,
            (ARRAY_AGG(value ORDER BY recorded_at DESC))[1]::double precision AS latest_value,
            ROUND(AVG(value)::numeric, 3) AS avg_value,
            ROUND(COALESCE(STDDEV_SAMP(value), 0)::numeric, 3) AS stddev_value,
            COALESCE(REGR_SLOPE(value, EXTRACT(EPOCH FROM recorded_at) / 3600.0), 0)
              ::double precision AS trend_per_hour
          FROM recent_measurements
          GROUP BY pond_id, pond_name, sensor_type, sensor_unit
          ORDER BY pond_name ASC, sensor_type ASC
        `,
        [req.user.tenantId, pondId]
      ),
      query(
        `
          SELECT
            pond_id,
            sensor_type,
            min_value,
            max_value,
            severity,
            created_at
          FROM alert_rules
          WHERE tenant_id = $1
            AND enabled = TRUE
          ORDER BY
            CASE WHEN pond_id IS NULL THEN 1 ELSE 0 END ASC,
            created_at DESC
        `,
        [req.user.tenantId]
      ),
      query(
        `
          SELECT
            a.pond_id,
            s.type AS sensor_type,
            COUNT(*)::int AS open_count
          FROM alerts a
          JOIN sensors s ON s.id = a.sensor_id
          WHERE a.tenant_id = $1
            AND ($2::bigint IS NULL OR a.pond_id = $2)
            AND a.status = 'open'
          GROUP BY a.pond_id, s.type
        `,
        [req.user.tenantId, pondId]
      )
    ]);

    const rulesByKey = new Map();
    for (const rule of rulesResult.rows) {
      const key = `${rule.pond_id || "any"}:${rule.sensor_type}`;
      if (!rulesByKey.has(key)) {
        rulesByKey.set(key, rule);
      }
    }

    const openAlertsBySensor = new Map();
    for (const item of openAlertsResult.rows) {
      openAlertsBySensor.set(`${item.pond_id}:${item.sensor_type}`, Number(item.open_count) || 0);
    }

    const pondsMap = new Map();

    for (const row of telemetryResult.rows) {
      const pondKey = String(row.pond_id);
      if (!pondsMap.has(pondKey)) {
        pondsMap.set(pondKey, {
          pondId: row.pond_id,
          pondName: row.pond_name,
          risk24: { score: 0, level: "low", topSensorType: null, sensorsAtRisk: 0, reasons: [] },
          risk48: { score: 0, level: "low", topSensorType: null, sensorsAtRisk: 0, reasons: [] },
          risk72: { score: 0, level: "low", topSensorType: null, sensorsAtRisk: 0, reasons: [] },
          criticalSensors: [],
          sensorForecasts: []
        });
      }

      const pondRisk = pondsMap.get(pondKey);
      const rule =
        rulesByKey.get(`${row.pond_id}:${row.sensor_type}`) ||
        rulesByKey.get(`any:${row.sensor_type}`) ||
        null;
      const fallback = fallbackThresholdBySensor[row.sensor_type] || {};
      const minThreshold = toNumberOrNull(rule?.min_value) ?? toNumberOrNull(fallback.min);
      const maxThreshold = toNumberOrNull(rule?.max_value) ?? toNumberOrNull(fallback.max);
      const openAlerts = openAlertsBySensor.get(`${row.pond_id}:${row.sensor_type}`) || 0;

      const sensorForecast = {
        sensorType: row.sensor_type,
        sensorUnit: row.sensor_unit,
        severity: rule?.severity || "medium",
        samples: Number(row.samples) || 0,
        latestAt: row.latest_at,
        latestValue: toNumberOrNull(row.latest_value),
        avgValue: toNumberOrNull(row.avg_value),
        stddevValue: toNumberOrNull(row.stddev_value) || 0,
        trendPerHour: toNumberOrNull(row.trend_per_hour) || 0,
        minThreshold,
        maxThreshold,
        openAlerts,
        risk24: evaluateRiskForHorizon({
          latestValue: toNumberOrNull(row.latest_value),
          trendPerHour: toNumberOrNull(row.trend_per_hour) || 0,
          stddevValue: toNumberOrNull(row.stddev_value) || 0,
          minThreshold,
          maxThreshold,
          openAlerts,
          samples: Number(row.samples) || 0,
          hours: 24
        }),
        risk48: evaluateRiskForHorizon({
          latestValue: toNumberOrNull(row.latest_value),
          trendPerHour: toNumberOrNull(row.trend_per_hour) || 0,
          stddevValue: toNumberOrNull(row.stddev_value) || 0,
          minThreshold,
          maxThreshold,
          openAlerts,
          samples: Number(row.samples) || 0,
          hours: 48
        }),
        risk72: evaluateRiskForHorizon({
          latestValue: toNumberOrNull(row.latest_value),
          trendPerHour: toNumberOrNull(row.trend_per_hour) || 0,
          stddevValue: toNumberOrNull(row.stddev_value) || 0,
          minThreshold,
          maxThreshold,
          openAlerts,
          samples: Number(row.samples) || 0,
          hours: 72
        })
      };

      pondRisk.sensorForecasts.push(sensorForecast);
    }

    const ponds = Array.from(pondsMap.values()).map((pond) => {
      const sensorForecasts = pond.sensorForecasts || [];

      const risk24 = aggregatePondRisk(sensorForecasts, 24);
      const risk48 = aggregatePondRisk(sensorForecasts, 48);
      const risk72 = aggregatePondRisk(sensorForecasts, 72);

      const criticalSensors = [...sensorForecasts]
        .map((sensor) => ({
          sensorType: sensor.sensorType,
          score: sensor.risk72.score,
          level: sensor.risk72.level,
          predicted72: sensor.risk72.predictedValue,
          trendPerHour: round(sensor.trendPerHour, 4),
          minThreshold: sensor.minThreshold,
          maxThreshold: sensor.maxThreshold,
          reasons: sensor.risk72.reasons,
          openAlerts: sensor.openAlerts
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      return {
        pondId: pond.pondId,
        pondName: pond.pondName,
        risk24,
        risk48,
        risk72,
        criticalSensors,
        sensorForecasts
      };
    });

    ponds.sort((a, b) => b.risk72.score - a.risk72.score);

    res.json({
      generatedAt: new Date().toISOString(),
      horizons: riskHorizonHours,
      ponds
    });
  })
);

alertsRoutes.patch(
  "/:alertId/protocol",
  validate(updateProtocolSchema),
  asyncHandler(async (req, res) => {
    const alertId = Number(req.params.alertId);

    if (!alertId) {
      throw new HttpError(400, "Invalid alert id");
    }

    await ensureProtocolOwnerBelongsToTenant(req.body.protocolOwnerId, req.user.tenantId);

    const updates = [];
    const values = [alertId, req.user.tenantId];
    let nextIndex = 3;

    if (Object.prototype.hasOwnProperty.call(req.body, "protocolStatus")) {
      updates.push(`protocol_status = $${nextIndex}`);
      values.push(req.body.protocolStatus);
      nextIndex += 1;

      if (req.body.protocolStatus === "in_progress") {
        updates.push("protocol_started_at = COALESCE(protocol_started_at, NOW())");
      }

      if (req.body.protocolStatus === "resolved") {
        updates.push("status = 'resolved'");
        updates.push("resolved_at = COALESCE(resolved_at, NOW())");
        updates.push(`resolved_by = COALESCE(resolved_by, $${nextIndex})`);
        values.push(req.user.id);
        nextIndex += 1;
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "protocolOwnerId")) {
      updates.push(`protocol_owner = $${nextIndex}`);
      values.push(req.body.protocolOwnerId);
      nextIndex += 1;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "protocolNotes")) {
      updates.push(`protocol_notes = $${nextIndex}`);
      values.push(req.body.protocolNotes);
      nextIndex += 1;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "escalationDeadline")) {
      updates.push(`escalation_deadline = $${nextIndex}::timestamptz`);
      values.push(req.body.escalationDeadline);
      nextIndex += 1;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "protocolSteps")) {
      const sanitizedSteps = normalizeAlertProtocolSteps(req.body.protocolSteps);
      updates.push(`protocol_steps = $${nextIndex}::jsonb`);
      values.push(JSON.stringify(sanitizedSteps));
      nextIndex += 1;
    }

    updates.push("protocol_updated_at = NOW()");

    const updateResult = await query(
      `
        UPDATE alerts a
        SET ${updates.join(",\n            ")}
        WHERE a.id = $1
          AND a.tenant_id = $2
        RETURNING a.id
      `,
      values
    );

    if (updateResult.rowCount === 0) {
      throw new HttpError(404, "Alert not found");
    }

    const payload = await getAlertByIdForTenant(alertId, req.user.tenantId);

    if (!payload) {
      throw new HttpError(404, "Alert not found after protocol update");
    }

    emitToTenant(req.user.tenantId, "alert:updated", payload);

    if (payload.status === "resolved") {
      emitToTenant(req.user.tenantId, "alert:resolved", payload);
    }

    res.json(payload);
  })
);

alertsRoutes.patch(
  "/:alertId/resolve",
  asyncHandler(async (req, res) => {
    const alertId = Number(req.params.alertId);

    if (!alertId) {
      throw new HttpError(400, "Invalid alert id");
    }

    const result = await query(
      `
        UPDATE alerts a
        SET status = 'resolved',
            protocol_status = 'resolved',
            protocol_owner = COALESCE(a.protocol_owner, $3),
            protocol_started_at = COALESCE(a.protocol_started_at, NOW()),
            protocol_updated_at = NOW(),
            resolved_at = NOW(),
            resolved_by = $3
        WHERE a.id = $1
          AND a.tenant_id = $2
          AND status = 'open'
        RETURNING a.id
      `,
      [alertId, req.user.tenantId, req.user.id]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, "Open alert not found");
    }

    const payload = await getAlertByIdForTenant(result.rows[0].id, req.user.tenantId);

    if (!payload) {
      throw new HttpError(404, "Resolved alert not found after update");
    }

    emitToTenant(req.user.tenantId, "alert:resolved", payload);

    res.json(payload);
  })
);

alertsRoutes.get(
  "/rules",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT id, pond_id, sensor_type, min_value, max_value, severity, enabled, created_at
        FROM alert_rules
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

alertsRoutes.post(
  "/rules",
  validate(createRuleSchema),
  asyncHandler(async (req, res) => {
    const { pondId, sensorType, minValue, maxValue, severity } = req.body;

    if (minValue === null && maxValue === null) {
      throw new HttpError(400, "At least one threshold is required");
    }

    const result = await query(
      `
        INSERT INTO alert_rules (tenant_id, pond_id, sensor_type, min_value, max_value, severity, enabled)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        RETURNING id, pond_id, sensor_type, min_value, max_value, severity, enabled, created_at
      `,
      [req.user.tenantId, pondId || null, sensorType, minValue || null, maxValue || null, severity]
    );

    res.status(201).json(result.rows[0]);
  })
);
