import { Router } from "express";
import { z } from "zod";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureAccess.js";
import { FEATURE_KEYS } from "../security/featureCatalog.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const createSiteSchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(2).max(120),
  region: z.string().max(120).optional().nullable(),
  status: z.enum(["active", "inactive", "maintenance"]).optional()
});

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseDateRange(req, defaultDays = 30) {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from
    ? new Date(req.query.from)
    : new Date(to.getTime() - defaultDays * 24 * 3600 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new HttpError(400, "Invalid from/to date format");
  }

  if (from > to) {
    throw new HttpError(400, "from must be lower or equal than to");
  }

  return { from, to };
}

function monthLabelFromNow(monthOffset) {
  const now = new Date();
  const labelDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));

  return labelDate.toLocaleDateString("es-ES", {
    month: "short",
    year: "numeric"
  });
}

function projectSiteSeries(base, assumptions, months) {
  const baseBiomassKg = Math.max(Number(base.baseBiomassKg) || 0, 0);
  const weightedFeedPct = Math.max(Number(base.weightedFeedPct) || 0.8, 0.25);
  const weightedFcrTarget = Math.max(Number(base.weightedFcrTarget) || 1.25, 0.4);
  const weightedMortalityPct = Math.max(Number(base.weightedMortalityPct) || 1.2, 0);
  const monthlyMortalityRate =
    (weightedMortalityPct / 100 / 12) * Math.max(assumptions.mortalitySafetyFactor, 0.35);

  let biomass = baseBiomassKg;
  const rows = [];

  for (let monthIndex = 1; monthIndex <= months; monthIndex += 1) {
    const dailyFeedKg = biomass * (weightedFeedPct / 100);
    const monthlyFeedKg = dailyFeedKg * 30.4;
    const biomassGainKg = monthlyFeedKg / weightedFcrTarget;
    const mortalityLossKg = biomass * monthlyMortalityRate;

    biomass = Math.max(0, biomass + biomassGainKg - mortalityLossKg);

    const projectedRevenueEur = biomass * assumptions.salePricePerKgEur;
    const projectedFeedCostEur = monthlyFeedKg * assumptions.feedCostPerKgEur;
    const projectedGrossMarginEur = projectedRevenueEur - projectedFeedCostEur;

    rows.push({
      monthIndex,
      label: monthLabelFromNow(monthIndex - 1),
      biomassKg: round(biomass, 2),
      feedKg: round(monthlyFeedKg, 2),
      revenueEur: round(projectedRevenueEur, 2),
      feedCostEur: round(projectedFeedCostEur, 2),
      grossMarginEur: round(projectedGrossMarginEur, 2)
    });
  }

  return rows;
}

export const consolidationRoutes = Router();

consolidationRoutes.use(requireAuth, requireFeature(FEATURE_KEYS.CONSOLIDATION_VIEW));

consolidationRoutes.get(
  "/sites",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        WITH pond_count AS (
          SELECT site_id, COUNT(*)::int AS ponds_count
          FROM ponds
          WHERE tenant_id = $1
          GROUP BY site_id
        ),
        larval_count AS (
          SELECT
            site_id,
            COUNT(*) FILTER (WHERE status IN ('active', 'transition'))::int AS active_larval_batches
          FROM hatchery_larval_batches
          WHERE tenant_id = $1
          GROUP BY site_id
        )
        SELECT
          s.id,
          s.code,
          s.name,
          s.region,
          s.status,
          s.created_at,
          COALESCE(pc.ponds_count, 0) AS ponds_count,
          COALESCE(lc.active_larval_batches, 0) AS active_larval_batches
        FROM sites s
        LEFT JOIN pond_count pc ON pc.site_id = s.id
        LEFT JOIN larval_count lc ON lc.site_id = s.id
        WHERE s.tenant_id = $1
        ORDER BY s.name ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

consolidationRoutes.post(
  "/sites",
  validate(createSiteSchema),
  asyncHandler(async (req, res) => {
    const { code, name, region, status } = req.body;

    const result = await query(
      `
        INSERT INTO sites (tenant_id, code, name, region, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, code, name, region, status, created_at
      `,
      [
        req.user.tenantId,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        region ? String(region).trim() : null,
        status || "active"
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

consolidationRoutes.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const { from, to } = parseDateRange(req, 30);
    const siteId = req.query.siteId ? Number(req.query.siteId) : null;

    if (req.query.siteId && !siteId) {
      throw new HttpError(400, "siteId must be a valid number");
    }

    const result = await query(
      `
        WITH scoped_sites AS (
          SELECT id, code, name, region, status
          FROM sites
          WHERE tenant_id = $1
            AND ($4::bigint IS NULL OR id = $4)
        ),
        pond_count AS (
          SELECT p.site_id, COUNT(*)::int AS ponds_count
          FROM ponds p
          WHERE p.tenant_id = $1
          GROUP BY p.site_id
        ),
        latest_biomass AS (
          SELECT DISTINCT ON (b.pond_id)
            b.pond_id,
            (b.fish_count * b.avg_weight_g) / 1000.0 AS biomass_kg
          FROM biomass_entries b
          WHERE b.tenant_id = $1
          ORDER BY b.pond_id, b.captured_at DESC
        ),
        biomass_by_site AS (
          SELECT
            p.site_id,
            ROUND(COALESCE(SUM(lb.biomass_kg), 0)::numeric, 2) AS latest_biomass_kg
          FROM ponds p
          LEFT JOIN latest_biomass lb ON lb.pond_id = p.id
          WHERE p.tenant_id = $1
          GROUP BY p.site_id
        ),
        biomass_window AS (
          SELECT
            p.site_id,
            ROUND(COALESCE(AVG(b.mortality_pct), 0)::numeric, 2) AS avg_mortality_pct
          FROM biomass_entries b
          JOIN ponds p ON p.id = b.pond_id
          WHERE b.tenant_id = $1
            AND b.captured_at BETWEEN $2 AND $3
          GROUP BY p.site_id
        ),
        operations_window AS (
          SELECT
            p.site_id,
            COUNT(*)::int AS operations_count,
            ROUND(COALESCE(SUM(CASE WHEN o.type = 'feeding' THEN o.quantity ELSE 0 END), 0)::numeric, 2)
              AS feed_distributed_kg
          FROM operations o
          JOIN ponds p ON p.id = o.pond_id
          WHERE o.tenant_id = $1
            AND o.event_at BETWEEN $2 AND $3
          GROUP BY p.site_id
        ),
        alerts_open AS (
          SELECT p.site_id, COUNT(*)::int AS open_alerts
          FROM alerts a
          JOIN ponds p ON p.id = a.pond_id
          WHERE a.tenant_id = $1
            AND a.status = 'open'
          GROUP BY p.site_id
        ),
        larval_by_site AS (
          SELECT
            site_id,
            COUNT(*) FILTER (WHERE status IN ('active', 'transition'))::int AS active_larval_batches,
            ROUND(COALESCE(AVG(survival_pct), 0)::numeric, 2) AS avg_larval_survival_pct
          FROM hatchery_larval_batches
          WHERE tenant_id = $1
          GROUP BY site_id
        )
        SELECT
          ss.id AS site_id,
          ss.code AS site_code,
          ss.name AS site_name,
          ss.region,
          ss.status,
          COALESCE(pc.ponds_count, 0) AS ponds_count,
          COALESCE(bb.latest_biomass_kg, 0) AS latest_biomass_kg,
          COALESCE(bw.avg_mortality_pct, 0) AS avg_mortality_pct,
          COALESCE(ow.operations_count, 0) AS operations_count,
          COALESCE(ow.feed_distributed_kg, 0) AS feed_distributed_kg,
          COALESCE(ao.open_alerts, 0) AS open_alerts,
          COALESCE(lb.active_larval_batches, 0) AS active_larval_batches,
          COALESCE(lb.avg_larval_survival_pct, 0) AS avg_larval_survival_pct
        FROM scoped_sites ss
        LEFT JOIN pond_count pc ON pc.site_id = ss.id
        LEFT JOIN biomass_by_site bb ON bb.site_id = ss.id
        LEFT JOIN biomass_window bw ON bw.site_id = ss.id
        LEFT JOIN operations_window ow ON ow.site_id = ss.id
        LEFT JOIN alerts_open ao ON ao.site_id = ss.id
        LEFT JOIN larval_by_site lb ON lb.site_id = ss.id
        ORDER BY ss.name ASC
      `,
      [req.user.tenantId, from.toISOString(), to.toISOString(), siteId]
    );

    const summary = result.rows.reduce(
      (acc, row) => {
        acc.totalSites += 1;
        acc.totalPonds += Number(row.ponds_count) || 0;
        acc.totalBiomassKg += Number(row.latest_biomass_kg) || 0;
        acc.totalOperations += Number(row.operations_count) || 0;
        acc.totalOpenAlerts += Number(row.open_alerts) || 0;
        acc.totalLarvalBatches += Number(row.active_larval_batches) || 0;
        return acc;
      },
      {
        totalSites: 0,
        totalPonds: 0,
        totalBiomassKg: 0,
        totalOperations: 0,
        totalOpenAlerts: 0,
        totalLarvalBatches: 0
      }
    );

    summary.totalBiomassKg = round(summary.totalBiomassKg, 2);

    res.json({
      from,
      to,
      summary,
      sites: result.rows
    });
  })
);

consolidationRoutes.get(
  "/forecast",
  asyncHandler(async (req, res) => {
    const monthsRequested = Number(req.query.months || 24);
    const months = Number.isFinite(monthsRequested)
      ? Math.round(clamp(monthsRequested, 12, 36))
      : 24;
    const siteId = req.query.siteId ? Number(req.query.siteId) : null;

    if (req.query.siteId && !siteId) {
      throw new HttpError(400, "siteId must be a valid number");
    }

    const assumptions = {
      months,
      salePricePerKgEur: Number(req.query.salePricePerKgEur || 6.4),
      feedCostPerKgEur: Number(req.query.feedCostPerKgEur || 1.28),
      mortalitySafetyFactor: Number(req.query.mortalitySafetyFactor || 1)
    };

    assumptions.salePricePerKgEur = clamp(
      Number.isFinite(assumptions.salePricePerKgEur) ? assumptions.salePricePerKgEur : 6.4,
      1,
      25
    );
    assumptions.feedCostPerKgEur = clamp(
      Number.isFinite(assumptions.feedCostPerKgEur) ? assumptions.feedCostPerKgEur : 1.28,
      0.1,
      8
    );
    assumptions.mortalitySafetyFactor = clamp(
      Number.isFinite(assumptions.mortalitySafetyFactor) ? assumptions.mortalitySafetyFactor : 1,
      0.4,
      2
    );

    const inputsResult = await query(
      `
        WITH latest_biomass AS (
          SELECT DISTINCT ON (b.pond_id)
            b.pond_id,
            (b.fish_count * b.avg_weight_g) / 1000.0 AS biomass_kg,
            b.avg_weight_g,
            b.mortality_pct,
            COALESCE(NULLIF(b.species_variant, ''), p.species) AS species
          FROM biomass_entries b
          JOIN ponds p ON p.id = b.pond_id
          WHERE b.tenant_id = $1
          ORDER BY b.pond_id, b.captured_at DESC
        )
        SELECT
          s.id AS site_id,
          s.code AS site_code,
          s.name AS site_name,
          p.id AS pond_id,
          COALESCE(lb.biomass_kg, 650) AS biomass_kg,
          COALESCE(lb.mortality_pct, 1.2) AS mortality_pct,
          COALESCE(ft.daily_feed_pct, 1.2) AS daily_feed_pct,
          COALESCE(ft.fcr_target, 1.25) AS fcr_target
        FROM ponds p
        JOIN sites s ON s.id = p.site_id
        LEFT JOIN latest_biomass lb ON lb.pond_id = p.id
        LEFT JOIN LATERAL (
          SELECT daily_feed_pct, fcr_target
          FROM feed_tables ft
          WHERE ft.tenant_id = $1
            AND ft.species = COALESCE(lb.species, p.species)
            AND COALESCE(lb.avg_weight_g, 220) BETWEEN ft.min_weight_g AND ft.max_weight_g
          ORDER BY ft.max_weight_g ASC
          LIMIT 1
        ) ft ON TRUE
        WHERE p.tenant_id = $1
          AND ($2::bigint IS NULL OR p.site_id = $2)
        ORDER BY s.name ASC, p.name ASC
      `,
      [req.user.tenantId, siteId]
    );

    const groupedBySite = new Map();

    for (const row of inputsResult.rows) {
      const key = String(row.site_id);
      if (!groupedBySite.has(key)) {
        groupedBySite.set(key, {
          siteId: row.site_id,
          siteCode: row.site_code,
          siteName: row.site_name,
          rows: []
        });
      }

      groupedBySite.get(key).rows.push(row);
    }

    const siteSeries = [];

    for (const site of groupedBySite.values()) {
      const baseBiomassKg = site.rows.reduce((sum, row) => sum + Number(row.biomass_kg || 0), 0);
      const safeBiomassForWeights = Math.max(baseBiomassKg, 1);
      const weightedFeedPct =
        site.rows.reduce(
          (sum, row) => sum + Number(row.biomass_kg || 0) * Number(row.daily_feed_pct || 0),
          0
        ) / safeBiomassForWeights;
      const weightedFcrTarget =
        site.rows.reduce(
          (sum, row) => sum + Number(row.biomass_kg || 0) * Number(row.fcr_target || 0),
          0
        ) / safeBiomassForWeights;
      const weightedMortalityPct =
        site.rows.reduce(
          (sum, row) => sum + Number(row.biomass_kg || 0) * Number(row.mortality_pct || 0),
          0
        ) / safeBiomassForWeights;

      const series = projectSiteSeries(
        {
          baseBiomassKg,
          weightedFeedPct,
          weightedFcrTarget,
          weightedMortalityPct
        },
        assumptions,
        months
      );

      const finalPoint = series.at(-1) || {
        biomassKg: 0,
        revenueEur: 0,
        grossMarginEur: 0,
        feedKg: 0,
        feedCostEur: 0
      };

      siteSeries.push({
        siteId: site.siteId,
        siteCode: site.siteCode,
        siteName: site.siteName,
        pondsCount: site.rows.length,
        inputs: {
          baseBiomassKg: round(baseBiomassKg, 2),
          weightedFeedPct: round(weightedFeedPct, 3),
          weightedFcrTarget: round(weightedFcrTarget, 3),
          weightedMortalityPct: round(weightedMortalityPct, 3)
        },
        summary: {
          finalBiomassKg: round(finalPoint.biomassKg, 2),
          finalRevenueEur: round(finalPoint.revenueEur, 2),
          finalFeedKg: round(finalPoint.feedKg, 2),
          finalFeedCostEur: round(finalPoint.feedCostEur, 2),
          finalGrossMarginEur: round(finalPoint.grossMarginEur, 2)
        },
        series
      });
    }

    const consolidatedSeries = Array.from({ length: months }, (_, index) => {
      const monthIndex = index + 1;
      const row = {
        monthIndex,
        label: monthLabelFromNow(index),
        biomassKg: 0,
        feedKg: 0,
        revenueEur: 0,
        feedCostEur: 0,
        grossMarginEur: 0
      };

      for (const site of siteSeries) {
        const sitePoint = site.series[index];
        if (!sitePoint) {
          continue;
        }

        row.biomassKg += Number(sitePoint.biomassKg || 0);
        row.feedKg += Number(sitePoint.feedKg || 0);
        row.revenueEur += Number(sitePoint.revenueEur || 0);
        row.feedCostEur += Number(sitePoint.feedCostEur || 0);
        row.grossMarginEur += Number(sitePoint.grossMarginEur || 0);
      }

      row.biomassKg = round(row.biomassKg, 2);
      row.feedKg = round(row.feedKg, 2);
      row.revenueEur = round(row.revenueEur, 2);
      row.feedCostEur = round(row.feedCostEur, 2);
      row.grossMarginEur = round(row.grossMarginEur, 2);
      return row;
    });

    res.json({
      assumptions,
      siteSeries,
      consolidatedSeries
    });
  })
);
