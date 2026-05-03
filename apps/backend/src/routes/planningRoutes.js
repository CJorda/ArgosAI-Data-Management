import { Router } from "express";
import { z } from "zod";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const lotCodeSchema = z.object({
  lotCode: z.string().min(1).max(80)
});

const numberOrNull = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
};

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

async function getLatestBiomassWithFeedTable(tenantId) {
  const result = await query(
    `
      WITH latest_biomass AS (
        SELECT DISTINCT ON (b.pond_id)
          b.pond_id,
          b.fish_count,
          b.avg_weight_g,
          b.mortality_pct,
          COALESCE(NULLIF(b.species_variant, ''), p.species) AS species
        FROM biomass_entries b
        JOIN ponds p ON p.id = b.pond_id
        WHERE b.tenant_id = $1
        ORDER BY b.pond_id, b.captured_at DESC
      )
      SELECT
        lb.pond_id,
        p.name AS pond_name,
        lb.species,
        lb.fish_count,
        lb.avg_weight_g,
        lb.mortality_pct,
        ft.daily_feed_pct,
        ft.fcr_target
      FROM latest_biomass lb
      JOIN ponds p ON p.id = lb.pond_id
      LEFT JOIN LATERAL (
        SELECT daily_feed_pct, fcr_target
        FROM feed_tables ft
        WHERE ft.tenant_id = $1
          AND ft.species = lb.species
          AND lb.avg_weight_g BETWEEN ft.min_weight_g AND ft.max_weight_g
        ORDER BY ft.max_weight_g ASC
        LIMIT 1
      ) ft ON TRUE
      ORDER BY p.name ASC
    `,
    [tenantId]
  );

  return result.rows;
}

export const planningRoutes = Router();

planningRoutes.use(requireAuth);

planningRoutes.get(
  "/forecasts",
  asyncHandler(async (req, res) => {
    const rows = await getLatestBiomassWithFeedTable(req.user.tenantId);

    const forecasts = rows.map((row) => {
      const fishCount = numberOrNull(row.fish_count) ?? 0;
      const avgWeightG = numberOrNull(row.avg_weight_g) ?? 0;
      const mortalityPct = numberOrNull(row.mortality_pct) ?? 0;
      const feedPct = numberOrNull(row.daily_feed_pct) ?? 1.1;
      const fcrTarget = Math.max(numberOrNull(row.fcr_target) ?? 1.3, 0.4);
      const baseBiomassKg = (fishCount * avgWeightG) / 1000;
      const dailyFeedKg = baseBiomassKg * (feedPct / 100);
      const dailyBiomassGainKg = dailyFeedKg / fcrTarget;
      const mortalityRatePerDay = mortalityPct / 100 / 30;

      const project = (days) => {
        const survival = Math.max(0, 1 - mortalityRatePerDay) ** days;
        const projectedBiomass = (baseBiomassKg + dailyBiomassGainKg * days) * survival;
        return {
          days,
          projectedBiomassKg: round(projectedBiomass, 2),
          projectedFishCount: Math.max(0, Math.round(fishCount * survival))
        };
      };

      return {
        pondId: row.pond_id,
        pondName: row.pond_name,
        species: row.species,
        currentBiomassKg: round(baseBiomassKg, 2),
        recommendedFeedKgDay: round(dailyFeedKg, 2),
        feedPct,
        fcrTarget,
        forecast30d: project(30),
        forecast60d: project(60),
        forecast90d: project(90),
        confidence: row.daily_feed_pct ? "high" : "medium"
      };
    });

    res.json(forecasts);
  })
);

planningRoutes.get(
  "/feeding/recommendations",
  asyncHandler(async (req, res) => {
    const rows = await getLatestBiomassWithFeedTable(req.user.tenantId);

    const recommendations = rows.map((row) => {
      const fishCount = numberOrNull(row.fish_count) ?? 0;
      const avgWeightG = numberOrNull(row.avg_weight_g) ?? 0;
      const baseBiomassKg = (fishCount * avgWeightG) / 1000;
      const feedPct = numberOrNull(row.daily_feed_pct) ?? 1.1;
      const recommendedKgDay = baseBiomassKg * (feedPct / 100);

      return {
        pondId: row.pond_id,
        pondName: row.pond_name,
        species: row.species,
        fishCount,
        avgWeightG,
        biomassKg: round(baseBiomassKg, 2),
        feedPct,
        recommendedKgDay: round(recommendedKgDay, 2),
        source: row.daily_feed_pct ? "tabla" : "estimacion"
      };
    });

    res.json(recommendations);
  })
);

planningRoutes.get(
  "/weekly-sheet",
  asyncHandler(async (req, res) => {
    const weekStartBase = req.query.weekStart ? new Date(req.query.weekStart) : new Date();

    if (Number.isNaN(weekStartBase.getTime())) {
      throw new HttpError(400, "Invalid weekStart date format");
    }

    const weekStart = new Date(Date.UTC(
      weekStartBase.getUTCFullYear(),
      weekStartBase.getUTCMonth(),
      weekStartBase.getUTCDate(),
      0,
      0,
      0,
      0
    ));
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000);

    const result = await query(
      `
        WITH op_week AS (
          SELECT
            pond_id,
            COUNT(*)::int AS operations_count,
            ROUND(COALESCE(SUM(CASE WHEN type = 'feeding' THEN quantity ELSE 0 END), 0)::numeric, 2)
              AS feed_distributed_kg,
            ROUND(COALESCE(SUM(CASE WHEN type = 'treatment' THEN quantity ELSE 0 END), 0)::numeric, 2)
              AS treatment_qty
          FROM operations
          WHERE tenant_id = $1
            AND event_at BETWEEN $2 AND $3
          GROUP BY pond_id
        ),
        bio_week AS (
          SELECT
            pond_id,
            ROUND(COALESCE(AVG(mortality_pct), 0)::numeric, 2) AS avg_mortality_pct,
            ROUND(COALESCE(AVG((fish_count * avg_weight_g) / 1000.0), 0)::numeric, 2)
              AS avg_biomass_kg,
            ROUND(COALESCE(AVG(fcr), 0)::numeric, 3) AS avg_fcr
          FROM biomass_entries
          WHERE tenant_id = $1
            AND captured_at BETWEEN $2 AND $3
          GROUP BY pond_id
        )
        SELECT
          p.id AS pond_id,
          p.name AS pond_name,
          p.species,
          COALESCE(o.operations_count, 0) AS operations_count,
          COALESCE(o.feed_distributed_kg, 0) AS feed_distributed_kg,
          COALESCE(o.treatment_qty, 0) AS treatment_qty,
          COALESCE(b.avg_mortality_pct, 0) AS avg_mortality_pct,
          COALESCE(b.avg_biomass_kg, 0) AS avg_biomass_kg,
          COALESCE(b.avg_fcr, 0) AS avg_fcr
        FROM ponds p
        LEFT JOIN op_week o ON o.pond_id = p.id
        LEFT JOIN bio_week b ON b.pond_id = p.id
        WHERE p.tenant_id = $1
        ORDER BY p.name ASC
      `,
      [req.user.tenantId, weekStart.toISOString(), weekEnd.toISOString()]
    );

    res.json({
      weekStart,
      weekEnd,
      rows: result.rows
    });
  })
);

planningRoutes.get(
  "/performance",
  asyncHandler(async (req, res) => {
    const { from, to } = parseDateRange(req, 30);
    const pondId = req.query.pondId ? Number(req.query.pondId) : null;

    if (req.query.pondId && !pondId) {
      throw new HttpError(400, "pondId must be a valid number");
    }

    const [operationsSummary, biomassSummary] = await Promise.all([
      query(
        `
          SELECT
            type,
            quantity_unit,
            ROUND(SUM(quantity)::numeric, 2) AS total_quantity,
            COUNT(*)::int AS total_events
          FROM operations
          WHERE tenant_id = $1
            AND event_at BETWEEN $2 AND $3
            AND ($4::bigint IS NULL OR pond_id = $4)
          GROUP BY type, quantity_unit
          ORDER BY type ASC, quantity_unit ASC
        `,
        [req.user.tenantId, from.toISOString(), to.toISOString(), pondId]
      ),
      query(
        `
          SELECT
            p.id AS pond_id,
            p.name AS pond_name,
            p.species,
            ROUND(COALESCE(AVG(b.mortality_pct), 0)::numeric, 2) AS avg_mortality_pct,
            ROUND(COALESCE(SUM(b.feed_kg), 0)::numeric, 2) AS total_feed_kg,
            ROUND(
              COALESCE(
                (ARRAY_AGG((b.fish_count * b.avg_weight_g) / 1000.0 ORDER BY b.captured_at ASC))[1],
                0
              )::numeric,
              2
            ) AS biomass_first_kg,
            ROUND(
              COALESCE(
                (ARRAY_AGG((b.fish_count * b.avg_weight_g) / 1000.0 ORDER BY b.captured_at DESC))[1],
                0
              )::numeric,
              2
            ) AS biomass_last_kg,
            COUNT(b.id)::int AS biomass_samples
          FROM ponds p
          LEFT JOIN biomass_entries b
            ON b.pond_id = p.id
            AND b.tenant_id = $1
            AND b.captured_at BETWEEN $2 AND $3
          WHERE p.tenant_id = $1
            AND ($4::bigint IS NULL OR p.id = $4)
          GROUP BY p.id, p.name, p.species
          ORDER BY p.name ASC
        `,
        [req.user.tenantId, from.toISOString(), to.toISOString(), pondId]
      )
    ]);

    const pondPerformance = biomassSummary.rows.map((row) => {
      const biomassFirst = numberOrNull(row.biomass_first_kg) ?? 0;
      const biomassLast = numberOrNull(row.biomass_last_kg) ?? 0;

      return {
        pondId: row.pond_id,
        pondName: row.pond_name,
        species: row.species,
        avgMortalityPct: numberOrNull(row.avg_mortality_pct) ?? 0,
        totalFeedKg: numberOrNull(row.total_feed_kg) ?? 0,
        biomassFirstKg: biomassFirst,
        biomassLastKg: biomassLast,
        biomassDeltaKg: round(biomassLast - biomassFirst, 2) ?? 0,
        biomassSamples: row.biomass_samples
      };
    });

    res.json({
      from,
      to,
      operationsByType: operationsSummary.rows,
      pondPerformance
    });
  })
);

planningRoutes.get(
  "/pond-history",
  asyncHandler(async (req, res) => {
    const { from, to } = parseDateRange(req, 7);
    const pondId = Number(req.query.pondId);

    if (!pondId) {
      throw new HttpError(400, "pondId query param is required");
    }

    const pondResult = await query(
      `
        SELECT id, name, species
        FROM ponds
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1
      `,
      [pondId, req.user.tenantId]
    );

    if (pondResult.rowCount === 0) {
      throw new HttpError(404, "Pond not found");
    }

    const [measurementsResult, operationsResult, biomassResult] = await Promise.all([
      query(
        `
          SELECT
            date_trunc('day', m.recorded_at) AS day,
            s.type AS sensor_type,
            ROUND(AVG(m.value)::numeric, 3) AS avg_value,
            MIN(m.value) AS min_value,
            MAX(m.value) AS max_value,
            COUNT(*)::int AS samples
          FROM measurements m
          JOIN sensors s ON s.id = m.sensor_id
          WHERE m.tenant_id = $1
            AND m.pond_id = $2
            AND m.recorded_at BETWEEN $3 AND $4
          GROUP BY 1, 2
          ORDER BY 1 DESC, 2 ASC
        `,
        [req.user.tenantId, pondId, from.toISOString(), to.toISOString()]
      ),
      query(
        `
          SELECT
            id,
            type,
            quantity,
            quantity_unit,
            lot_code,
            mix_with_lot_code,
            label_tags,
            withdrawal_days,
            withdrawal_until,
            event_at,
            note
          FROM operations
          WHERE tenant_id = $1
            AND pond_id = $2
            AND event_at BETWEEN $3 AND $4
          ORDER BY event_at DESC
          LIMIT 500
        `,
        [req.user.tenantId, pondId, from.toISOString(), to.toISOString()]
      ),
      query(
        `
          SELECT
            b.id,
            COALESCE(species_variant, p.species) AS species_variant,
            lot_code,
            fish_count,
            avg_weight_g,
            mortality_pct,
            vaccination_coverage_pct,
            withdrawal_days_remaining,
            feed_kg,
            fcr,
            captured_at
          FROM biomass_entries b
          JOIN ponds p ON p.id = b.pond_id
          WHERE b.tenant_id = $1
            AND b.pond_id = $2
            AND b.captured_at BETWEEN $3 AND $4
          ORDER BY b.captured_at DESC
          LIMIT 500
        `,
        [req.user.tenantId, pondId, from.toISOString(), to.toISOString()]
      )
    ]);

    res.json({
      pond: pondResult.rows[0],
      from,
      to,
      measurements: measurementsResult.rows,
      operations: operationsResult.rows,
      biomass: biomassResult.rows,
      summary: {
        measurementSamples: measurementsResult.rows.reduce((acc, item) => acc + item.samples, 0),
        operationsCount: operationsResult.rowCount,
        biomassSamples: biomassResult.rowCount
      }
    });
  })
);

planningRoutes.get(
  "/traceability/lots",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          lot_code,
          MAX(event_at) AS last_event_at,
          COUNT(*)::int AS total_events
        FROM (
          SELECT lot_code, event_at
          FROM operations
          WHERE tenant_id = $1
            AND lot_code IS NOT NULL
            AND lot_code <> ''

          UNION ALL

          SELECT lot_code, captured_at AS event_at
          FROM biomass_entries
          WHERE tenant_id = $1
            AND lot_code IS NOT NULL
            AND lot_code <> ''
        ) timeline
        GROUP BY lot_code
        ORDER BY last_event_at DESC
        LIMIT 300
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

planningRoutes.get(
  "/traceability/lots/:lotCode",
  asyncHandler(async (req, res) => {
    const parseResult = lotCodeSchema.safeParse(req.params);

    if (!parseResult.success) {
      throw new HttpError(400, "Invalid lotCode");
    }

    const { lotCode } = parseResult.data;

    const result = await query(
      `
        SELECT *
        FROM (
          SELECT
            'operation'::text AS source,
            o.id::text AS source_id,
            o.event_at,
            p.name AS pond_name,
            o.type AS event_type,
            o.quantity,
            o.quantity_unit,
            o.note,
            o.mix_with_lot_code,
            o.label_tags,
            o.withdrawal_until,
            NULL::double precision AS avg_weight_g,
            NULL::integer AS fish_count,
            NULL::double precision AS mortality_pct,
            NULL::double precision AS feed_kg
          FROM operations o
          JOIN ponds p ON p.id = o.pond_id
          WHERE o.tenant_id = $1
            AND o.lot_code = $2

          UNION ALL

          SELECT
            'biomass'::text AS source,
            b.id::text AS source_id,
            b.captured_at AS event_at,
            p.name AS pond_name,
            'biomass_sample'::text AS event_type,
            NULL::double precision AS quantity,
            NULL::text AS quantity_unit,
            NULL::text AS note,
            NULL::text AS mix_with_lot_code,
            ARRAY[]::text[] AS label_tags,
            NULL::timestamptz AS withdrawal_until,
            b.avg_weight_g,
            b.fish_count,
            b.mortality_pct,
            b.feed_kg
          FROM biomass_entries b
          JOIN ponds p ON p.id = b.pond_id
          WHERE b.tenant_id = $1
            AND b.lot_code = $2
        ) timeline
        ORDER BY event_at DESC
        LIMIT 500
      `,
      [req.user.tenantId, lotCode]
    );

    res.json({
      lotCode,
      timeline: result.rows
    });
  })
);

planningRoutes.get(
  "/withdrawals/active",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          o.id,
          o.pond_id,
          p.name AS pond_name,
          o.lot_code,
          o.withdrawal_days,
          o.withdrawal_until,
          o.event_at,
          o.note
        FROM operations o
        JOIN ponds p ON p.id = o.pond_id
        WHERE o.tenant_id = $1
          AND o.type = 'treatment'
          AND o.withdrawal_until IS NOT NULL
          AND o.withdrawal_until >= NOW()
        ORDER BY o.withdrawal_until ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);
