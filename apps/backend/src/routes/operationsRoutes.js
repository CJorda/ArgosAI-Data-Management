import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { emitToTenant } from "../services/realtimeHub.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const maintenancePriorityEnum = z.enum(["low", "medium", "high", "critical"]);
const maintenanceStatusEnum = z.enum(["pending", "in_progress", "blocked", "done", "cancelled"]);
const inventoryMovementTypeEnum = z.enum(["in", "out", "adjustment"]);
const healthSeverityEnum = z.enum(["low", "medium", "high", "critical"]);
const healthStatusEnum = z.enum(["open", "in_progress", "blocked", "resolved", "cancelled"]);
const harvestStatusEnum = z.enum(["planned", "ready", "in_transit", "completed", "cancelled"]);

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

const taskIdParamsSchema = z.object({
  taskId: z.coerce.number().int().positive()
});

const eventIdParamsSchema = z.object({
  eventId: z.coerce.number().int().positive()
});

const planIdParamsSchema = z.object({
  planId: z.coerce.number().int().positive()
});

const createMaintenanceTaskSchema = z.object({
  pondId: z.number().int().positive().optional().nullable(),
  linkedAlertId: z.number().int().positive().optional().nullable(),
  title: z.string().min(3).max(160),
  description: z.string().max(1200).optional().nullable(),
  source: z.enum(["manual", "predictive", "alert"]).optional(),
  priority: maintenancePriorityEnum.optional(),
  dueAt: z.string().datetime().optional().nullable()
});

const updateMaintenanceTaskSchema = z.object({
  status: maintenanceStatusEnum.optional(),
  priority: maintenancePriorityEnum.optional(),
  dueAt: z.string().datetime().optional().nullable(),
  description: z.string().max(1200).optional().nullable()
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field is required"
});

const createInventoryItemSchema = z.object({
  sku: z.string().min(1).max(60),
  name: z.string().min(2).max(140),
  category: z.string().min(2).max(80),
  unit: z.enum(["kg", "units", "L", "packs", "boxes"]).optional(),
  minStock: z.number().min(0).optional(),
  currentStock: z.number().min(0).optional(),
  location: z.string().max(140).optional().nullable(),
  supplier: z.string().max(140).optional().nullable()
});

const createInventoryMovementSchema = z.object({
  itemId: z.number().int().positive(),
  movementType: inventoryMovementTypeEnum,
  quantity: z.number().positive(),
  targetStock: z.number().min(0).optional().nullable(),
  relatedPondId: z.number().int().positive().optional().nullable(),
  relatedLotCode: z.string().max(80).optional().nullable(),
  reason: z.string().max(280).optional().nullable(),
  unitCost: z.number().min(0).optional().nullable(),
  movedAt: z.string().datetime().optional().nullable()
}).superRefine((payload, ctx) => {
  if (payload.movementType === "adjustment" && (payload.targetStock === null || payload.targetStock === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targetStock"],
      message: "targetStock is required for adjustment movements"
    });
  }
});

const createHealthEventSchema = z.object({
  pondId: z.number().int().positive(),
  lotCode: z.string().max(80).optional().nullable(),
  eventType: z.enum(["treatment", "sample", "mortality", "quarantine", "vaccination", "inspection"]),
  severity: healthSeverityEnum.optional(),
  status: healthStatusEnum.optional(),
  title: z.string().min(3).max(160),
  description: z.string().max(1200).optional().nullable(),
  medicationName: z.string().max(160).optional().nullable(),
  dosage: z.string().max(120).optional().nullable(),
  biosecurityLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  eventAt: z.string().datetime().optional().nullable()
});

const updateHealthEventSchema = z.object({
  status: healthStatusEnum.optional(),
  severity: healthSeverityEnum.optional(),
  description: z.string().max(1200).optional().nullable(),
  resolvedAt: z.string().datetime().optional().nullable()
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field is required"
});

const createHarvestPlanSchema = z.object({
  pondId: z.number().int().positive(),
  lotCode: z.string().min(1).max(80),
  targetWeightG: z.number().min(0).optional().nullable(),
  plannedBiomassKg: z.number().min(0).optional().nullable(),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  destination: z.string().max(160).optional().nullable(),
  logisticsProvider: z.string().max(160).optional().nullable(),
  notes: z.string().max(1200).optional().nullable()
}).superRefine((payload, ctx) => {
  if (new Date(payload.windowStart).getTime() >= new Date(payload.windowEnd).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["windowEnd"],
      message: "windowEnd must be later than windowStart"
    });
  }
});

const updateHarvestPlanStatusSchema = z.object({
  status: harvestStatusEnum
});

const createHarvestShipmentSchema = z.object({
  dispatchCode: z.string().min(1).max(80),
  truckPlate: z.string().max(40).optional().nullable(),
  driverName: z.string().max(120).optional().nullable(),
  departureAt: z.string().datetime().optional().nullable(),
  arrivalEta: z.string().datetime().optional().nullable(),
  deliveredAt: z.string().datetime().optional().nullable(),
  status: z.enum(["scheduled", "in_transit", "delivered", "cancelled"]).optional(),
  documents: z.array(z.string().min(1).max(240)).max(40).optional()
});

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function parseLimit(value, fallback = 120, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
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

async function writeAuditLog({ tenantId, userId, action, entity, entityId, payload }) {
  await query(
    `
      INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, payload)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      tenantId,
      userId || null,
      action,
      entity,
      entityId ? String(entityId) : null,
      JSON.stringify(payload || {})
    ]
  );
}

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
    await writeAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "operation.create",
      entity: "operations",
      entityId: result.rows[0].id,
      payload: {
        pondId,
        type,
        quantity,
        quantityUnit: quantityUnit || "kg",
        lotCode: normalizedLotCode,
        mixWithLotCode: normalizedMixLot
      }
    });

    res.status(201).json(result.rows[0]);
  })
);

operationsRoutes.get(
  "/maintenance/plan",
  asyncHandler(async (req, res) => {
    const statusFilter = req.query.status ? String(req.query.status) : null;
    const limit = parseLimit(req.query.limit, 120, 300);

    if (statusFilter && !maintenanceStatusEnum.options.includes(statusFilter)) {
      throw new HttpError(400, "Invalid maintenance status filter");
    }

    const [tasksResult, recommendationsResult] = await Promise.all([
      query(
        `
          SELECT
            mt.id,
            mt.pond_id,
            p.name AS pond_name,
            mt.linked_alert_id,
            mt.title,
            mt.description,
            mt.source,
            mt.priority,
            mt.status,
            mt.due_at,
            mt.completed_at,
            mt.created_at,
            mt.updated_at,
            a.severity AS linked_alert_severity
          FROM maintenance_tasks mt
          LEFT JOIN ponds p ON p.id = mt.pond_id
          LEFT JOIN alerts a ON a.id = mt.linked_alert_id
          WHERE mt.tenant_id = $1
            AND ($2::text IS NULL OR mt.status = $2)
          ORDER BY
            CASE mt.status
              WHEN 'pending' THEN 0
              WHEN 'in_progress' THEN 1
              WHEN 'blocked' THEN 2
              ELSE 3
            END,
            mt.due_at ASC NULLS LAST,
            mt.created_at DESC
          LIMIT $3
        `,
        [req.user.tenantId, statusFilter, limit]
      ),
      query(
        `
          WITH last_ops AS (
            SELECT
              pond_id,
              MAX(event_at) FILTER (WHERE type IN ('maintenance', 'cleaning')) AS last_maintenance_at
            FROM operations
            WHERE tenant_id = $1
            GROUP BY pond_id
          ),
          open_alerts AS (
            SELECT
              pond_id,
              COUNT(*)::int AS open_alerts,
              COUNT(*) FILTER (WHERE severity = 'high')::int AS severe_open_alerts
            FROM alerts
            WHERE tenant_id = $1
              AND status = 'open'
            GROUP BY pond_id
          )
          SELECT
            p.id AS pond_id,
            p.name AS pond_name,
            lo.last_maintenance_at,
            COALESCE(oa.open_alerts, 0) AS open_alerts,
            COALESCE(oa.severe_open_alerts, 0) AS severe_open_alerts,
            ROUND(
              COALESCE(
                EXTRACT(EPOCH FROM (NOW() - lo.last_maintenance_at)) / 86400,
                999
              )::numeric,
              1
            ) AS days_since_maintenance
          FROM ponds p
          LEFT JOIN last_ops lo ON lo.pond_id = p.id
          LEFT JOIN open_alerts oa ON oa.pond_id = p.id
          WHERE p.tenant_id = $1
          ORDER BY p.name ASC
        `,
        [req.user.tenantId]
      )
    ]);

    const recommendations = recommendationsResult.rows.map((row) => {
      const daysSince = Number(row.days_since_maintenance) || 0;
      const openAlerts = Number(row.open_alerts) || 0;
      const severeOpenAlerts = Number(row.severe_open_alerts) || 0;

      let priority = "low";
      if (severeOpenAlerts > 0 || daysSince >= 21) {
        priority = "critical";
      } else if (daysSince >= 14 || openAlerts >= 2) {
        priority = "high";
      } else if (daysSince >= 7 || openAlerts >= 1) {
        priority = "medium";
      }

      const dueAt = new Date(
        Date.now() + (priority === "critical" ? 0 : priority === "high" ? 1 : 3) * 24 * 3600 * 1000
      ).toISOString();

      return {
        pondId: row.pond_id,
        pondName: row.pond_name,
        priority,
        dueAt,
        lastMaintenanceAt: row.last_maintenance_at,
        daysSinceMaintenance: daysSince,
        openAlerts,
        severeOpenAlerts,
        suggestedTitle: severeOpenAlerts > 0
          ? `Inspeccion correctiva por alertas en ${row.pond_name}`
          : `Mantenimiento preventivo ${row.pond_name}`,
        reason: severeOpenAlerts > 0
          ? "Hay alertas severas abiertas asociadas a esta piscina"
          : `Han pasado ${daysSince.toFixed(1)} dias desde la ultima intervencion`
      };
    });

    res.json({
      tasks: tasksResult.rows,
      recommendations
    });
  })
);

operationsRoutes.post(
  "/maintenance/tasks",
  validate(createMaintenanceTaskSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body;

    const result = await query(
      `
        INSERT INTO maintenance_tasks (
          tenant_id,
          pond_id,
          linked_alert_id,
          title,
          description,
          source,
          priority,
          status,
          due_at,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
        RETURNING
          id,
          pond_id,
          linked_alert_id,
          title,
          description,
          source,
          priority,
          status,
          due_at,
          completed_at,
          created_at,
          updated_at
      `,
      [
        req.user.tenantId,
        payload.pondId || null,
        payload.linkedAlertId || null,
        payload.title.trim(),
        normalizeText(payload.description),
        payload.source || "manual",
        payload.priority || "medium",
        payload.dueAt || null,
        req.user.id
      ]
    );

    await writeAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "maintenance.task.create",
      entity: "maintenance_tasks",
      entityId: result.rows[0].id,
      payload
    });

    res.status(201).json(result.rows[0]);
  })
);

operationsRoutes.patch(
  "/maintenance/tasks/:taskId",
  validate(taskIdParamsSchema, "params"),
  validate(updateMaintenanceTaskSchema),
  asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const payload = req.body;

    const hasDueAt = Object.prototype.hasOwnProperty.call(payload, "dueAt");
    const hasDescription = Object.prototype.hasOwnProperty.call(payload, "description");

    const result = await query(
      `
        UPDATE maintenance_tasks
        SET
          status = COALESCE($3, status),
          priority = COALESCE($4, priority),
          due_at = CASE WHEN $5::boolean THEN $6::timestamptz ELSE due_at END,
          description = CASE WHEN $7::boolean THEN $8 ELSE description END,
          acknowledged_by = CASE
            WHEN COALESCE($3, status) IN ('in_progress', 'blocked') THEN $9
            ELSE acknowledged_by
          END,
          completed_by = CASE
            WHEN COALESCE($3, status) = 'done' THEN $9
            WHEN COALESCE($3, status) IN ('pending', 'in_progress', 'blocked') THEN NULL
            ELSE completed_by
          END,
          completed_at = CASE
            WHEN COALESCE($3, status) = 'done' THEN NOW()
            WHEN COALESCE($3, status) IN ('pending', 'in_progress', 'blocked') THEN NULL
            ELSE completed_at
          END,
          updated_at = NOW()
        WHERE id = $1
          AND tenant_id = $2
        RETURNING
          id,
          pond_id,
          linked_alert_id,
          title,
          description,
          source,
          priority,
          status,
          due_at,
          completed_at,
          created_at,
          updated_at
      `,
      [
        taskId,
        req.user.tenantId,
        payload.status || null,
        payload.priority || null,
        hasDueAt,
        payload.dueAt || null,
        hasDescription,
        normalizeText(payload.description),
        req.user.id
      ]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, "Maintenance task not found");
    }

    await writeAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "maintenance.task.update",
      entity: "maintenance_tasks",
      entityId: taskId,
      payload
    });

    res.json(result.rows[0]);
  })
);

operationsRoutes.get(
  "/inventory/items",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          id,
          sku,
          name,
          category,
          unit,
          min_stock,
          current_stock,
          location,
          supplier,
          created_at,
          updated_at,
          (current_stock <= min_stock) AS below_min_stock
        FROM inventory_items
        WHERE tenant_id = $1
        ORDER BY below_min_stock DESC, category ASC, name ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

operationsRoutes.post(
  "/inventory/items",
  validate(createInventoryItemSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body;

    const result = await query(
      `
        INSERT INTO inventory_items (
          tenant_id,
          sku,
          name,
          category,
          unit,
          min_stock,
          current_stock,
          location,
          supplier
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
          id,
          sku,
          name,
          category,
          unit,
          min_stock,
          current_stock,
          location,
          supplier,
          created_at,
          updated_at,
          (current_stock <= min_stock) AS below_min_stock
      `,
      [
        req.user.tenantId,
        payload.sku.trim().toUpperCase(),
        payload.name.trim(),
        payload.category.trim(),
        payload.unit || "kg",
        payload.minStock || 0,
        payload.currentStock || 0,
        normalizeText(payload.location),
        normalizeText(payload.supplier)
      ]
    );

    await writeAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "inventory.item.create",
      entity: "inventory_items",
      entityId: result.rows[0].id,
      payload
    });

    res.status(201).json(result.rows[0]);
  })
);

operationsRoutes.get(
  "/inventory/movements",
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 180, 600);

    const result = await query(
      `
        SELECT
          m.id,
          m.item_id,
          i.sku,
          i.name AS item_name,
          i.unit,
          m.movement_type,
          m.quantity,
          m.related_pond_id,
          p.name AS pond_name,
          m.related_lot_code,
          m.reason,
          m.unit_cost,
          m.moved_at,
          m.created_at
        FROM inventory_movements m
        JOIN inventory_items i ON i.id = m.item_id
        LEFT JOIN ponds p ON p.id = m.related_pond_id
        WHERE m.tenant_id = $1
        ORDER BY m.moved_at DESC
        LIMIT $2
      `,
      [req.user.tenantId, limit]
    );

    res.json(result.rows);
  })
);

operationsRoutes.post(
  "/inventory/movements",
  validate(createInventoryMovementSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const itemResult = await client.query(
        `
          SELECT id, sku, name, unit, min_stock, current_stock
          FROM inventory_items
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [payload.itemId, req.user.tenantId]
      );

      if (itemResult.rowCount === 0) {
        throw new HttpError(404, "Inventory item not found");
      }

      const item = itemResult.rows[0];
      const currentStock = Number(item.current_stock) || 0;

      let nextStock = currentStock;
      if (payload.movementType === "in") {
        nextStock = currentStock + payload.quantity;
      } else if (payload.movementType === "out") {
        nextStock = currentStock - payload.quantity;
      } else {
        nextStock = Number(payload.targetStock);
      }

      if (!Number.isFinite(nextStock) || nextStock < 0) {
        throw new HttpError(400, "Stock cannot be negative after movement");
      }

      const movementQuantity = payload.movementType === "adjustment"
        ? Number((nextStock - currentStock).toFixed(4))
        : payload.quantity;

      await client.query(
        `
          UPDATE inventory_items
          SET current_stock = $1,
              updated_at = NOW()
          WHERE id = $2
            AND tenant_id = $3
        `,
        [nextStock, payload.itemId, req.user.tenantId]
      );

      const movementResult = await client.query(
        `
          INSERT INTO inventory_movements (
            tenant_id,
            item_id,
            related_pond_id,
            movement_type,
            quantity,
            related_lot_code,
            reason,
            unit_cost,
            moved_at,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), $10)
          RETURNING
            id,
            item_id,
            movement_type,
            quantity,
            related_pond_id,
            related_lot_code,
            reason,
            unit_cost,
            moved_at,
            created_at
        `,
        [
          req.user.tenantId,
          payload.itemId,
          payload.relatedPondId || null,
          payload.movementType,
          movementQuantity,
          normalizeText(payload.relatedLotCode),
          normalizeText(payload.reason),
          payload.unitCost || null,
          payload.movedAt || null,
          req.user.id
        ]
      );

      await client.query("COMMIT");

      await writeAuditLog({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: "inventory.movement.create",
        entity: "inventory_movements",
        entityId: movementResult.rows[0].id,
        payload: {
          ...payload,
          resultingStock: nextStock
        }
      });

      res.status(201).json({
        ...movementResult.rows[0],
        item: {
          id: item.id,
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          minStock: Number(item.min_stock) || 0,
          previousStock: currentStock,
          resultingStock: nextStock
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

operationsRoutes.get(
  "/health/events",
  asyncHandler(async (req, res) => {
    const statusFilter = req.query.status ? String(req.query.status) : null;
    const severityFilter = req.query.severity ? String(req.query.severity) : null;
    const limit = parseLimit(req.query.limit, 160, 600);

    if (statusFilter && !healthStatusEnum.options.includes(statusFilter)) {
      throw new HttpError(400, "Invalid health status filter");
    }

    if (severityFilter && !healthSeverityEnum.options.includes(severityFilter)) {
      throw new HttpError(400, "Invalid health severity filter");
    }

    const result = await query(
      `
        SELECT
          e.id,
          e.pond_id,
          p.name AS pond_name,
          e.lot_code,
          e.event_type,
          e.severity,
          e.status,
          e.title,
          e.description,
          e.medication_name,
          e.dosage,
          e.biosecurity_level,
          e.event_at,
          e.resolved_at,
          e.created_at
        FROM health_events e
        JOIN ponds p ON p.id = e.pond_id
        WHERE e.tenant_id = $1
          AND ($2::text IS NULL OR e.status = $2)
          AND ($3::text IS NULL OR e.severity = $3)
        ORDER BY e.event_at DESC
        LIMIT $4
      `,
      [req.user.tenantId, statusFilter, severityFilter, limit]
    );

    res.json(result.rows);
  })
);

operationsRoutes.post(
  "/health/events",
  validate(createHealthEventSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body;

    const result = await query(
      `
        INSERT INTO health_events (
          tenant_id,
          pond_id,
          lot_code,
          event_type,
          severity,
          status,
          title,
          description,
          medication_name,
          dosage,
          biosecurity_level,
          event_at,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          COALESCE($12::timestamptz, NOW()),
          $13
        )
        RETURNING
          id,
          pond_id,
          lot_code,
          event_type,
          severity,
          status,
          title,
          description,
          medication_name,
          dosage,
          biosecurity_level,
          event_at,
          resolved_at,
          created_at
      `,
      [
        req.user.tenantId,
        payload.pondId,
        normalizeText(payload.lotCode),
        payload.eventType,
        payload.severity || "medium",
        payload.status || "open",
        payload.title.trim(),
        normalizeText(payload.description),
        normalizeText(payload.medicationName),
        normalizeText(payload.dosage),
        payload.biosecurityLevel || payload.severity || "medium",
        payload.eventAt || null,
        req.user.id
      ]
    );

    await writeAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "health.event.create",
      entity: "health_events",
      entityId: result.rows[0].id,
      payload
    });

    res.status(201).json(result.rows[0]);
  })
);

operationsRoutes.patch(
  "/health/events/:eventId",
  validate(eventIdParamsSchema, "params"),
  validate(updateHealthEventSchema),
  asyncHandler(async (req, res) => {
    const { eventId } = req.params;
    const payload = req.body;
    const hasDescription = Object.prototype.hasOwnProperty.call(payload, "description");
    const hasResolvedAt = Object.prototype.hasOwnProperty.call(payload, "resolvedAt");

    const result = await query(
      `
        UPDATE health_events
        SET
          status = COALESCE($3, status),
          severity = COALESCE($4, severity),
          description = CASE WHEN $5::boolean THEN $6 ELSE description END,
          resolved_at = CASE
            WHEN $7::boolean THEN $8::timestamptz
            WHEN COALESCE($3, status) = 'resolved' THEN NOW()
            WHEN COALESCE($3, status) <> 'resolved' THEN NULL
            ELSE resolved_at
          END
        WHERE id = $1
          AND tenant_id = $2
        RETURNING
          id,
          pond_id,
          lot_code,
          event_type,
          severity,
          status,
          title,
          description,
          medication_name,
          dosage,
          biosecurity_level,
          event_at,
          resolved_at,
          created_at
      `,
      [
        eventId,
        req.user.tenantId,
        payload.status || null,
        payload.severity || null,
        hasDescription,
        normalizeText(payload.description),
        hasResolvedAt,
        payload.resolvedAt || null
      ]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, "Health event not found");
    }

    await writeAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "health.event.update",
      entity: "health_events",
      entityId: eventId,
      payload
    });

    res.json(result.rows[0]);
  })
);

operationsRoutes.get(
  "/harvest/plans",
  asyncHandler(async (req, res) => {
    const statusFilter = req.query.status ? String(req.query.status) : null;

    if (statusFilter && !harvestStatusEnum.options.includes(statusFilter)) {
      throw new HttpError(400, "Invalid harvest status filter");
    }

    const result = await query(
      `
        SELECT
          hp.id,
          hp.pond_id,
          p.name AS pond_name,
          hp.lot_code,
          hp.target_weight_g,
          hp.planned_biomass_kg,
          hp.window_start,
          hp.window_end,
          hp.destination,
          hp.logistics_provider,
          hp.status,
          hp.notes,
          hp.completed_at,
          hp.created_at,
          hp.updated_at,
          COALESCE(COUNT(hs.id), 0)::int AS shipments_count
        FROM harvest_plans hp
        JOIN ponds p ON p.id = hp.pond_id
        LEFT JOIN harvest_shipments hs ON hs.harvest_plan_id = hp.id
        WHERE hp.tenant_id = $1
          AND ($2::text IS NULL OR hp.status = $2)
        GROUP BY hp.id, p.name
        ORDER BY hp.window_start ASC, hp.created_at DESC
      `,
      [req.user.tenantId, statusFilter]
    );

    res.json(result.rows);
  })
);

operationsRoutes.post(
  "/harvest/plans",
  validate(createHarvestPlanSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body;

    const result = await query(
      `
        INSERT INTO harvest_plans (
          tenant_id,
          pond_id,
          lot_code,
          target_weight_g,
          planned_biomass_kg,
          window_start,
          window_end,
          destination,
          logistics_provider,
          status,
          notes,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::timestamptz,
          $7::timestamptz,
          $8,
          $9,
          'planned',
          $10,
          $11
        )
        RETURNING
          id,
          pond_id,
          lot_code,
          target_weight_g,
          planned_biomass_kg,
          window_start,
          window_end,
          destination,
          logistics_provider,
          status,
          notes,
          completed_at,
          created_at,
          updated_at
      `,
      [
        req.user.tenantId,
        payload.pondId,
        payload.lotCode.trim(),
        payload.targetWeightG || null,
        payload.plannedBiomassKg || null,
        payload.windowStart,
        payload.windowEnd,
        normalizeText(payload.destination),
        normalizeText(payload.logisticsProvider),
        normalizeText(payload.notes),
        req.user.id
      ]
    );

    await writeAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "harvest.plan.create",
      entity: "harvest_plans",
      entityId: result.rows[0].id,
      payload
    });

    res.status(201).json(result.rows[0]);
  })
);

operationsRoutes.patch(
  "/harvest/plans/:planId/status",
  validate(planIdParamsSchema, "params"),
  validate(updateHarvestPlanStatusSchema),
  asyncHandler(async (req, res) => {
    const { planId } = req.params;
    const { status } = req.body;

    const result = await query(
      `
        UPDATE harvest_plans
        SET
          status = $3,
          completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE NULL END,
          updated_at = NOW()
        WHERE id = $1
          AND tenant_id = $2
        RETURNING
          id,
          pond_id,
          lot_code,
          target_weight_g,
          planned_biomass_kg,
          window_start,
          window_end,
          destination,
          logistics_provider,
          status,
          notes,
          completed_at,
          created_at,
          updated_at
      `,
      [planId, req.user.tenantId, status]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, "Harvest plan not found");
    }

    await writeAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "harvest.plan.status.update",
      entity: "harvest_plans",
      entityId: planId,
      payload: { status }
    });

    res.json(result.rows[0]);
  })
);

operationsRoutes.post(
  "/harvest/plans/:planId/shipments",
  validate(planIdParamsSchema, "params"),
  validate(createHarvestShipmentSchema),
  asyncHandler(async (req, res) => {
    const { planId } = req.params;
    const payload = req.body;

    const planResult = await query(
      `
        SELECT id
        FROM harvest_plans
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1
      `,
      [planId, req.user.tenantId]
    );

    if (planResult.rowCount === 0) {
      throw new HttpError(404, "Harvest plan not found");
    }

    const result = await query(
      `
        INSERT INTO harvest_shipments (
          tenant_id,
          harvest_plan_id,
          dispatch_code,
          truck_plate,
          driver_name,
          departure_at,
          arrival_eta,
          delivered_at,
          status,
          documents,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::timestamptz,
          $7::timestamptz,
          $8::timestamptz,
          $9,
          $10::jsonb,
          $11
        )
        RETURNING
          id,
          harvest_plan_id,
          dispatch_code,
          truck_plate,
          driver_name,
          departure_at,
          arrival_eta,
          delivered_at,
          status,
          documents,
          created_at
      `,
      [
        req.user.tenantId,
        planId,
        payload.dispatchCode.trim(),
        normalizeText(payload.truckPlate),
        normalizeText(payload.driverName),
        payload.departureAt || null,
        payload.arrivalEta || null,
        payload.deliveredAt || null,
        payload.status || "scheduled",
        JSON.stringify(payload.documents || []),
        req.user.id
      ]
    );

    await writeAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: "harvest.shipment.create",
      entity: "harvest_shipments",
      entityId: result.rows[0].id,
      payload: {
        ...payload,
        planId
      }
    });

    res.status(201).json(result.rows[0]);
  })
);

operationsRoutes.get(
  "/harvest/shipments",
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 150, 500);

    const result = await query(
      `
        SELECT
          hs.id,
          hs.harvest_plan_id,
          hp.lot_code,
          hp.pond_id,
          p.name AS pond_name,
          hs.dispatch_code,
          hs.truck_plate,
          hs.driver_name,
          hs.departure_at,
          hs.arrival_eta,
          hs.delivered_at,
          hs.status,
          hs.documents,
          hs.created_at
        FROM harvest_shipments hs
        JOIN harvest_plans hp ON hp.id = hs.harvest_plan_id
        JOIN ponds p ON p.id = hp.pond_id
        WHERE hs.tenant_id = $1
        ORDER BY COALESCE(hs.departure_at, hs.created_at) DESC
        LIMIT $2
      `,
      [req.user.tenantId, limit]
    );

    res.json(result.rows);
  })
);

operationsRoutes.get(
  "/audit/logs",
  asyncHandler(async (req, res) => {
    const { from, to } = parseDateRange(req, 30);
    const actionFilter = req.query.action ? String(req.query.action).trim() : null;
    const entityFilter = req.query.entity ? String(req.query.entity).trim() : null;
    const limit = parseLimit(req.query.limit, 200, 600);

    const result = await query(
      `
        SELECT
          a.id,
          a.action,
          a.entity,
          a.entity_id,
          a.payload,
          a.created_at,
          u.full_name AS user_name,
          u.email AS user_email
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.tenant_id = $1
          AND a.created_at BETWEEN $2 AND $3
          AND ($4::text IS NULL OR a.action = $4)
          AND ($5::text IS NULL OR a.entity = $5)
        ORDER BY a.created_at DESC
        LIMIT $6
      `,
      [req.user.tenantId, from.toISOString(), to.toISOString(), actionFilter, entityFilter, limit]
    );

    res.json({
      from,
      to,
      rows: result.rows
    });
  })
);
