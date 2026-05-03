import { Router } from "express";
import { z } from "zod";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createBiomassSchema = z.object({
  pondId: z.number().int().positive(),
  speciesVariant: z.string().min(2).max(80).optional().nullable(),
  lotCode: z.string().min(1).max(80).optional().nullable(),
  fishCount: z.number().int().positive(),
  avgWeightG: z.number().positive(),
  mortalityPct: z.number().min(0).max(100),
  vaccinationCoveragePct: z.number().min(0).max(100).optional().nullable(),
  withdrawalDaysRemaining: z.number().int().min(0).max(400).optional().nullable(),
  feedKg: z.number().nonnegative(),
  capturedAt: z.string().datetime().optional()
});

export const biomassRoutes = Router();

biomassRoutes.use(requireAuth);

biomassRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          b.id,
          b.pond_id,
          p.name AS pond_name,
          COALESCE(b.species_variant, p.species) AS species_variant,
          b.lot_code,
          b.fish_count,
          b.avg_weight_g,
          b.mortality_pct,
          b.vaccination_coverage_pct,
          b.withdrawal_days_remaining,
          b.feed_kg,
          b.fcr,
          b.captured_at,
          b.created_at
        FROM biomass_entries b
        JOIN ponds p ON p.id = b.pond_id
        WHERE b.tenant_id = $1
        ORDER BY b.captured_at DESC
        LIMIT 500
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

biomassRoutes.post(
  "/",
  validate(createBiomassSchema),
  asyncHandler(async (req, res) => {
    const {
      pondId,
      speciesVariant,
      lotCode,
      fishCount,
      avgWeightG,
      mortalityPct,
      vaccinationCoveragePct,
      withdrawalDaysRemaining,
      feedKg,
      capturedAt
    } = req.body;

    const estimatedBiomassKg = (fishCount * avgWeightG) / 1000;
    const fcr = estimatedBiomassKg > 0 ? Number((feedKg / estimatedBiomassKg).toFixed(4)) : null;

    const result = await query(
      `
        INSERT INTO biomass_entries (
          tenant_id,
          pond_id,
          species_variant,
          lot_code,
          fish_count,
          avg_weight_g,
          mortality_pct,
          vaccination_coverage_pct,
          withdrawal_days_remaining,
          feed_kg,
          fcr,
          captured_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::timestamptz, NOW()))
        RETURNING
          id,
          pond_id,
          species_variant,
          lot_code,
          fish_count,
          avg_weight_g,
          mortality_pct,
          vaccination_coverage_pct,
          withdrawal_days_remaining,
          feed_kg,
          fcr,
          captured_at,
          created_at
      `,
      [
        req.user.tenantId,
        pondId,
        speciesVariant || null,
        lotCode || null,
        fishCount,
        avgWeightG,
        mortalityPct,
        vaccinationCoveragePct ?? null,
        withdrawalDaysRemaining ?? null,
        feedKg,
        fcr,
        capturedAt || null
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);
