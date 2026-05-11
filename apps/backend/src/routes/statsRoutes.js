import { Router } from "express";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureAccess.js";
import { getDemoSummary } from "../services/noDbDemoService.js";
import { FEATURE_KEYS } from "../security/featureCatalog.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const statsRoutes = Router();

statsRoutes.use(requireAuth, requireFeature(FEATURE_KEYS.DASHBOARD_VIEW));

statsRoutes.get(
  "/summary",
  asyncHandler(async (req, res) => {
    if (env.noPostgresMode) {
      res.json(getDemoSummary());
      return;
    }

    const tenantId = req.user.tenantId;

    const [alerts, ponds, sensors, operations, biomass] = await Promise.all([
      query(
        `
          SELECT
            COUNT(*) FILTER (WHERE status = 'open')::int AS open_alerts,
            COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_alerts
          FROM alerts
          WHERE tenant_id = $1
        `,
        [tenantId]
      ),
      query(
        `
          SELECT COUNT(*)::int AS total_ponds
          FROM ponds
          WHERE tenant_id = $1
        `,
        [tenantId]
      ),
      query(
        `
          SELECT COUNT(*)::int AS total_sensors
          FROM sensors
          WHERE tenant_id = $1
            AND enabled = TRUE
        `,
        [tenantId]
      ),
      query(
        `
          SELECT COUNT(*)::int AS operations_24h
          FROM operations
          WHERE tenant_id = $1
            AND created_at >= NOW() - INTERVAL '24 hours'
        `,
        [tenantId]
      ),
      query(
        `
          SELECT
            COALESCE(ROUND(SUM((fish_count * avg_weight_g) / 1000.0)::numeric, 2), 0) AS estimated_biomass_kg
          FROM biomass_entries
          WHERE tenant_id = $1
            AND captured_at >= NOW() - INTERVAL '30 days'
        `,
        [tenantId]
      )
    ]);

    res.json({
      openAlerts: alerts.rows[0].open_alerts,
      resolvedAlerts: alerts.rows[0].resolved_alerts,
      totalPonds: ponds.rows[0].total_ponds,
      totalSensors: sensors.rows[0].total_sensors,
      operations24h: operations.rows[0].operations_24h,
      estimatedBiomassKg30d: Number(biomass.rows[0].estimated_biomass_kg)
    });
  })
);
