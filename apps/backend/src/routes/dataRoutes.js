import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAnyFeature, requireFeature } from "../middleware/featureAccess.js";
import { validate } from "../middleware/validate.js";
import {
  getDemoHistory,
  getDemoLatestReadings,
  getDemoPonds,
  getDemoSensors,
  getDemoSites
} from "../services/noDbDemoService.js";
import { FEATURE_KEYS } from "../security/featureCatalog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const createPondSchema = z.object({
  siteId: z.number().int().positive().optional().nullable(),
  name: z.string().min(2),
  species: z.string().min(2),
  volumeM3: z.number().positive().optional().nullable()
});

const createSensorSchema = z.object({
  pondId: z.number().int().positive(),
  name: z.string().min(2),
  type: z.string().min(2),
  unit: z.string().min(1)
});

export const dataRoutes = Router();

const requireCoreDataFeature = requireAnyFeature([
  FEATURE_KEYS.DASHBOARD_VIEW,
  FEATURE_KEYS.PLANT_VIEW,
  FEATURE_KEYS.OXYGEN_VIEW,
  FEATURE_KEYS.HISTORY_VIEW,
  FEATURE_KEYS.ALERTS_VIEW,
  FEATURE_KEYS.OPERATIONS_VIEW,
  FEATURE_KEYS.PLANNING_VIEW,
  FEATURE_KEYS.TRACEABILITY_VIEW,
  FEATURE_KEYS.BIOMASS_VIEW,
  FEATURE_KEYS.HATCHERY_VIEW,
  FEATURE_KEYS.CONSOLIDATION_VIEW
]);
const requireReadingsFeature = requireAnyFeature([
  FEATURE_KEYS.DASHBOARD_VIEW,
  FEATURE_KEYS.PLANT_VIEW,
  FEATURE_KEYS.OXYGEN_VIEW,
  FEATURE_KEYS.HISTORY_VIEW
]);
const requireSetpointsFeature = requireFeature(FEATURE_KEYS.SETPOINTS_VIEW);

const setpointPaths = new Set([
  "/oxygen/setpoints",
  "/oxygen/color-setpoints",
  "/temperature/color-setpoints",
  "/alerts/phone-setpoints",
  "/alerts/sms-setpoints"
]);

dataRoutes.use(requireAuth);

dataRoutes.use((req, res, next) => {
  if (setpointPaths.has(req.path)) {
    requireSetpointsFeature(req, res, next);
    return;
  }

  if (req.path.startsWith("/readings/")) {
    requireReadingsFeature(req, res, next);
    return;
  }

  requireCoreDataFeature(req, res, next);
});

dataRoutes.use((req, res, next) => {
  if (!env.noPostgresMode) {
    next();
    return;
  }

  if (req.method === "GET" && req.path === "/sites") {
    res.json(getDemoSites());
    return;
  }

  if (req.method === "GET" && req.path === "/ponds") {
    res.json(getDemoPonds());
    return;
  }

  if (req.method === "GET" && req.path === "/sensors") {
    const pondId = req.query.pondId ? Number(req.query.pondId) : null;
    res.json(getDemoSensors({ pondId }));
    return;
  }

  if (req.method === "GET" && req.path === "/readings/latest") {
    const requestedLimit = Number(req.query.limit || 24);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(200, requestedLimit))
      : 24;

    res.json(getDemoLatestReadings(limit));
    return;
  }

  if (req.method === "GET" && req.path === "/readings/history") {
    const sensorId = Number(req.query.sensorId);

    if (!sensorId) {
      next(new HttpError(400, "sensorId query param is required"));
      return;
    }

    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 24 * 3600 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      next(new HttpError(400, "Invalid from/to date format"));
      return;
    }

    const durationMs = to.getTime() - from.getTime();
    const requestedBucket = String(req.query.bucket || "auto").toLowerCase();
    const bucket =
      requestedBucket === "hour" || requestedBucket === "day"
        ? requestedBucket
        : durationMs > 30 * 24 * 3600 * 1000
          ? "day"
          : "hour";

    const history = getDemoHistory({
      sensorId,
      from,
      to,
      bucket
    });

    if (!history) {
      next(new HttpError(404, "Sensor not found"));
      return;
    }

    res.json(history);
    return;
  }

  if (
    req.method === "GET" &&
    [
      "/oxygen/setpoints",
      "/oxygen/color-setpoints",
      "/temperature/color-setpoints",
      "/alerts/phone-setpoints",
      "/alerts/sms-setpoints"
    ].includes(req.path)
  ) {
    res.json([]);
    return;
  }

  next();
});

dataRoutes.get(
  "/sites",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT id, code, name, region, status, created_at
        FROM sites
        WHERE tenant_id = $1
        ORDER BY name ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/ponds",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          p.id,
          p.site_id,
          s.code AS site_code,
          s.name AS site_name,
          s.region AS site_region,
          p.name,
          p.species,
          p.status,
          p.volume_m3,
          p.created_at
        FROM ponds p
        LEFT JOIN sites s ON s.id = p.site_id
        WHERE p.tenant_id = $1
        ORDER BY p.name ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/oxygen/setpoints",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          slot_code,
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 'Zona 1'
            WHEN LEFT(slot_code, 1) = 'D' THEN 'Zona 2'
            WHEN LEFT(slot_code, 1) = 'E' THEN 'Zona 3'
            WHEN LEFT(slot_code, 1) = 'F' THEN 'Zona 4'
            ELSE 'Sin zona'
          END AS zone_name,
          activation_enabled,
          setpoint_on_pct,
          setpoint_off_pct,
          updated_at
        FROM oxygen_valve_setpoints
        WHERE tenant_id = $1
        ORDER BY
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 1
            WHEN LEFT(slot_code, 1) = 'D' THEN 2
            WHEN LEFT(slot_code, 1) = 'E' THEN 3
            WHEN LEFT(slot_code, 1) = 'F' THEN 4
            ELSE 5
          END,
          COALESCE(NULLIF(SUBSTRING(slot_code FROM '([0-9]+)'), '')::int, 0) ASC,
          slot_code ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/oxygen/color-setpoints",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          slot_code,
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 'Zona 1'
            WHEN LEFT(slot_code, 1) = 'D' THEN 'Zona 2'
            WHEN LEFT(slot_code, 1) = 'E' THEN 'Zona 3'
            WHEN LEFT(slot_code, 1) = 'F' THEN 'Zona 4'
            ELSE 'Sin zona'
          END AS zone_name,
          critical_value,
          low_value,
          high_value,
          updated_at
        FROM oxygen_color_setpoints
        WHERE tenant_id = $1
        ORDER BY
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 1
            WHEN LEFT(slot_code, 1) = 'D' THEN 2
            WHEN LEFT(slot_code, 1) = 'E' THEN 3
            WHEN LEFT(slot_code, 1) = 'F' THEN 4
            ELSE 5
          END,
          COALESCE(NULLIF(SUBSTRING(slot_code FROM '([0-9]+)'), '')::int, 0) ASC,
          slot_code ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/temperature/color-setpoints",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          slot_code,
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 'Zona 1'
            WHEN LEFT(slot_code, 1) = 'D' THEN 'Zona 2'
            WHEN LEFT(slot_code, 1) = 'E' THEN 'Zona 3'
            WHEN LEFT(slot_code, 1) = 'F' THEN 'Zona 4'
            ELSE 'Sin zona'
          END AS zone_name,
          critical_value,
          high_value,
          low_value,
          updated_at
        FROM temperature_color_setpoints
        WHERE tenant_id = $1
        ORDER BY
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 1
            WHEN LEFT(slot_code, 1) = 'D' THEN 2
            WHEN LEFT(slot_code, 1) = 'E' THEN 3
            WHEN LEFT(slot_code, 1) = 'F' THEN 4
            ELSE 5
          END,
          COALESCE(NULLIF(SUBSTRING(slot_code FROM '([0-9]+)'), '')::int, 0) ASC,
          slot_code ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/alerts/phone-setpoints",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          slot_code,
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 'Zona 1'
            WHEN LEFT(slot_code, 1) = 'D' THEN 'Zona 2'
            WHEN LEFT(slot_code, 1) = 'E' THEN 'Zona 3'
            WHEN LEFT(slot_code, 1) = 'F' THEN 'Zona 4'
            ELSE 'Sin zona'
          END AS zone_name,
          enabled,
          oxygen_min_pct,
          oxygen_max_pct,
          temperature_max_c,
          updated_at
        FROM phone_alert_setpoints
        WHERE tenant_id = $1
        ORDER BY
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 1
            WHEN LEFT(slot_code, 1) = 'D' THEN 2
            WHEN LEFT(slot_code, 1) = 'E' THEN 3
            WHEN LEFT(slot_code, 1) = 'F' THEN 4
            ELSE 5
          END,
          COALESCE(NULLIF(SUBSTRING(slot_code FROM '([0-9]+)'), '')::int, 0) ASC,
          slot_code ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/alerts/sms-setpoints",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          slot_code,
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 'Zona 1'
            WHEN LEFT(slot_code, 1) = 'D' THEN 'Zona 2'
            WHEN LEFT(slot_code, 1) = 'E' THEN 'Zona 3'
            WHEN LEFT(slot_code, 1) = 'F' THEN 'Zona 4'
            ELSE 'Sin zona'
          END AS zone_name,
          enabled,
          oxygen_min_pct,
          oxygen_max_pct,
          temperature_max_c,
          updated_at
        FROM sms_alert_setpoints
        WHERE tenant_id = $1
        ORDER BY
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 1
            WHEN LEFT(slot_code, 1) = 'D' THEN 2
            WHEN LEFT(slot_code, 1) = 'E' THEN 3
            WHEN LEFT(slot_code, 1) = 'F' THEN 4
            ELSE 5
          END,
          COALESCE(NULLIF(SUBSTRING(slot_code FROM '([0-9]+)'), '')::int, 0) ASC,
          slot_code ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.post(
  "/ponds",
  validate(createPondSchema),
  asyncHandler(async (req, res) => {
    const { siteId, name, species, volumeM3 } = req.body;

    if (siteId) {
      const siteResult = await query(
        `
          SELECT id
          FROM sites
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1
        `,
        [siteId, req.user.tenantId]
      );

      if (siteResult.rowCount === 0) {
        throw new HttpError(404, "Site not found");
      }
    }

    const result = await query(
      `
        INSERT INTO ponds (tenant_id, site_id, name, species, volume_m3)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, site_id, name, species, status, volume_m3, created_at
      `,
      [req.user.tenantId, siteId ?? null, name, species, volumeM3 ?? null]
    );

    res.status(201).json(result.rows[0]);
  })
);

dataRoutes.get(
  "/sensors",
  asyncHandler(async (req, res) => {
    const pondId = req.query.pondId ? Number(req.query.pondId) : null;

    const params = [req.user.tenantId];
    let whereClause = "WHERE s.tenant_id = $1";

    if (pondId) {
      params.push(pondId);
      whereClause += " AND s.pond_id = $2";
    }

    const result = await query(
      `
        SELECT
          s.id,
          s.pond_id,
          p.name AS pond_name,
          s.name,
          s.type,
          s.unit,
          s.enabled,
          s.created_at
        FROM sensors s
        JOIN ponds p ON p.id = s.pond_id
        ${whereClause}
        ORDER BY p.name ASC, s.name ASC
      `,
      params
    );

    res.json(result.rows);
  })
);

dataRoutes.post(
  "/sensors",
  validate(createSensorSchema),
  asyncHandler(async (req, res) => {
    const { pondId, name, type, unit } = req.body;

    const pondResult = await query(
      `
        SELECT id
        FROM ponds
        WHERE id = $1 AND tenant_id = $2
        LIMIT 1
      `,
      [pondId, req.user.tenantId]
    );

    if (pondResult.rowCount === 0) {
      throw new HttpError(404, "Pond not found");
    }

    const result = await query(
      `
        INSERT INTO sensors (tenant_id, pond_id, name, type, unit)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, pond_id, name, type, unit, enabled, created_at
      `,
      [req.user.tenantId, pondId, name, type, unit]
    );

    res.status(201).json(result.rows[0]);
  })
);

dataRoutes.get(
  "/readings/latest",
  asyncHandler(async (req, res) => {
    const requestedLimit = Number(req.query.limit || 24);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(200, requestedLimit))
      : 24;

    const result = await query(
      `
        SELECT
          m.id,
          m.sensor_id,
          m.pond_id,
          m.value,
          m.quality,
          m.recorded_at,
          s.name AS sensor_name,
          s.type AS sensor_type,
          s.unit,
          p.name AS pond_name
        FROM measurements m
        JOIN sensors s ON s.id = m.sensor_id
        JOIN ponds p ON p.id = m.pond_id
        WHERE m.tenant_id = $1
        ORDER BY m.recorded_at DESC
        LIMIT $2
      `,
      [req.user.tenantId, limit]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/readings/history",
  asyncHandler(async (req, res) => {
    const sensorId = Number(req.query.sensorId);

    if (!sensorId) {
      throw new HttpError(400, "sensorId query param is required");
    }

    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 24 * 3600 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new HttpError(400, "Invalid from/to date format");
    }

    const durationMs = to.getTime() - from.getTime();
    const requestedBucket = String(req.query.bucket || "auto").toLowerCase();

    const bucket =
      requestedBucket === "hour" || requestedBucket === "day"
        ? requestedBucket
        : durationMs > 30 * 24 * 3600 * 1000
          ? "day"
          : "hour";

    const sensorResult = await query(
      `
        SELECT id, name, type, unit
        FROM sensors
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1
      `,
      [sensorId, req.user.tenantId]
    );

    if (sensorResult.rowCount === 0) {
      throw new HttpError(404, "Sensor not found");
    }

    const result = await query(
      `
        SELECT
          date_trunc($4, recorded_at) AS bucket_start,
          ROUND(AVG(value)::numeric, 3) AS avg_value,
          MIN(value) AS min_value,
          MAX(value) AS max_value,
          COUNT(*)::int AS samples
        FROM measurements
        WHERE tenant_id = $1
          AND sensor_id = $2
          AND recorded_at BETWEEN $3 AND $5
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      [req.user.tenantId, sensorId, from.toISOString(), bucket, to.toISOString()]
    );

    res.json({
      sensor: sensorResult.rows[0],
      bucket,
      from,
      to,
      series: result.rows
    });
  })
);
