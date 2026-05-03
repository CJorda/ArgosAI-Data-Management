import { Router } from "express";
import { z } from "zod";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { emitToTenant } from "../services/realtimeHub.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createOperationSchema = z.object({
  pondId: z.number().int().positive(),
  type: z.enum(["feeding", "maintenance", "transfer", "treatment", "cleaning"]),
  quantity: z.number().positive(),
  quantityUnit: z.enum(["kg", "units"]).optional(),
  lotCode: z.string().min(1).max(80).optional().nullable(),
  mixWithLotCode: z.string().min(1).max(80).optional().nullable(),
  labels: z.array(z.string().min(1).max(40)).max(12).optional(),
  withdrawalDays: z.number().int().min(1).max(400).optional().nullable(),
  eventAt: z.string().datetime().optional(),
  note: z.string().max(600).optional().nullable()
});

export const operationsRoutes = Router();

operationsRoutes.use(requireAuth);

operationsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          o.id,
          o.pond_id,
          p.name AS pond_name,
          o.type,
          o.quantity,
          o.quantity_unit,
          o.lot_code,
          o.mix_with_lot_code,
          o.label_tags,
          o.withdrawal_days,
          o.withdrawal_until,
          o.event_at,
          o.note,
          o.created_by,
          o.created_at
        FROM operations o
        JOIN ponds p ON p.id = o.pond_id
        WHERE o.tenant_id = $1
        ORDER BY o.event_at DESC
        LIMIT 300
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

operationsRoutes.post(
  "/",
  validate(createOperationSchema),
  asyncHandler(async (req, res) => {
    const {
      pondId,
      type,
      quantity,
      quantityUnit,
      lotCode,
      mixWithLotCode,
      labels,
      withdrawalDays,
      eventAt,
      note
    } = req.body;

    const normalizedLabels = (labels || []).map((label) => label.trim()).filter(Boolean);
    const normalizedLotCode = lotCode ? lotCode.trim() : null;
    const normalizedMixLot = mixWithLotCode ? mixWithLotCode.trim() : null;
    const effectiveWithdrawalDays = type === "treatment" ? withdrawalDays || null : null;
    const withdrawalUntil =
      effectiveWithdrawalDays && eventAt
        ? new Date(new Date(eventAt).getTime() + effectiveWithdrawalDays * 24 * 3600 * 1000)
        : effectiveWithdrawalDays
          ? new Date(Date.now() + effectiveWithdrawalDays * 24 * 3600 * 1000)
          : null;

    const result = await query(
      `
        INSERT INTO operations (
          tenant_id,
          pond_id,
          type,
          quantity,
          quantity_unit,
          lot_code,
          mix_with_lot_code,
          label_tags,
          withdrawal_days,
          withdrawal_until,
          event_at,
          note,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, COALESCE($11::timestamptz, NOW()), $12, $13)
        RETURNING
          id,
          pond_id,
          type,
          quantity,
          quantity_unit,
          lot_code,
          mix_with_lot_code,
          label_tags,
          withdrawal_days,
          withdrawal_until,
          event_at,
          note,
          created_by,
          created_at
      `,
      [
        req.user.tenantId,
        pondId,
        type,
        quantity,
        quantityUnit || "kg",
        normalizedLotCode,
        normalizedMixLot,
        normalizedLabels,
        effectiveWithdrawalDays,
        withdrawalUntil,
        eventAt || null,
        note || null,
        req.user.id
      ]
    );

    emitToTenant(req.user.tenantId, "operation:new", result.rows[0]);

    res.status(201).json(result.rows[0]);
  })
);
