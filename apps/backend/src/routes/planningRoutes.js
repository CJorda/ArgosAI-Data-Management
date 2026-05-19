import { Router } from "express";
import { createHash, createHmac, randomUUID } from "crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureAccess.js";
import { FEATURE_KEYS } from "../security/featureCatalog.js";
import { buildExecutiveReportForTenant } from "../services/executiveReportService.js";
import { createDemoTraceabilityCertificate } from "../services/noDbDemoService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const lotCodeSchema = z.object({
  lotCode: z.string().min(1).max(80)
});

const traceabilityCertificateCreateSchema = z.object({
  lotCode: z.string().trim().min(1).max(80),
  filters: z
    .object({
      source: z.string().optional(),
      search: z.string().optional()
    })
    .optional(),
  stats: z.record(z.any()).optional(),
  timeline: z.array(z.record(z.any())).max(1000)
});

const reportAutomationRunNowSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  frequency: z.enum(["daily", "weekly"]).optional(),
  template: z.enum(["executive", "operations", "financial", "compliance"]).optional(),
  assumptions: z.object({
    feedCostPerKg: z.number().min(0).optional(),
    treatmentCostPerUnit: z.number().min(0).optional(),
    maintenanceCostPerUnit: z.number().min(0).optional(),
    salePricePerKg: z.number().min(0).optional()
  }).optional()
});

const reportTemplateSchema = z.object({
  template: z.enum(["executive", "operations", "financial", "compliance"]).optional()
});

const trainingScenarioPayloadSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  assumptions: z.record(z.any()),
  summary: z.object({
    totalCurrentBiomassKg: z.number().optional(),
    totalProjectedBiomassKg: z.number().optional(),
    totalProjectedRevenueEur: z.number().optional(),
    totalProjectedCostEur: z.number().optional(),
    totalMarginEur: z.number().optional(),
    globalMarginPct: z.number().nullable().optional(),
    averageReadiness: z.number().optional()
  }),
  riskBreakdown: z.object({
    critical: z.number().int().min(0).optional(),
    high: z.number().int().min(0).optional(),
    medium: z.number().int().min(0).optional(),
    low: z.number().int().min(0).optional()
  }).optional(),
  topRows: z.array(
    z.object({
      pondName: z.string().optional(),
      lotCode: z.string().optional(),
      marginEur: z.number().optional(),
      riskLevel: z.string().optional(),
      readinessScore: z.number().optional()
    })
  ).max(12).optional()
});

const SCHEDULED_REPORT_ACTION = "planning.executive_report.scheduled.generated";
const MANUAL_REPORT_ACTION = "planning.executive_report.manual.generated";
const TRAINING_SCENARIO_ACTION = "planning.harvest_simulator.training_scenario.saved";
const TRAINING_SCENARIO_ENTITY = "harvest_simulator_training_scenarios";
const TRACEABILITY_SIGNATURE_SECRET = env.traceabilityVerifySecret || env.jwtAccessSecret;

function stableStringify(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  const mapped = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${mapped.join(",")}}`;
}

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

function parseNonNegativeQueryNumber(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, `${fieldName} must be a valid non-negative number`);
  }

  return parsed;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeCadence(value) {
  return String(value || "daily").toLowerCase() === "weekly" ? "weekly" : "daily";
}

function resolveSchedulerWindowStart(now, frequency, hourUtc, minuteUtc) {
  const current = new Date(now);

  if (frequency === "weekly") {
    const currentUtcDay = current.getUTCDay();
    const daysFromMonday = (currentUtcDay + 6) % 7;
    const monday = new Date(Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate() - daysFromMonday,
      hourUtc,
      minuteUtc,
      0,
      0
    ));

    if (current < monday) {
      monday.setUTCDate(monday.getUTCDate() - 7);
    }

    return monday;
  }

  const todayRun = new Date(Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate(),
    hourUtc,
    minuteUtc,
    0,
    0
  ));

  if (current < todayRun) {
    todayRun.setUTCDate(todayRun.getUTCDate() - 1);
  }

  return todayRun;
}

function resolveNextSchedulerRunAt(now, frequency, hourUtc, minuteUtc) {
  const currentWindowStart = resolveSchedulerWindowStart(now, frequency, hourUtc, minuteUtc);
  const nextRun = new Date(currentWindowStart);

  if (frequency === "weekly") {
    nextRun.setUTCDate(nextRun.getUTCDate() + 7);
  } else {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  return nextRun;
}

function normalizeReportTemplate(value) {
  const raw = String(value || "executive").toLowerCase();
  if (["executive", "operations", "financial", "compliance"].includes(raw)) {
    return raw;
  }

  return "executive";
}

function templateLabel(template) {
  if (template === "operations") {
    return "Operativo";
  }

  if (template === "financial") {
    return "Financiero";
  }

  if (template === "compliance") {
    return "Compliance";
  }

  return "Ejecutivo";
}

function sectionRowsFromObject(objectLike, labels = {}) {
  return Object.entries(objectLike || {}).map(([key, value]) => ({
    key,
    label: labels[key] || key,
    value
  }));
}

function buildTemplateReportView(baseReport, template) {
  const normalizedTemplate = normalizeReportTemplate(template);
  const economics = baseReport?.report?.economics || {};
  const operations = baseReport?.report?.operations || {};
  const risk = baseReport?.report?.risk || {};
  const maintenance = baseReport?.report?.maintenance || {};
  const harvest = baseReport?.report?.harvest || {};
  const logistics = baseReport?.report?.logistics || {};
  const traceability = baseReport?.report?.traceability || {};
  const compliance = baseReport?.report?.compliance || {};

  if (normalizedTemplate === "operations") {
    return {
      template: normalizedTemplate,
      templateLabel: templateLabel(normalizedTemplate),
      generatedAt: baseReport.generatedAt,
      period: baseReport.period,
      kpis: baseReport.kpis,
      highlights: [
        {
          key: "operationalPressureScore",
          label: "Presion operativa",
          value: baseReport.kpis?.operationalPressureScore ?? 0
        },
        {
          key: "operationsCount",
          label: "Operaciones del periodo",
          value: operations.operationsCount ?? 0
        },
        {
          key: "openMaintenanceTasks",
          label: "Mantenimiento abierto",
          value: baseReport.kpis?.openMaintenanceTasks ?? 0
        }
      ],
      sections: [
        {
          key: "operations",
          title: "Produccion y operaciones",
          rows: sectionRowsFromObject(operations, {
            operationsCount: "Operaciones",
            pondsWithActivity: "Piscinas con actividad",
            feedKg: "Feed distribuido (kg)",
            treatmentQty: "Tratamientos",
            maintenanceQty: "Mantenimientos"
          })
        },
        {
          key: "risk",
          title: "Riesgo operativo",
          rows: sectionRowsFromObject(risk, {
            openAlerts: "Alertas abiertas",
            severeOpenAlerts: "Alertas severas",
            alertsCreatedPeriod: "Alertas creadas",
            alertsResolvedPeriod: "Alertas resueltas"
          })
        },
        {
          key: "logistics",
          title: "Logistica de cosecha",
          rows: sectionRowsFromObject(logistics, {
            harvestShipmentsPeriod: "Despachos periodo",
            openHarvestShipments: "Despachos abiertos",
            liveTransportTripsPeriod: "Viajes transporte vivo",
            activeLiveTransportTrips: "Viajes activos",
            liveTransportFishUnitsPeriod: "Unidades transportadas"
          })
        }
      ],
      recommendations: baseReport.recommendations || []
    };
  }

  if (normalizedTemplate === "financial") {
    const currentBiomassKg = numberOrNull(economics.currentBiomassKg) ?? 0;
    const projectedCostEur = numberOrNull(economics.projectedCostEur) ?? 0;
    const projectedRevenueEur = numberOrNull(economics.projectedRevenueEur) ?? 0;
    const breakEvenPricePerKg = currentBiomassKg > 0
      ? round(projectedCostEur / currentBiomassKg, 3)
      : null;

    return {
      template: normalizedTemplate,
      templateLabel: templateLabel(normalizedTemplate),
      generatedAt: baseReport.generatedAt,
      period: baseReport.period,
      assumptions: baseReport.assumptions,
      highlights: [
        {
          key: "projectedMarginEur",
          label: "Margen proyectado EUR",
          value: economics.projectedMarginEur ?? 0
        },
        {
          key: "projectedMarginPct",
          label: "Margen proyectado %",
          value: economics.projectedMarginPct ?? null
        },
        {
          key: "breakEvenPricePerKg",
          label: "Precio equilibrio EUR/kg",
          value: breakEvenPricePerKg
        }
      ],
      sections: [
        {
          key: "economics",
          title: "Resumen economico",
          rows: sectionRowsFromObject(economics, {
            currentBiomassKg: "Biomasa actual (kg)",
            projectedCostEur: "Coste proyectado (EUR)",
            projectedRevenueEur: "Ingreso proyectado (EUR)",
            projectedMarginEur: "Margen proyectado (EUR)",
            projectedMarginPct: "Margen proyectado (%)",
            activeLotSnapshots: "Lotes activos"
          })
        },
        {
          key: "costInputs",
          title: "Supuestos de coste",
          rows: sectionRowsFromObject(baseReport.assumptions, {
            feedCostPerKg: "Feed EUR/kg",
            treatmentCostPerUnit: "Tratamiento EUR/unidad",
            maintenanceCostPerUnit: "Mantenimiento EUR/unidad",
            salePricePerKg: "Precio venta EUR/kg"
          })
        }
      ],
      recommendations: baseReport.recommendations || []
    };
  }

  if (normalizedTemplate === "compliance") {
    const openAlerts = Number(baseReport.kpis?.openAlerts || 0);
    const severeAlerts = Number(baseReport.kpis?.severeOpenAlerts || 0);
    const auditEntries = Number(compliance.auditEntries || 0);
    const openTasks = Number(maintenance.openTasks || 0);
    const complianceRiskScore = Math.min(100, severeAlerts * 20 + openTasks * 8 + openAlerts * 6);

    return {
      template: normalizedTemplate,
      templateLabel: templateLabel(normalizedTemplate),
      generatedAt: baseReport.generatedAt,
      period: baseReport.period,
      highlights: [
        {
          key: "complianceRiskScore",
          label: "Riesgo compliance",
          value: round(complianceRiskScore, 1) ?? 0
        },
        {
          key: "auditEntries",
          label: "Entradas auditables",
          value: auditEntries
        },
        {
          key: "trackedLots",
          label: "Lotes trazados",
          value: traceability.trackedLots ?? 0
        }
      ],
      sections: [
        {
          key: "audit",
          title: "Auditoria y evidencia",
          rows: sectionRowsFromObject(compliance, {
            auditEntries: "Registros de auditoria"
          })
        },
        {
          key: "traceability",
          title: "Trazabilidad",
          rows: sectionRowsFromObject(traceability, {
            trackedLots: "Lotes con seguimiento"
          })
        },
        {
          key: "risk",
          title: "Alertas y sanidad",
          rows: sectionRowsFromObject(risk, {
            openAlerts: "Alertas abiertas",
            severeOpenAlerts: "Alertas severas",
            alertsCreatedPeriod: "Alertas creadas",
            alertsResolvedPeriod: "Alertas resueltas"
          })
        }
      ],
      recommendations: baseReport.recommendations || []
    };
  }

  return {
    template: "executive",
    templateLabel: templateLabel("executive"),
    generatedAt: baseReport.generatedAt,
    period: baseReport.period,
    assumptions: baseReport.assumptions,
    kpis: baseReport.kpis,
    highlights: [
      {
        key: "operationalPressureScore",
        label: "Presion operativa",
        value: baseReport.kpis?.operationalPressureScore ?? 0
      },
      {
        key: "projectedMarginEur",
        label: "Margen proyectado EUR",
        value: economics.projectedMarginEur ?? 0
      },
      {
        key: "trackedLots",
        label: "Lotes trazados",
        value: baseReport.kpis?.trackedLots ?? 0
      }
    ],
    sections: [
      {
        key: "operations",
        title: "Operaciones",
        rows: sectionRowsFromObject(operations)
      },
      {
        key: "economics",
        title: "Economia",
        rows: sectionRowsFromObject(economics)
      },
      {
        key: "maintenance",
        title: "Mantenimiento",
        rows: sectionRowsFromObject(maintenance)
      },
      {
        key: "harvest",
        title: "Cosecha",
        rows: sectionRowsFromObject(harvest)
      }
    ],
    recommendations: baseReport.recommendations || []
  };
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

planningRoutes.use(requireAuth, requireFeature(FEATURE_KEYS.PLANNING_VIEW));

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
          SELECT o.lot_code, o.event_at
          FROM operations o
          WHERE o.tenant_id = $1

          UNION ALL

          SELECT b.lot_code, b.captured_at AS event_at
          FROM biomass_entries b
          WHERE b.tenant_id = $1

          UNION ALL

          SELECT hp.lot_code, hp.window_start AS event_at
          FROM harvest_plans hp
          WHERE hp.tenant_id = $1

          UNION ALL

          SELECT hp.lot_code, COALESCE(hs.departure_at, hs.created_at) AS event_at
          FROM harvest_shipments hs
          JOIN harvest_plans hp ON hp.id = hs.harvest_plan_id
          WHERE hs.tenant_id = $1

          UNION ALL

          SELECT t.lot_code, COALESCE(t.departure_at, t.created_at) AS event_at
          FROM live_transport_trips t
          WHERE t.tenant_id = $1
        ) timeline
        WHERE lot_code IS NOT NULL
          AND lot_code <> ''
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
            NULL::double precision AS feed_kg,
            NULL::text AS status,
            NULL::text AS route_label,
            NULL::text AS external_code
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
            b.feed_kg,
            NULL::text AS status,
            NULL::text AS route_label,
            NULL::text AS external_code
          FROM biomass_entries b
          JOIN ponds p ON p.id = b.pond_id
          WHERE b.tenant_id = $1
            AND b.lot_code = $2

          UNION ALL

          SELECT
            'harvest_plan'::text AS source,
            hp.id::text AS source_id,
            hp.window_start AS event_at,
            p.name AS pond_name,
            'harvest_plan'::text AS event_type,
            hp.planned_biomass_kg AS quantity,
            'kg'::text AS quantity_unit,
            hp.notes AS note,
            NULL::text AS mix_with_lot_code,
            ARRAY_REMOVE(ARRAY[NULLIF(hp.destination, ''), NULLIF(hp.logistics_provider, '')], NULL)::text[] AS label_tags,
            NULL::timestamptz AS withdrawal_until,
            NULL::double precision AS avg_weight_g,
            NULL::integer AS fish_count,
            NULL::double precision AS mortality_pct,
            NULL::double precision AS feed_kg,
            hp.status,
            COALESCE(NULLIF(hp.destination, ''), 'Destino por definir') AS route_label,
            CONCAT('HP-', hp.id::text) AS external_code
          FROM harvest_plans hp
          JOIN ponds p ON p.id = hp.pond_id
          WHERE hp.tenant_id = $1
            AND hp.lot_code = $2

          UNION ALL

          SELECT
            'harvest_shipment'::text AS source,
            hs.id::text AS source_id,
            COALESCE(hs.departure_at, hs.created_at) AS event_at,
            p.name AS pond_name,
            'harvest_shipment'::text AS event_type,
            NULL::double precision AS quantity,
            NULL::text AS quantity_unit,
            TRIM(BOTH ' ' FROM CONCAT(
              'Conductor: ',
              COALESCE(hs.driver_name, '-'),
              ' | Camion: ',
              COALESCE(hs.truck_plate, '-')
            )) AS note,
            NULL::text AS mix_with_lot_code,
            ARRAY[]::text[] AS label_tags,
            NULL::timestamptz AS withdrawal_until,
            NULL::double precision AS avg_weight_g,
            NULL::integer AS fish_count,
            NULL::double precision AS mortality_pct,
            NULL::double precision AS feed_kg,
            hs.status,
            CONCAT(p.name, ' -> ', COALESCE(NULLIF(hp.destination, ''), 'Destino por definir')) AS route_label,
            hs.dispatch_code AS external_code
          FROM harvest_shipments hs
          JOIN harvest_plans hp ON hp.id = hs.harvest_plan_id
          JOIN ponds p ON p.id = hp.pond_id
          WHERE hs.tenant_id = $1
            AND hp.lot_code = $2

          UNION ALL

          SELECT
            'live_transport_trip'::text AS source,
            t.id::text AS source_id,
            COALESCE(t.departure_at, t.created_at) AS event_at,
            COALESCE(t.origin_site, '-') AS pond_name,
            'live_transport'::text AS event_type,
            t.fish_units::double precision AS quantity,
            'units'::text AS quantity_unit,
            t.notes AS note,
            NULL::text AS mix_with_lot_code,
            ARRAY[]::text[] AS label_tags,
            NULL::timestamptz AS withdrawal_until,
            NULL::double precision AS avg_weight_g,
            NULL::integer AS fish_count,
            NULL::double precision AS mortality_pct,
            NULL::double precision AS feed_kg,
            t.status,
            CONCAT(t.origin_site, ' -> ', t.destination_site) AS route_label,
            t.transport_code AS external_code
          FROM live_transport_trips t
          WHERE t.tenant_id = $1
            AND t.lot_code = $2
        ) timeline
        ORDER BY event_at DESC
        LIMIT 700
      `,
      [req.user.tenantId, lotCode]
    );

    res.json({
      lotCode,
      timeline: result.rows
    });
  })
);

planningRoutes.post(
  "/traceability/certificates",
  asyncHandler(async (req, res) => {
    const parseResult = traceabilityCertificateCreateSchema.safeParse(req.body || {});

    if (!parseResult.success) {
      throw new HttpError(400, "Invalid certificate payload");
    }

    const { lotCode, timeline, filters, stats } = parseResult.data;

    if (timeline.length === 0) {
      throw new HttpError(400, "Timeline cannot be empty");
    }

    const payload = {
      lotCode,
      generatedAt: new Date().toISOString(),
      filters: filters || {},
      stats: stats || {},
      timeline
    };

    const canonicalPayload = stableStringify(payload);
    const payloadHash = createHash("sha256").update(canonicalPayload).digest("hex");
    const publicId = randomUUID();
    const verificationSignature = createHmac("sha256", TRACEABILITY_SIGNATURE_SECRET)
      .update(`${publicId}.${payloadHash}`)
      .digest("hex");

    if (env.noPostgresMode) {
      createDemoTraceabilityCertificate({
        public_id: publicId,
        lot_code: lotCode,
        payload,
        payload_hash: payloadHash,
        verification_signature: verificationSignature,
        status: "valid",
        created_at: new Date().toISOString(),
        revoked_at: null,
        replaced_by_public_id: null
      });
    } else {
      await query(
        `
          INSERT INTO traceability_certificates (
            tenant_id,
            public_id,
            lot_code,
            payload,
            payload_hash,
            verification_signature,
            status,
            created_by
          )
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'valid', $7)
        `,
        [
          req.user.tenantId,
          publicId,
          lotCode,
          JSON.stringify(payload),
          payloadHash,
          verificationSignature,
          req.user.id || null
        ]
      );
    }

    const apiVerifyUrl = `${req.protocol}://${req.get("host")}/api/public/traceability/verify/${publicId}?sig=${verificationSignature}`;

    res.status(201).json({
      publicId,
      lotCode,
      payloadHash,
      signature: verificationSignature,
      verifyApiUrl: apiVerifyUrl
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

planningRoutes.get(
  "/cost-margin",
  asyncHandler(async (req, res) => {
    const { from, to } = parseDateRange(req, 45);
    const pondId = req.query.pondId ? Number(req.query.pondId) : null;

    if (req.query.pondId && !Number.isFinite(pondId)) {
      throw new HttpError(400, "pondId must be a valid number");
    }

    const feedCostPerKg = parseNonNegativeQueryNumber(req.query.feedCostPerKg, 1.28, "feedCostPerKg");
    const treatmentCostPerUnit = parseNonNegativeQueryNumber(
      req.query.treatmentCostPerUnit,
      6.2,
      "treatmentCostPerUnit"
    );
    const maintenanceCostPerUnit = parseNonNegativeQueryNumber(
      req.query.maintenanceCostPerUnit,
      35,
      "maintenanceCostPerUnit"
    );
    const salePricePerKg = parseNonNegativeQueryNumber(req.query.salePricePerKg, 6.7, "salePricePerKg");

    const result = await query(
      `
        WITH op_agg AS (
          SELECT
            o.pond_id,
            COALESCE(NULLIF(o.lot_code, ''), 'SIN-LOTE') AS lot_code,
            ROUND(COALESCE(SUM(CASE WHEN o.type = 'feeding' THEN o.quantity ELSE 0 END), 0)::numeric, 2)
              AS feed_kg,
            ROUND(COALESCE(SUM(CASE WHEN o.type = 'treatment' THEN o.quantity ELSE 0 END), 0)::numeric, 2)
              AS treatment_qty,
            ROUND(
              COALESCE(SUM(CASE WHEN o.type IN ('maintenance', 'cleaning') THEN o.quantity ELSE 0 END), 0)::numeric,
              2
            ) AS maintenance_qty,
            COUNT(*)::int AS operations_count
          FROM operations o
          WHERE o.tenant_id = $1
            AND o.event_at BETWEEN $2 AND $3
            AND ($4::bigint IS NULL OR o.pond_id = $4)
          GROUP BY o.pond_id, COALESCE(NULLIF(o.lot_code, ''), 'SIN-LOTE')
        ),
        bio_latest AS (
          SELECT DISTINCT ON (b.pond_id, COALESCE(NULLIF(b.lot_code, ''), 'SIN-LOTE'))
            b.pond_id,
            COALESCE(NULLIF(b.lot_code, ''), 'SIN-LOTE') AS lot_code,
            ROUND(((b.fish_count * b.avg_weight_g) / 1000.0)::numeric, 2) AS biomass_kg,
            b.captured_at
          FROM biomass_entries b
          WHERE b.tenant_id = $1
            AND b.captured_at BETWEEN $2 AND $3
            AND ($4::bigint IS NULL OR b.pond_id = $4)
          ORDER BY b.pond_id, COALESCE(NULLIF(b.lot_code, ''), 'SIN-LOTE'), b.captured_at DESC
        )
        SELECT
          COALESCE(o.pond_id, b.pond_id) AS pond_id,
          p.name AS pond_name,
          COALESCE(o.lot_code, b.lot_code) AS lot_code,
          COALESCE(o.feed_kg, 0) AS feed_kg,
          COALESCE(o.treatment_qty, 0) AS treatment_qty,
          COALESCE(o.maintenance_qty, 0) AS maintenance_qty,
          COALESCE(o.operations_count, 0) AS operations_count,
          COALESCE(b.biomass_kg, 0) AS biomass_kg,
          b.captured_at AS biomass_captured_at
        FROM op_agg o
        FULL OUTER JOIN bio_latest b
          ON b.pond_id = o.pond_id
          AND b.lot_code = o.lot_code
        JOIN ponds p
          ON p.id = COALESCE(o.pond_id, b.pond_id)
        WHERE p.tenant_id = $1
        ORDER BY p.name ASC, COALESCE(o.lot_code, b.lot_code) ASC
      `,
      [req.user.tenantId, from.toISOString(), to.toISOString(), pondId]
    );

    const rows = result.rows.map((row) => {
      const feedKg = numberOrNull(row.feed_kg) ?? 0;
      const treatmentQty = numberOrNull(row.treatment_qty) ?? 0;
      const maintenanceQty = numberOrNull(row.maintenance_qty) ?? 0;
      const biomassKg = numberOrNull(row.biomass_kg) ?? 0;

      const feedCostEur = feedKg * feedCostPerKg;
      const treatmentCostEur = treatmentQty * treatmentCostPerUnit;
      const maintenanceCostEur = maintenanceQty * maintenanceCostPerUnit;
      const totalCostEur = feedCostEur + treatmentCostEur + maintenanceCostEur;
      const projectedRevenueEur = biomassKg * salePricePerKg;
      const marginEur = projectedRevenueEur - totalCostEur;

      return {
        pondId: row.pond_id,
        pondName: row.pond_name,
        lotCode: row.lot_code,
        operationsCount: row.operations_count,
        biomassKg: round(biomassKg, 2) ?? 0,
        feedKg: round(feedKg, 2) ?? 0,
        treatmentQty: round(treatmentQty, 2) ?? 0,
        maintenanceQty: round(maintenanceQty, 2) ?? 0,
        feedCostEur: round(feedCostEur, 2) ?? 0,
        treatmentCostEur: round(treatmentCostEur, 2) ?? 0,
        maintenanceCostEur: round(maintenanceCostEur, 2) ?? 0,
        totalCostEur: round(totalCostEur, 2) ?? 0,
        projectedRevenueEur: round(projectedRevenueEur, 2) ?? 0,
        marginEur: round(marginEur, 2) ?? 0,
        marginPct: projectedRevenueEur > 0
          ? round((marginEur / projectedRevenueEur) * 100, 2)
          : null,
        costPerKgEur: biomassKg > 0 ? round(totalCostEur / biomassKg, 3) : null,
        biomassCapturedAt: row.biomass_captured_at
      };
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalBiomassKg += row.biomassKg || 0;
        acc.totalCostEur += row.totalCostEur || 0;
        acc.totalRevenueEur += row.projectedRevenueEur || 0;
        acc.totalMarginEur += row.marginEur || 0;
        return acc;
      },
      {
        totalBiomassKg: 0,
        totalCostEur: 0,
        totalRevenueEur: 0,
        totalMarginEur: 0
      }
    );

    res.json({
      from,
      to,
      assumptions: {
        feedCostPerKg,
        treatmentCostPerUnit,
        maintenanceCostPerUnit,
        salePricePerKg
      },
      summary: {
        totalBiomassKg: round(summary.totalBiomassKg, 2) ?? 0,
        totalCostEur: round(summary.totalCostEur, 2) ?? 0,
        totalRevenueEur: round(summary.totalRevenueEur, 2) ?? 0,
        totalMarginEur: round(summary.totalMarginEur, 2) ?? 0,
        globalMarginPct: summary.totalRevenueEur > 0
          ? round((summary.totalMarginEur / summary.totalRevenueEur) * 100, 2)
          : null
      },
      rows
    });
  })
);

planningRoutes.get(
  "/cost-assumptions/auto",
  asyncHandler(async (req, res) => {
    const { from, to } = parseDateRange(req, 45);
    const pondId = req.query.pondId ? Number(req.query.pondId) : null;

    if (req.query.pondId && !Number.isFinite(pondId)) {
      throw new HttpError(400, "pondId must be a valid number");
    }

    const defaults = {
      feedCostPerKg: 1.28,
      treatmentCostPerUnit: 6.2,
      maintenanceCostPerUnit: 35,
      salePricePerKg: 6.7
    };

    const salePricePerKg = parseNonNegativeQueryNumber(
      req.query.salePricePerKg,
      defaults.salePricePerKg,
      "salePricePerKg"
    );

    const result = await query(
      `
        WITH categorized_costs AS (
          SELECT
            CASE
              WHEN LOWER(i.category) LIKE '%piens%'
                OR LOWER(i.category) LIKE '%feed%'
                OR LOWER(i.category) LIKE '%alimen%'
                THEN 'feed'
              WHEN LOWER(i.category) LIKE '%sanid%'
                OR LOWER(i.category) LIKE '%trat%'
                OR LOWER(i.category) LIKE '%medic%'
                THEN 'treatment'
              WHEN LOWER(i.category) LIKE '%mant%'
                OR LOWER(i.category) LIKE '%clean%'
                OR LOWER(i.category) LIKE '%limp%'
                THEN 'maintenance'
              ELSE 'other'
            END AS bucket,
            ABS(m.quantity) AS qty,
            m.unit_cost
          FROM inventory_movements m
          JOIN inventory_items i ON i.id = m.item_id
          WHERE m.tenant_id = $1
            AND m.movement_type = 'out'
            AND m.moved_at BETWEEN $2 AND $3
            AND ($4::bigint IS NULL OR m.related_pond_id = $4)
            AND m.unit_cost IS NOT NULL
            AND m.unit_cost > 0
            AND m.quantity <> 0
        )
        SELECT
          bucket,
          COUNT(*)::int AS priced_events,
          ROUND(COALESCE(SUM(qty), 0)::numeric, 2) AS total_qty,
          ROUND(
            (
              COALESCE(SUM(qty * unit_cost), 0)
              / NULLIF(COALESCE(SUM(qty), 0), 0)
            )::numeric,
            4
          ) AS weighted_unit_cost
        FROM categorized_costs
        GROUP BY bucket
      `,
      [req.user.tenantId, from.toISOString(), to.toISOString(), pondId]
    );

    const rowsByBucket = new Map(
      result.rows
        .filter((row) => row.bucket !== "other")
        .map((row) => [row.bucket, row])
    );

    const buildBucket = (bucket, fallback) => {
      const row = rowsByBucket.get(bucket);
      const pricedEvents = Number(row?.priced_events || 0);
      const weightedUnitCost = numberOrNull(row?.weighted_unit_cost);
      const sampledQuantity = numberOrNull(row?.total_qty) ?? 0;
      const hasRealValue = Number.isFinite(weightedUnitCost) && weightedUnitCost > 0;

      return {
        value: round(hasRealValue ? weightedUnitCost : fallback, 4) ?? fallback,
        source: hasRealValue ? "inventory_weighted_avg" : "default_fallback",
        pricedEvents,
        sampledQuantity: round(sampledQuantity, 2) ?? 0,
        confidence: pricedEvents >= 12 ? "high" : pricedEvents >= 5 ? "medium" : "low"
      };
    };

    const feed = buildBucket("feed", defaults.feedCostPerKg);
    const treatment = buildBucket("treatment", defaults.treatmentCostPerUnit);
    const maintenance = buildBucket("maintenance", defaults.maintenanceCostPerUnit);

    res.json({
      from,
      to,
      assumptions: {
        feedCostPerKg: feed.value,
        treatmentCostPerUnit: treatment.value,
        maintenanceCostPerUnit: maintenance.value,
        salePricePerKg
      },
      sources: {
        feed,
        treatment,
        maintenance,
        salePricePerKg: {
          value: salePricePerKg,
          source: "manual_or_default"
        }
      }
    });
  })
);

planningRoutes.get(
  "/harvest-simulator",
  asyncHandler(async (req, res) => {
    const pondId = req.query.pondId ? Number(req.query.pondId) : null;
    const lotCode = req.query.lotCode ? String(req.query.lotCode).trim() : null;

    if (req.query.pondId && !Number.isFinite(pondId)) {
      throw new HttpError(400, "pondId must be a valid number");
    }

    const windowDays = Math.round(parseNonNegativeQueryNumber(req.query.windowDays, 21, "windowDays"));
    if (windowDays < 3 || windowDays > 90) {
      throw new HttpError(400, "windowDays must be between 3 and 90");
    }

    const feedCostPerKg = parseNonNegativeQueryNumber(req.query.feedCostPerKg, 1.28, "feedCostPerKg");
    const salePricePerKg = parseNonNegativeQueryNumber(req.query.salePricePerKg, 6.7, "salePricePerKg");
    const logisticsCostPerKg = parseNonNegativeQueryNumber(
      req.query.logisticsCostPerKg,
      0.55,
      "logisticsCostPerKg"
    );
    const riskPenaltyPct = parseNonNegativeQueryNumber(req.query.riskPenaltyPct, 4.5, "riskPenaltyPct");
    const mortalityStressFactor = parseNonNegativeQueryNumber(
      req.query.mortalityStressFactor,
      1,
      "mortalityStressFactor"
    );

    const historicalSignalsResult = await query(
      `
        WITH alert_hist AS (
          SELECT
            COUNT(*) FILTER (
              WHERE created_at >= NOW() - INTERVAL '30 days'
            )::double precision AS total_alerts_30d,
            COUNT(*) FILTER (
              WHERE created_at >= NOW() - INTERVAL '30 days'
                AND severity IN ('high', 'critical')
            )::double precision AS severe_alerts_30d
          FROM alerts
          WHERE tenant_id = $1
        ),
        mortality_hist AS (
          SELECT
            ROUND(COALESCE(AVG(mortality_pct), 0)::numeric, 3) AS avg_mortality_pct_60d
          FROM biomass_entries
          WHERE tenant_id = $1
            AND captured_at >= NOW() - INTERVAL '60 days'
        ),
        shipment_hist AS (
          SELECT
            COUNT(*) FILTER (
              WHERE COALESCE(departure_at, created_at) >= NOW() - INTERVAL '90 days'
                AND arrival_eta IS NOT NULL
            )::double precision AS shipments_with_eta_90d,
            COUNT(*) FILTER (
              WHERE COALESCE(departure_at, created_at) >= NOW() - INTERVAL '90 days'
                AND arrival_eta IS NOT NULL
                AND delivered_at IS NOT NULL
                AND delivered_at > arrival_eta
            )::double precision AS delayed_shipments_90d
          FROM harvest_shipments
          WHERE tenant_id = $1
        ),
        maintenance_hist AS (
          SELECT
            COUNT(*)::double precision AS total_tasks,
            COUNT(*) FILTER (
              WHERE status IN ('pending', 'in_progress', 'blocked')
            )::double precision AS open_tasks
          FROM maintenance_tasks
          WHERE tenant_id = $1
        )
        SELECT
          COALESCE(m.avg_mortality_pct_60d, 0) AS avg_mortality_pct_60d,
          COALESCE(
            a.severe_alerts_30d / NULLIF(a.total_alerts_30d, 0),
            0
          ) AS severe_alert_rate_30d,
          COALESCE(
            s.delayed_shipments_90d / NULLIF(s.shipments_with_eta_90d, 0),
            0
          ) AS delayed_shipment_ratio_90d,
          COALESCE(
            mt.open_tasks / NULLIF(mt.total_tasks, 0),
            0
          ) AS open_maintenance_ratio
        FROM alert_hist a
        CROSS JOIN mortality_hist m
        CROSS JOIN shipment_hist s
        CROSS JOIN maintenance_hist mt
      `,
      [req.user.tenantId]
    );

    const historicalSignals = historicalSignalsResult.rows[0] || {};
    const avgMortalityPct60d = numberOrNull(historicalSignals.avg_mortality_pct_60d) ?? 0;
    const severeAlertRate30d = numberOrNull(historicalSignals.severe_alert_rate_30d) ?? 0;
    const delayedShipmentRatio90d = numberOrNull(historicalSignals.delayed_shipment_ratio_90d) ?? 0;
    const openMaintenanceRatio = numberOrNull(historicalSignals.open_maintenance_ratio) ?? 0;

    const dynamicWeights = {
      severeAlertLossWeight: Math.min(
        0.065,
        Math.max(0.02, 0.024 + severeAlertRate30d * 0.08 + delayedShipmentRatio90d * 0.03)
      ),
      openAlertLossWeight: Math.min(
        0.03,
        Math.max(0.007, 0.009 + severeAlertRate30d * 0.03 + openMaintenanceRatio * 0.01)
      ),
      mortalityAmplifier: Math.min(
        1.95,
        Math.max(0.75, 0.85 + avgMortalityPct60d / 2.6 + delayedShipmentRatio90d * 0.24)
      ),
      riskScoreLossWeight: Math.min(
        250,
        Math.max(145, 155 + avgMortalityPct60d * 24 + delayedShipmentRatio90d * 82)
      ),
      riskScoreSevereWeight: Math.min(
        30,
        Math.max(17, 19 + severeAlertRate30d * 38)
      ),
      riskScoreOpenWeight: Math.min(
        14,
        Math.max(6, 7 + openMaintenanceRatio * 10)
      )
    };

    const result = await query(
      `
        WITH latest_biomass AS (
          SELECT DISTINCT ON (b.pond_id, COALESCE(NULLIF(b.lot_code, ''), 'SIN-LOTE'))
            b.pond_id,
            COALESCE(NULLIF(b.lot_code, ''), 'SIN-LOTE') AS lot_code,
            b.fish_count,
            b.avg_weight_g,
            b.mortality_pct,
            b.fcr,
            b.captured_at
          FROM biomass_entries b
          WHERE b.tenant_id = $1
          ORDER BY
            b.pond_id,
            COALESCE(NULLIF(b.lot_code, ''), 'SIN-LOTE'),
            b.captured_at DESC
        ),
        alert_risk AS (
          SELECT
            a.pond_id,
            COUNT(*) FILTER (WHERE a.status = 'open')::int AS open_alerts,
            COUNT(*) FILTER (
              WHERE a.status = 'open'
                AND a.severity IN ('high', 'critical')
            )::int AS severe_open_alerts
          FROM alerts a
          WHERE a.tenant_id = $1
          GROUP BY a.pond_id
        ),
        plan_hint AS (
          SELECT DISTINCT ON (hp.pond_id, hp.lot_code)
            hp.pond_id,
            hp.lot_code,
            hp.target_weight_g,
            hp.planned_biomass_kg,
            hp.window_start,
            hp.window_end,
            hp.status
          FROM harvest_plans hp
          WHERE hp.tenant_id = $1
          ORDER BY hp.pond_id, hp.lot_code, hp.window_start DESC
        )
        SELECT
          p.id AS pond_id,
          p.name AS pond_name,
          lb.lot_code,
          lb.fish_count,
          lb.avg_weight_g,
          lb.mortality_pct,
          lb.fcr,
          lb.captured_at,
          COALESCE(ar.open_alerts, 0) AS open_alerts,
          COALESCE(ar.severe_open_alerts, 0) AS severe_open_alerts,
          ph.target_weight_g,
          ph.planned_biomass_kg,
          ph.window_start,
          ph.window_end,
          ph.status AS plan_status
        FROM latest_biomass lb
        JOIN ponds p ON p.id = lb.pond_id
        LEFT JOIN alert_risk ar ON ar.pond_id = lb.pond_id
        LEFT JOIN plan_hint ph
          ON ph.pond_id = lb.pond_id
          AND ph.lot_code = lb.lot_code
        WHERE p.tenant_id = $1
          AND ($2::bigint IS NULL OR p.id = $2)
          AND ($3::text IS NULL OR lb.lot_code = $3)
        ORDER BY p.name ASC, lb.lot_code ASC
        LIMIT 220
      `,
      [req.user.tenantId, pondId, lotCode || null]
    );

    const scenarios = result.rows.map((row) => {
      const fishCount = numberOrNull(row.fish_count) ?? 0;
      const avgWeightG = numberOrNull(row.avg_weight_g) ?? 0;
      const mortalityPct = Math.max(numberOrNull(row.mortality_pct) ?? 1, 0);
      const fcr = Math.max(numberOrNull(row.fcr) ?? 1.3, 0.5);
      const openAlerts = Number(row.open_alerts) || 0;
      const severeOpenAlerts = Number(row.severe_open_alerts) || 0;

      const biomassNowKg = (fishCount * avgWeightG) / 1000;
      const targetWeightG = Math.max(numberOrNull(row.target_weight_g) ?? avgWeightG * 1.15, avgWeightG);
      const growthPotentialPct = avgWeightG > 0
        ? Math.max(0.04, Math.min((targetWeightG - avgWeightG) / avgWeightG, 0.35))
        : 0.08;

      const baselineGainKg = biomassNowKg * growthPotentialPct;
      const alertStressFactor =
        severeOpenAlerts * dynamicWeights.severeAlertLossWeight
        + openAlerts * dynamicWeights.openAlertLossWeight;
      const projectedLossPct = Math.min(
        0.38,
        (mortalityPct / 100)
          * (windowDays / 30)
          * mortalityStressFactor
          * dynamicWeights.mortalityAmplifier
          + alertStressFactor
      );

      const projectedBiomassKg = Math.max(0, biomassNowKg + baselineGainKg - biomassNowKg * projectedLossPct);
      const biomassGainKg = Math.max(0, projectedBiomassKg - biomassNowKg);
      const requiredFeedKg = biomassGainKg * fcr;

      const projectedRevenueEur = projectedBiomassKg * salePricePerKg;
      const feedCostEur = requiredFeedKg * feedCostPerKg;
      const logisticsCostEur = projectedBiomassKg * logisticsCostPerKg;
      const riskPenaltyFactor = Math.min(
        1,
        projectedLossPct * 2.1
        + severeOpenAlerts * 0.1
        + openAlerts * 0.03
        + delayedShipmentRatio90d * 0.35
      );
      const riskPenaltyEur = projectedRevenueEur * (riskPenaltyPct / 100) * riskPenaltyFactor;
      const projectedCostEur = feedCostEur + logisticsCostEur + riskPenaltyEur;
      const marginEur = projectedRevenueEur - projectedCostEur;

      const riskScore = Math.min(
        100,
        severeOpenAlerts * dynamicWeights.riskScoreSevereWeight
        + openAlerts * dynamicWeights.riskScoreOpenWeight
        + projectedLossPct * dynamicWeights.riskScoreLossWeight
        + delayedShipmentRatio90d * 26
      );
      const riskLevel = riskScore >= 75
        ? "critical"
        : riskScore >= 55
          ? "high"
          : riskScore >= 30
            ? "medium"
            : "low";

      const readinessBase = 100 - riskScore + (row.plan_status === "ready" ? 8 : row.plan_status ? 3 : 0);
      const readinessScore = Math.max(0, Math.min(100, readinessBase));

      const suggestedWindowStart = row.window_start
        ? new Date(row.window_start)
        : new Date(Date.now() + 2 * 24 * 3600 * 1000);
      const suggestedWindowEnd = row.window_end
        ? new Date(row.window_end)
        : new Date(suggestedWindowStart.getTime() + windowDays * 24 * 3600 * 1000);

      return {
        pondId: row.pond_id,
        pondName: row.pond_name,
        lotCode: row.lot_code,
        planStatus: row.plan_status || "no_plan",
        currentBiomassKg: round(biomassNowKg, 2) ?? 0,
        projectedBiomassKg: round(projectedBiomassKg, 2) ?? 0,
        projectedGainKg: round(biomassGainKg, 2) ?? 0,
        requiredFeedKg: round(requiredFeedKg, 2) ?? 0,
        projectedRevenueEur: round(projectedRevenueEur, 2) ?? 0,
        projectedCostEur: round(projectedCostEur, 2) ?? 0,
        marginEur: round(marginEur, 2) ?? 0,
        marginPct: projectedRevenueEur > 0
          ? round((marginEur / projectedRevenueEur) * 100, 2)
          : null,
        riskScore: round(riskScore, 1) ?? 0,
        riskLevel,
        projectedLossPct: round(projectedLossPct * 100, 2) ?? 0,
        openAlerts,
        severeOpenAlerts,
        readinessScore: round(readinessScore, 1) ?? 0,
        suggestedWindowStart: suggestedWindowStart.toISOString(),
        suggestedWindowEnd: suggestedWindowEnd.toISOString(),
        sampledAt: row.captured_at
      };
    });

    const rankedScenarios = [...scenarios].sort(
      (left, right) =>
        (right.readinessScore || 0) - (left.readinessScore || 0)
        || (right.marginEur || 0) - (left.marginEur || 0)
    );

    const summary = rankedScenarios.reduce(
      (acc, item) => {
        acc.totalCurrentBiomassKg += item.currentBiomassKg;
        acc.totalProjectedBiomassKg += item.projectedBiomassKg;
        acc.totalProjectedRevenueEur += item.projectedRevenueEur;
        acc.totalProjectedCostEur += item.projectedCostEur;
        acc.totalMarginEur += item.marginEur;
        return acc;
      },
      {
        totalCurrentBiomassKg: 0,
        totalProjectedBiomassKg: 0,
        totalProjectedRevenueEur: 0,
        totalProjectedCostEur: 0,
        totalMarginEur: 0
      }
    );

    res.json({
      assumptions: {
        windowDays,
        feedCostPerKg,
        salePricePerKg,
        logisticsCostPerKg,
        riskPenaltyPct,
        mortalityStressFactor,
        historicalSignals: {
          avgMortalityPct60d: round(avgMortalityPct60d, 3) ?? 0,
          severeAlertRate30d: round(severeAlertRate30d, 4) ?? 0,
          delayedShipmentRatio90d: round(delayedShipmentRatio90d, 4) ?? 0,
          openMaintenanceRatio: round(openMaintenanceRatio, 4) ?? 0
        },
        dynamicWeights: {
          severeAlertLossWeight: round(dynamicWeights.severeAlertLossWeight, 5),
          openAlertLossWeight: round(dynamicWeights.openAlertLossWeight, 5),
          mortalityAmplifier: round(dynamicWeights.mortalityAmplifier, 4),
          riskScoreLossWeight: round(dynamicWeights.riskScoreLossWeight, 3),
          riskScoreSevereWeight: round(dynamicWeights.riskScoreSevereWeight, 3),
          riskScoreOpenWeight: round(dynamicWeights.riskScoreOpenWeight, 3)
        }
      },
      summary: {
        totalCurrentBiomassKg: round(summary.totalCurrentBiomassKg, 2) ?? 0,
        totalProjectedBiomassKg: round(summary.totalProjectedBiomassKg, 2) ?? 0,
        totalProjectedRevenueEur: round(summary.totalProjectedRevenueEur, 2) ?? 0,
        totalProjectedCostEur: round(summary.totalProjectedCostEur, 2) ?? 0,
        totalMarginEur: round(summary.totalMarginEur, 2) ?? 0,
        globalMarginPct: summary.totalProjectedRevenueEur > 0
          ? round((summary.totalMarginEur / summary.totalProjectedRevenueEur) * 100, 2)
          : null
      },
      scenarios: rankedScenarios
    });
  })
);

planningRoutes.get(
  "/reports/executive",
  asyncHandler(async (req, res) => {
    const { from, to } = parseDateRange(req, 14);
    const cadenceFrequency = String(req.query.frequency || "daily").toLowerCase() === "weekly"
      ? "weekly"
      : "daily";

    const feedCostPerKg = parseNonNegativeQueryNumber(req.query.feedCostPerKg, 1.28, "feedCostPerKg");
    const treatmentCostPerUnit = parseNonNegativeQueryNumber(
      req.query.treatmentCostPerUnit,
      6.2,
      "treatmentCostPerUnit"
    );
    const maintenanceCostPerUnit = parseNonNegativeQueryNumber(
      req.query.maintenanceCostPerUnit,
      35,
      "maintenanceCostPerUnit"
    );
    const salePricePerKg = parseNonNegativeQueryNumber(req.query.salePricePerKg, 6.7, "salePricePerKg");

    const report = await buildExecutiveReportForTenant({
      tenantId: req.user.tenantId,
      from,
      to,
      assumptions: {
        feedCostPerKg,
        treatmentCostPerUnit,
        maintenanceCostPerUnit,
        salePricePerKg
      },
      cadenceFrequency
    });

    res.json(report);
  })
);

planningRoutes.get(
  "/reports/generated",
  asyncHandler(async (req, res) => {
    const templateParse = reportTemplateSchema.safeParse(req.query || {});
    if (!templateParse.success) {
      throw new HttpError(400, "Invalid template query param");
    }

    const template = normalizeReportTemplate(templateParse.data.template);
    const { from, to } = parseDateRange(req, 14);
    const cadenceFrequency = String(req.query.frequency || "daily").toLowerCase() === "weekly"
      ? "weekly"
      : "daily";

    const feedCostPerKg = parseNonNegativeQueryNumber(req.query.feedCostPerKg, 1.28, "feedCostPerKg");
    const treatmentCostPerUnit = parseNonNegativeQueryNumber(
      req.query.treatmentCostPerUnit,
      6.2,
      "treatmentCostPerUnit"
    );
    const maintenanceCostPerUnit = parseNonNegativeQueryNumber(
      req.query.maintenanceCostPerUnit,
      35,
      "maintenanceCostPerUnit"
    );
    const salePricePerKg = parseNonNegativeQueryNumber(req.query.salePricePerKg, 6.7, "salePricePerKg");

    const baseReport = await buildExecutiveReportForTenant({
      tenantId: req.user.tenantId,
      from,
      to,
      assumptions: {
        feedCostPerKg,
        treatmentCostPerUnit,
        maintenanceCostPerUnit,
        salePricePerKg
      },
      cadenceFrequency
    });

    const templatedReport = buildTemplateReportView(baseReport, template);

    res.json({
      ...templatedReport,
      cadenceSuggestion: baseReport.cadenceSuggestion
    });
  })
);

planningRoutes.get(
  "/reports/automation/status",
  asyncHandler(async (req, res) => {
    const frequency = normalizeCadence(env.executiveReportSchedulerFrequency);
    const hourUtc = clampInteger(env.executiveReportSchedulerHourUtc, 6, 0, 23);
    const minuteUtc = clampInteger(env.executiveReportSchedulerMinuteUtc, 0, 0, 59);
    const pollMs = clampInteger(env.executiveReportSchedulerPollMs, 300000, 60000, 86400000);
    const lookbackDays = clampInteger(env.executiveReportSchedulerLookbackDays, 14, 3, 120);

    const now = new Date();
    const currentWindowStart = resolveSchedulerWindowStart(now, frequency, hourUtc, minuteUtc);
    const nextRunAt = resolveNextSchedulerRunAt(now, frequency, hourUtc, minuteUtc);

    const recentRunsResult = await query(
      `
        SELECT
          id,
          action,
          entity_id,
          payload,
          created_at
        FROM audit_logs
        WHERE tenant_id = $1
          AND action = ANY($2::text[])
        ORDER BY created_at DESC
        LIMIT 60
      `,
      [req.user.tenantId, [SCHEDULED_REPORT_ACTION, MANUAL_REPORT_ACTION]]
    );

    const recentRuns = recentRunsResult.rows.map((row) => {
      const payload = row.payload || {};
      const scheduler = payload.scheduler || {};

      return {
        id: row.id,
        action: row.action,
        mode: row.action === SCHEDULED_REPORT_ACTION ? "scheduled" : "manual",
        generatedAt: scheduler.generatedAt || row.created_at,
        windowStart: scheduler.windowStart || null,
        frequency: scheduler.frequency || frequency,
        template: normalizeReportTemplate(scheduler.template || payload.template || "executive"),
        entityId: row.entity_id,
        kpis: payload.kpis || null,
        economics: payload.economics || null,
        recommendations: payload.recommendations || []
      };
    });

    res.json({
      scheduler: {
        enabled: env.executiveReportSchedulerEnabled,
        frequency,
        hourUtc,
        minuteUtc,
        pollMs,
        lookbackDays,
        currentWindowStart,
        nextRunAt
      },
      recentRuns
    });
  })
);

planningRoutes.post(
  "/reports/automation/run-now",
  asyncHandler(async (req, res) => {
    const parseResult = reportAutomationRunNowSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      throw new HttpError(400, "Invalid automation run payload");
    }

    const payload = parseResult.data;
    const template = normalizeReportTemplate(payload.template || "executive");
    const now = new Date();
    const lookbackDays = clampInteger(env.executiveReportSchedulerLookbackDays, 14, 3, 120);

    const to = payload.to ? new Date(payload.to) : now;
    const from = payload.from
      ? new Date(payload.from)
      : new Date(to.getTime() - lookbackDays * 24 * 3600 * 1000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new HttpError(400, "Invalid from/to range in automation run payload");
    }

    const assumptions = {
      feedCostPerKg: payload.assumptions?.feedCostPerKg,
      treatmentCostPerUnit: payload.assumptions?.treatmentCostPerUnit,
      maintenanceCostPerUnit: payload.assumptions?.maintenanceCostPerUnit,
      salePricePerKg: payload.assumptions?.salePricePerKg
    };

    const cleanedAssumptions = Object.fromEntries(
      Object.entries(assumptions).filter(([, value]) => value !== undefined)
    );

    const report = await buildExecutiveReportForTenant({
      tenantId: req.user.tenantId,
      from,
      to,
      assumptions: cleanedAssumptions,
      cadenceFrequency: normalizeCadence(payload.frequency || env.executiveReportSchedulerFrequency)
    });
    const templateReport = buildTemplateReportView(report, template);

    const auditPayload = {
      template,
      scheduler: {
        mode: "manual",
        frequency: normalizeCadence(payload.frequency || env.executiveReportSchedulerFrequency),
        windowStart: from.toISOString(),
        generatedAt: report.generatedAt,
        template,
        requestedByUserId: req.user.id
      },
      kpis: report.kpis,
      economics: report.report?.economics,
      recommendations: (report.recommendations || []).slice(0, 8)
    };

    const auditInsert = await query(
      `
        INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, payload)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING id, created_at
      `,
      [
        req.user.tenantId,
        req.user.id,
        MANUAL_REPORT_ACTION,
        "planning_reports",
        `manual:${new Date().toISOString()}`,
        JSON.stringify(auditPayload)
      ]
    );

    res.status(201).json({
      run: {
        id: auditInsert.rows[0].id,
        createdAt: auditInsert.rows[0].created_at,
        action: MANUAL_REPORT_ACTION,
        template,
        from,
        to
      },
      report,
      templateReport
    });
  })
);

planningRoutes.get(
  "/harvest-simulator/training-scenarios",
  asyncHandler(async (req, res) => {
    const requestedLimit = Number(req.query.limit || 30);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(120, Math.round(requestedLimit)))
      : 30;

    const result = await query(
      `
        SELECT
          id,
          entity_id,
          payload,
          created_at
        FROM audit_logs
        WHERE tenant_id = $1
          AND user_id = $2
          AND action = $3
          AND entity = $4
        ORDER BY created_at DESC
        LIMIT $5
      `,
      [
        req.user.tenantId,
        req.user.id,
        TRAINING_SCENARIO_ACTION,
        TRAINING_SCENARIO_ENTITY,
        limit
      ]
    );

    const scenarios = result.rows.map((row) => {
      const payload = row.payload || {};

      return {
        id: row.entity_id || String(row.id),
        label: payload.label || "Escenario",
        createdAt: payload.createdAt || row.created_at,
        assumptions: payload.assumptions || {},
        summary: payload.summary || {},
        riskBreakdown: payload.riskBreakdown || {},
        topRows: payload.topRows || []
      };
    });

    res.json(scenarios);
  })
);

planningRoutes.post(
  "/harvest-simulator/training-scenarios",
  asyncHandler(async (req, res) => {
    const parseResult = trainingScenarioPayloadSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      throw new HttpError(400, "Invalid training scenario payload");
    }

    const payload = parseResult.data;
    const scenarioId = `scenario:${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const storedPayload = {
      ...payload,
      createdAt
    };

    await query(
      `
        INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, payload)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        req.user.tenantId,
        req.user.id,
        TRAINING_SCENARIO_ACTION,
        TRAINING_SCENARIO_ENTITY,
        scenarioId,
        JSON.stringify(storedPayload)
      ]
    );

    res.status(201).json({
      id: scenarioId,
      label: storedPayload.label || "Escenario",
      createdAt,
      assumptions: storedPayload.assumptions,
      summary: storedPayload.summary,
      riskBreakdown: storedPayload.riskBreakdown || {},
      topRows: storedPayload.topRows || []
    });
  })
);

planningRoutes.delete(
  "/harvest-simulator/training-scenarios",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        DELETE FROM audit_logs
        WHERE tenant_id = $1
          AND user_id = $2
          AND action = $3
          AND entity = $4
      `,
      [
        req.user.tenantId,
        req.user.id,
        TRAINING_SCENARIO_ACTION,
        TRAINING_SCENARIO_ENTITY
      ]
    );

    res.json({
      deleted: result.rowCount || 0
    });
  })
);
