import { Router } from "express";
import { z } from "zod";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureAccess.js";
import { FEATURE_KEYS } from "../security/featureCatalog.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const broodstockCreateSchema = z.object({
  siteId: z.number().int().positive().optional().nullable(),
  tagCode: z.string().min(2).max(80),
  species: z.string().min(2).max(80),
  sex: z.enum(["female", "male", "unknown"]),
  hatchDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  avgWeightG: z.number().positive().optional().nullable(),
  status: z.enum(["active", "resting", "retired"]).optional(),
  origin: z.string().max(120).optional().nullable(),
  note: z.string().max(500).optional().nullable()
});

const layingCreateSchema = z.object({
  siteId: z.number().int().positive().optional().nullable(),
  femaleBroodstockId: z.number().int().positive().optional().nullable(),
  maleBroodstockId: z.number().int().positive().optional().nullable(),
  layingCode: z.string().min(2).max(80),
  laidAt: z.string().datetime().optional(),
  eggCount: z.number().int().positive(),
  fertilizationPct: z.number().min(0).max(100).optional().nullable(),
  hatchRatePct: z.number().min(0).max(100).optional().nullable(),
  note: z.string().max(500).optional().nullable()
});

const larvalBatchCreateSchema = z.object({
  siteId: z.number().int().positive().optional().nullable(),
  layingId: z.number().int().positive().optional().nullable(),
  batchCode: z.string().min(2).max(80),
  stage: z.string().min(2).max(80),
  startedAt: z.string().datetime().optional(),
  initialCount: z.number().int().positive(),
  currentCount: z.number().int().positive().optional().nullable(),
  survivalPct: z.number().min(0).max(100).optional().nullable(),
  avgWeightMg: z.number().min(0).optional().nullable(),
  densityLarvaeL: z.number().min(0).optional().nullable(),
  feedType: z.string().max(80).optional().nullable(),
  status: z.enum(["active", "transition", "closed"]).optional(),
  note: z.string().max(500).optional().nullable()
});

async function assertSiteBelongsTenant(tenantId, siteId) {
  if (!siteId) {
    return;
  }

  const siteResult = await query(
    `
      SELECT id
      FROM sites
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1
    `,
    [siteId, tenantId]
  );

  if (siteResult.rowCount === 0) {
    throw new HttpError(404, "Site not found");
  }
}

async function assertBroodstockBelongsTenant(tenantId, broodstockId) {
  if (!broodstockId) {
    return;
  }

  const result = await query(
    `
      SELECT id
      FROM hatchery_broodstock
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1
    `,
    [broodstockId, tenantId]
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, "Broodstock not found");
  }
}

async function assertLayingBelongsTenant(tenantId, layingId) {
  if (!layingId) {
    return;
  }

  const result = await query(
    `
      SELECT id
      FROM hatchery_layings
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1
    `,
    [layingId, tenantId]
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, "Laying not found");
  }
}

export const hatcheryRoutes = Router();

hatcheryRoutes.use(requireAuth, requireFeature(FEATURE_KEYS.HATCHERY_VIEW));

hatcheryRoutes.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;

    const [broodstockResult, layingsResult, larvalResult, speciesResult] = await Promise.all([
      query(
        `
          SELECT
            COUNT(*)::int AS total_broodstock,
            COUNT(*) FILTER (WHERE status = 'active')::int AS active_broodstock
          FROM hatchery_broodstock
          WHERE tenant_id = $1
        `,
        [tenantId]
      ),
      query(
        `
          SELECT
            COUNT(*) FILTER (WHERE laid_at >= NOW() - INTERVAL '30 days')::int AS layings_30d,
            ROUND(COALESCE(AVG(fertilization_pct), 0)::numeric, 2) AS avg_fertilization_pct,
            ROUND(COALESCE(AVG(hatch_rate_pct), 0)::numeric, 2) AS avg_hatch_rate_pct
          FROM hatchery_layings
          WHERE tenant_id = $1
        `,
        [tenantId]
      ),
      query(
        `
          SELECT
            COUNT(*)::int AS total_larval_batches,
            COUNT(*) FILTER (WHERE status IN ('active', 'transition'))::int AS active_larval_batches,
            ROUND(COALESCE(AVG(survival_pct), 0)::numeric, 2) AS avg_survival_pct
          FROM hatchery_larval_batches
          WHERE tenant_id = $1
        `,
        [tenantId]
      ),
      query(
        `
          SELECT species, COUNT(*)::int AS total
          FROM hatchery_broodstock
          WHERE tenant_id = $1
          GROUP BY species
          ORDER BY total DESC
        `,
        [tenantId]
      )
    ]);

    res.json({
      ...broodstockResult.rows[0],
      ...layingsResult.rows[0],
      ...larvalResult.rows[0],
      speciesMix: speciesResult.rows
    });
  })
);

hatcheryRoutes.get(
  "/broodstock",
  asyncHandler(async (req, res) => {
    const siteId = req.query.siteId ? Number(req.query.siteId) : null;

    if (req.query.siteId && !siteId) {
      throw new HttpError(400, "siteId must be a valid number");
    }

    const result = await query(
      `
        SELECT
          hb.id,
          hb.site_id,
          s.code AS site_code,
          s.name AS site_name,
          hb.tag_code,
          hb.species,
          hb.sex,
          hb.hatch_date,
          hb.avg_weight_g,
          hb.status,
          hb.origin,
          hb.note,
          hb.created_at
        FROM hatchery_broodstock hb
        LEFT JOIN sites s ON s.id = hb.site_id
        WHERE hb.tenant_id = $1
          AND ($2::bigint IS NULL OR hb.site_id = $2)
        ORDER BY hb.created_at DESC
        LIMIT 400
      `,
      [req.user.tenantId, siteId]
    );

    res.json(result.rows);
  })
);

hatcheryRoutes.post(
  "/broodstock",
  validate(broodstockCreateSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const {
      siteId,
      tagCode,
      species,
      sex,
      hatchDate,
      avgWeightG,
      status,
      origin,
      note
    } = req.body;

    await assertSiteBelongsTenant(tenantId, siteId);

    const result = await query(
      `
        INSERT INTO hatchery_broodstock (
          tenant_id,
          site_id,
          tag_code,
          species,
          sex,
          hatch_date,
          avg_weight_g,
          status,
          origin,
          note
        )
        VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10)
        RETURNING
          id,
          site_id,
          tag_code,
          species,
          sex,
          hatch_date,
          avg_weight_g,
          status,
          origin,
          note,
          created_at
      `,
      [
        tenantId,
        siteId || null,
        tagCode.trim(),
        species.trim().toLowerCase(),
        sex,
        hatchDate || null,
        avgWeightG ?? null,
        status || "active",
        origin || null,
        note || null
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

hatcheryRoutes.get(
  "/layings",
  asyncHandler(async (req, res) => {
    const siteId = req.query.siteId ? Number(req.query.siteId) : null;

    if (req.query.siteId && !siteId) {
      throw new HttpError(400, "siteId must be a valid number");
    }

    const result = await query(
      `
        SELECT
          hl.id,
          hl.site_id,
          s.code AS site_code,
          s.name AS site_name,
          hl.female_broodstock_id,
          female.tag_code AS female_tag_code,
          hl.male_broodstock_id,
          male.tag_code AS male_tag_code,
          hl.laying_code,
          hl.laid_at,
          hl.egg_count,
          hl.fertilization_pct,
          hl.hatch_rate_pct,
          hl.note,
          hl.created_at
        FROM hatchery_layings hl
        LEFT JOIN sites s ON s.id = hl.site_id
        LEFT JOIN hatchery_broodstock female ON female.id = hl.female_broodstock_id
        LEFT JOIN hatchery_broodstock male ON male.id = hl.male_broodstock_id
        WHERE hl.tenant_id = $1
          AND ($2::bigint IS NULL OR hl.site_id = $2)
        ORDER BY hl.laid_at DESC
        LIMIT 400
      `,
      [req.user.tenantId, siteId]
    );

    res.json(result.rows);
  })
);

hatcheryRoutes.post(
  "/layings",
  validate(layingCreateSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const {
      siteId,
      femaleBroodstockId,
      maleBroodstockId,
      layingCode,
      laidAt,
      eggCount,
      fertilizationPct,
      hatchRatePct,
      note
    } = req.body;

    await Promise.all([
      assertSiteBelongsTenant(tenantId, siteId),
      assertBroodstockBelongsTenant(tenantId, femaleBroodstockId),
      assertBroodstockBelongsTenant(tenantId, maleBroodstockId)
    ]);

    const result = await query(
      `
        INSERT INTO hatchery_layings (
          tenant_id,
          site_id,
          female_broodstock_id,
          male_broodstock_id,
          laying_code,
          laid_at,
          egg_count,
          fertilization_pct,
          hatch_rate_pct,
          note
        )
        VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7, $8, $9, $10)
        RETURNING
          id,
          site_id,
          female_broodstock_id,
          male_broodstock_id,
          laying_code,
          laid_at,
          egg_count,
          fertilization_pct,
          hatch_rate_pct,
          note,
          created_at
      `,
      [
        tenantId,
        siteId || null,
        femaleBroodstockId || null,
        maleBroodstockId || null,
        layingCode.trim(),
        laidAt || null,
        eggCount,
        fertilizationPct ?? null,
        hatchRatePct ?? null,
        note || null
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

hatcheryRoutes.get(
  "/larval-batches",
  asyncHandler(async (req, res) => {
    const siteId = req.query.siteId ? Number(req.query.siteId) : null;

    if (req.query.siteId && !siteId) {
      throw new HttpError(400, "siteId must be a valid number");
    }

    const result = await query(
      `
        SELECT
          lb.id,
          lb.site_id,
          s.code AS site_code,
          s.name AS site_name,
          lb.laying_id,
          hl.laying_code,
          lb.batch_code,
          lb.stage,
          lb.started_at,
          lb.initial_count,
          lb.current_count,
          lb.survival_pct,
          lb.avg_weight_mg,
          lb.density_larvae_l,
          lb.feed_type,
          lb.status,
          lb.note,
          lb.updated_at,
          lb.created_at
        FROM hatchery_larval_batches lb
        LEFT JOIN sites s ON s.id = lb.site_id
        LEFT JOIN hatchery_layings hl ON hl.id = lb.laying_id
        WHERE lb.tenant_id = $1
          AND ($2::bigint IS NULL OR lb.site_id = $2)
        ORDER BY lb.started_at DESC
        LIMIT 400
      `,
      [req.user.tenantId, siteId]
    );

    res.json(result.rows);
  })
);

hatcheryRoutes.post(
  "/larval-batches",
  validate(larvalBatchCreateSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const {
      siteId,
      layingId,
      batchCode,
      stage,
      startedAt,
      initialCount,
      currentCount,
      survivalPct,
      avgWeightMg,
      densityLarvaeL,
      feedType,
      status,
      note
    } = req.body;

    await Promise.all([
      assertSiteBelongsTenant(tenantId, siteId),
      assertLayingBelongsTenant(tenantId, layingId)
    ]);

    const result = await query(
      `
        INSERT INTO hatchery_larval_batches (
          tenant_id,
          site_id,
          laying_id,
          batch_code,
          stage,
          started_at,
          initial_count,
          current_count,
          survival_pct,
          avg_weight_mg,
          density_larvae_l,
          feed_type,
          status,
          note,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          COALESCE($6::timestamptz, NOW()),
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          NOW()
        )
        RETURNING
          id,
          site_id,
          laying_id,
          batch_code,
          stage,
          started_at,
          initial_count,
          current_count,
          survival_pct,
          avg_weight_mg,
          density_larvae_l,
          feed_type,
          status,
          note,
          updated_at,
          created_at
      `,
      [
        tenantId,
        siteId || null,
        layingId || null,
        batchCode.trim(),
        stage.trim().toLowerCase(),
        startedAt || null,
        initialCount,
        currentCount ?? null,
        survivalPct ?? null,
        avgWeightMg ?? null,
        densityLarvaeL ?? null,
        feedType || null,
        status || "active",
        note || null
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);
