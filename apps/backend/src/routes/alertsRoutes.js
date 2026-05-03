import { Router } from "express";
import { z } from "zod";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { emitToTenant } from "../services/realtimeHub.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const createRuleSchema = z.object({
  pondId: z.number().int().positive().nullable().optional(),
  sensorType: z.string().min(2),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium")
});

export const alertsRoutes = Router();

alertsRoutes.use(requireAuth);

alertsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || "open").toLowerCase();

    const result = await query(
      `
        SELECT
          a.id,
          a.pond_id,
          a.sensor_id,
          a.rule_id,
          a.severity,
          a.status,
          a.message,
          a.current_value,
          a.created_at,
          a.resolved_at,
          p.name AS pond_name,
          s.name AS sensor_name,
          s.type AS sensor_type
        FROM alerts a
        JOIN ponds p ON p.id = a.pond_id
        JOIN sensors s ON s.id = a.sensor_id
        WHERE a.tenant_id = $1
          AND ($2 = 'all' OR a.status = $2)
        ORDER BY a.created_at DESC
        LIMIT 300
      `,
      [req.user.tenantId, status]
    );

    res.json(result.rows);
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
        UPDATE alerts
        SET status = 'resolved',
            resolved_at = NOW(),
            resolved_by = $3
        WHERE id = $1
          AND tenant_id = $2
          AND status = 'open'
        RETURNING id, tenant_id, status, resolved_at
      `,
      [alertId, req.user.tenantId, req.user.id]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, "Open alert not found");
    }

    const payload = result.rows[0];
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
