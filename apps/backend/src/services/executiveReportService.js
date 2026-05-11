import { query } from "../database/pool.js";

const DEFAULT_ASSUMPTIONS = {
  feedCostPerKg: 1.28,
  treatmentCostPerUnit: 6.2,
  maintenanceCostPerUnit: 35,
  salePricePerKg: 6.7
};

function numberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function normalizeCadenceFrequency(value) {
  return String(value || "daily").toLowerCase() === "weekly" ? "weekly" : "daily";
}

function resolveNextRunAt(to, cadenceFrequency) {
  const frequency = normalizeCadenceFrequency(cadenceFrequency);
  const nextRunAt = new Date(to.getTime() + (frequency === "weekly" ? 7 : 1) * 24 * 3600 * 1000);

  return {
    frequency,
    nextRunAt
  };
}

function resolveAssumptions(assumptions) {
  return {
    feedCostPerKg: Number.isFinite(Number(assumptions?.feedCostPerKg))
      ? Number(assumptions.feedCostPerKg)
      : DEFAULT_ASSUMPTIONS.feedCostPerKg,
    treatmentCostPerUnit: Number.isFinite(Number(assumptions?.treatmentCostPerUnit))
      ? Number(assumptions.treatmentCostPerUnit)
      : DEFAULT_ASSUMPTIONS.treatmentCostPerUnit,
    maintenanceCostPerUnit: Number.isFinite(Number(assumptions?.maintenanceCostPerUnit))
      ? Number(assumptions.maintenanceCostPerUnit)
      : DEFAULT_ASSUMPTIONS.maintenanceCostPerUnit,
    salePricePerKg: Number.isFinite(Number(assumptions?.salePricePerKg))
      ? Number(assumptions.salePricePerKg)
      : DEFAULT_ASSUMPTIONS.salePricePerKg
  };
}

export async function buildExecutiveReportForTenant({
  tenantId,
  from,
  to,
  assumptions,
  cadenceFrequency = "daily"
}) {
  const tenantNumericId = Number(tenantId);
  if (!Number.isFinite(tenantNumericId) || tenantNumericId <= 0) {
    throw new Error("tenantId must be a positive number");
  }

  const fromDate = from instanceof Date ? from : new Date(from);
  const toDate = to instanceof Date ? to : new Date(to);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error("Invalid from/to date format");
  }

  const safeAssumptions = resolveAssumptions(assumptions);

  const [
    operationsSummary,
    alertsSummary,
    maintenanceSummary,
    harvestSummary,
    shipmentsSummary,
    liveTransportSummary,
    traceabilitySummary,
    biomassSnapshot,
    auditSummary
  ] = await Promise.all([
    query(
      `
        SELECT
          COUNT(*)::int AS operations_count,
          COUNT(DISTINCT pond_id)::int AS ponds_with_activity,
          ROUND(COALESCE(SUM(CASE WHEN type = 'feeding' THEN quantity ELSE 0 END), 0)::numeric, 2) AS feed_kg,
          ROUND(COALESCE(SUM(CASE WHEN type = 'treatment' THEN quantity ELSE 0 END), 0)::numeric, 2) AS treatment_qty,
          ROUND(
            COALESCE(SUM(CASE WHEN type IN ('maintenance', 'cleaning') THEN quantity ELSE 0 END), 0)::numeric,
            2
          ) AS maintenance_qty
        FROM operations
        WHERE tenant_id = $1
          AND event_at BETWEEN $2 AND $3
      `,
      [tenantNumericId, fromDate.toISOString(), toDate.toISOString()]
    ),
    query(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'open')::int AS open_alerts,
          COUNT(*) FILTER (
            WHERE status = 'open'
              AND severity IN ('high', 'critical')
          )::int AS severe_open_alerts,
          COUNT(*) FILTER (WHERE created_at BETWEEN $2 AND $3)::int AS alerts_created_period,
          COUNT(*) FILTER (
            WHERE status = 'resolved'
              AND resolved_at IS NOT NULL
              AND resolved_at BETWEEN $2 AND $3
          )::int AS alerts_resolved_period
        FROM alerts
        WHERE tenant_id = $1
      `,
      [tenantNumericId, fromDate.toISOString(), toDate.toISOString()]
    ),
    query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE status IN ('pending', 'in_progress', 'blocked')
          )::int AS open_tasks,
          COUNT(*) FILTER (
            WHERE status = 'done'
              AND completed_at BETWEEN $2 AND $3
          )::int AS completed_tasks_period,
          COUNT(*)::int AS total_tasks
        FROM maintenance_tasks
        WHERE tenant_id = $1
      `,
      [tenantNumericId, fromDate.toISOString(), toDate.toISOString()]
    ),
    query(
      `
        SELECT
          COUNT(*) FILTER (WHERE window_start BETWEEN $2 AND $3)::int AS plans_created_period,
          COUNT(*) FILTER (
            WHERE status IN ('planned', 'ready', 'in_transit')
          )::int AS active_plans,
          COUNT(*) FILTER (
            WHERE status = 'completed'
              AND completed_at BETWEEN $2 AND $3
          )::int AS completed_plans_period
        FROM harvest_plans
        WHERE tenant_id = $1
      `,
      [tenantNumericId, fromDate.toISOString(), toDate.toISOString()]
    ),
    query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(departure_at, created_at) BETWEEN $2 AND $3
          )::int AS shipments_period,
          COUNT(*) FILTER (
            WHERE status IN ('scheduled', 'in_transit')
          )::int AS open_shipments
        FROM harvest_shipments
        WHERE tenant_id = $1
      `,
      [tenantNumericId, fromDate.toISOString(), toDate.toISOString()]
    ),
    query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(departure_at, created_at) BETWEEN $2 AND $3
          )::int AS trips_period,
          COUNT(*) FILTER (
            WHERE status IN ('planned', 'in_transit')
          )::int AS active_trips,
          COALESCE(
            SUM(fish_units) FILTER (
              WHERE COALESCE(departure_at, created_at) BETWEEN $2 AND $3
            ),
            0
          )::int AS fish_units_period
        FROM live_transport_trips
        WHERE tenant_id = $1
      `,
      [tenantNumericId, fromDate.toISOString(), toDate.toISOString()]
    ),
    query(
      `
        SELECT
          COUNT(DISTINCT lot_code)::int AS tracked_lots
        FROM (
          SELECT lot_code
          FROM operations
          WHERE tenant_id = $1

          UNION ALL

          SELECT lot_code
          FROM biomass_entries
          WHERE tenant_id = $1

          UNION ALL

          SELECT lot_code
          FROM harvest_plans
          WHERE tenant_id = $1

          UNION ALL

          SELECT lot_code
          FROM live_transport_trips
          WHERE tenant_id = $1
        ) lots
        WHERE lot_code IS NOT NULL
          AND lot_code <> ''
      `,
      [tenantNumericId]
    ),
    query(
      `
        SELECT
          ROUND(COALESCE(SUM(snapshot.biomass_kg), 0)::numeric, 2) AS current_biomass_kg,
          COUNT(*)::int AS active_lot_snapshots
        FROM (
          SELECT DISTINCT ON (b.pond_id, COALESCE(NULLIF(b.lot_code, ''), 'SIN-LOTE'))
            ((b.fish_count * b.avg_weight_g) / 1000.0) AS biomass_kg
          FROM biomass_entries b
          WHERE b.tenant_id = $1
          ORDER BY
            b.pond_id,
            COALESCE(NULLIF(b.lot_code, ''), 'SIN-LOTE'),
            b.captured_at DESC
        ) snapshot
      `,
      [tenantNumericId]
    ),
    query(
      `
        SELECT COUNT(*)::int AS audit_entries
        FROM audit_logs
        WHERE tenant_id = $1
          AND created_at BETWEEN $2 AND $3
      `,
      [tenantNumericId, fromDate.toISOString(), toDate.toISOString()]
    )
  ]);

  const operationRow = operationsSummary.rows[0] || {};
  const alertRow = alertsSummary.rows[0] || {};
  const maintenanceRow = maintenanceSummary.rows[0] || {};
  const harvestRow = harvestSummary.rows[0] || {};
  const shipmentRow = shipmentsSummary.rows[0] || {};
  const liveTransportRow = liveTransportSummary.rows[0] || {};
  const traceabilityRow = traceabilitySummary.rows[0] || {};
  const biomassRow = biomassSnapshot.rows[0] || {};
  const auditRow = auditSummary.rows[0] || {};

  const feedKg = numberOrNull(operationRow.feed_kg) ?? 0;
  const treatmentQty = numberOrNull(operationRow.treatment_qty) ?? 0;
  const maintenanceQty = numberOrNull(operationRow.maintenance_qty) ?? 0;
  const currentBiomassKg = numberOrNull(biomassRow.current_biomass_kg) ?? 0;

  const projectedCostEur =
    feedKg * safeAssumptions.feedCostPerKg
    + treatmentQty * safeAssumptions.treatmentCostPerUnit
    + maintenanceQty * safeAssumptions.maintenanceCostPerUnit;
  const projectedRevenueEur = currentBiomassKg * safeAssumptions.salePricePerKg;
  const projectedMarginEur = projectedRevenueEur - projectedCostEur;

  const openAlerts = Number(alertRow.open_alerts) || 0;
  const severeOpenAlerts = Number(alertRow.severe_open_alerts) || 0;
  const openTasks = Number(maintenanceRow.open_tasks) || 0;
  const activeTrips = Number(liveTransportRow.active_trips) || 0;

  const operationalPressureScore = Math.min(
    100,
    severeOpenAlerts * 20 + openAlerts * 8 + openTasks * 4 + activeTrips * 6
  );

  const recommendations = [];

  if (severeOpenAlerts > 0) {
    recommendations.push("Escalar alertas severas activas y verificar protocolos por piscina en <24h.");
  }

  if (openTasks >= 6) {
    recommendations.push("Priorizar backlog de mantenimiento preventivo para reducir riesgo de paradas.");
  }

  if (projectedRevenueEur > 0 && projectedMarginEur / projectedRevenueEur < 0.18) {
    recommendations.push("Revisar supuestos de coste unitario y optimizar conversion alimenticia.");
  }

  if ((Number(shipmentRow.open_shipments) || 0) > 0 && activeTrips > 0) {
    recommendations.push("Sincronizar cosecha y transporte vivo para minimizar tiempos de espera logistico.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Operacion estable en el periodo. Mantener monitoreo diario y auditoria semanal.");
  }

  const cadence = resolveNextRunAt(toDate, cadenceFrequency);

  return {
    generatedAt: new Date().toISOString(),
    period: {
      from: fromDate,
      to: toDate
    },
    cadenceSuggestion: {
      frequency: cadence.frequency,
      nextRunAt: cadence.nextRunAt.toISOString(),
      timezoneHint: "UTC"
    },
    assumptions: safeAssumptions,
    kpis: {
      operationalPressureScore: round(operationalPressureScore, 1) ?? 0,
      openAlerts,
      severeOpenAlerts,
      openMaintenanceTasks: openTasks,
      activeLiveTransportTrips: activeTrips,
      trackedLots: Number(traceabilityRow.tracked_lots) || 0,
      auditEntries: Number(auditRow.audit_entries) || 0
    },
    report: {
      operations: {
        operationsCount: Number(operationRow.operations_count) || 0,
        pondsWithActivity: Number(operationRow.ponds_with_activity) || 0,
        feedKg: round(feedKg, 2) ?? 0,
        treatmentQty: round(treatmentQty, 2) ?? 0,
        maintenanceQty: round(maintenanceQty, 2) ?? 0
      },
      risk: {
        openAlerts,
        severeOpenAlerts,
        alertsCreatedPeriod: Number(alertRow.alerts_created_period) || 0,
        alertsResolvedPeriod: Number(alertRow.alerts_resolved_period) || 0
      },
      maintenance: {
        openTasks,
        completedTasksPeriod: Number(maintenanceRow.completed_tasks_period) || 0,
        totalTasks: Number(maintenanceRow.total_tasks) || 0
      },
      harvest: {
        plansCreatedPeriod: Number(harvestRow.plans_created_period) || 0,
        activePlans: Number(harvestRow.active_plans) || 0,
        completedPlansPeriod: Number(harvestRow.completed_plans_period) || 0
      },
      logistics: {
        harvestShipmentsPeriod: Number(shipmentRow.shipments_period) || 0,
        openHarvestShipments: Number(shipmentRow.open_shipments) || 0,
        liveTransportTripsPeriod: Number(liveTransportRow.trips_period) || 0,
        activeLiveTransportTrips: activeTrips,
        liveTransportFishUnitsPeriod: Number(liveTransportRow.fish_units_period) || 0
      },
      economics: {
        currentBiomassKg: round(currentBiomassKg, 2) ?? 0,
        projectedCostEur: round(projectedCostEur, 2) ?? 0,
        projectedRevenueEur: round(projectedRevenueEur, 2) ?? 0,
        projectedMarginEur: round(projectedMarginEur, 2) ?? 0,
        projectedMarginPct: projectedRevenueEur > 0
          ? round((projectedMarginEur / projectedRevenueEur) * 100, 2)
          : null,
        activeLotSnapshots: Number(biomassRow.active_lot_snapshots) || 0
      },
      traceability: {
        trackedLots: Number(traceabilityRow.tracked_lots) || 0
      },
      compliance: {
        auditEntries: Number(auditRow.audit_entries) || 0
      }
    },
    recommendations
  };
}
