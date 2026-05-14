import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAnyFeature, requireFeature } from "../middleware/featureAccess.js";
import { validate } from "../middleware/validate.js";
import {
  createDemoWaterFlowReading,
  getDemoHistory,
  getDemoLatestReadings,
  getDemoPonds,
  getDemoSensorHealthOverview,
  getDemoSensors,
  getDemoSites,
  getDemoWaterFlowConfig,
  getDemoWaterFlowOverview,
  listDemoWaterFlowAlerts,
  resolveDemoWaterFlowAlert,
  updateDemoWaterFlowConfig
} from "../services/noDbDemoService.js";
import { FEATURE_KEYS } from "../security/featureCatalog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const createPondSchema = z.object({
  siteId: z.number().int().positive().optional().nullable(),
  name: z.string().min(2),
  species: z.string().min(2),
  volumeM3: z.number().positive().optional().nullable()
});

const createSensorSchema = z.object({
  pondId: z.number().int().positive(),
  name: z.string().min(2),
  type: z.string().min(2),
  unit: z.string().min(1)
});

const updateWaterFlowMeterSchema = z.object({
  id: z.coerce.number().int().positive(),
  calibrationK: z.coerce.number().min(0),
  enabled: z.boolean().optional()
});

const updateWaterFlowConfigSchema = z
  .object({
    calibrationK: z.coerce.number().min(0).optional(),
    annualConcessionM3: z.number().positive().max(2_000_000_000).optional(),
    deviationWarningPct: z.number().min(1).max(99).optional(),
    deviationCriticalPct: z.number().min(1).max(150).optional(),
    concessionWarningPct: z.number().min(1).max(150).optional(),
    concessionCriticalPct: z.number().min(1).max(200).optional(),
    meters: z.array(updateWaterFlowMeterSchema).max(24).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  })
  .superRefine((value, ctx) => {
    if (
      Number.isFinite(value.deviationWarningPct) &&
      Number.isFinite(value.deviationCriticalPct) &&
      value.deviationCriticalPct < value.deviationWarningPct
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["deviationCriticalPct"],
        message: "deviationCriticalPct must be greater than or equal to deviationWarningPct"
      });
    }

    if (
      Number.isFinite(value.concessionWarningPct) &&
      Number.isFinite(value.concessionCriticalPct) &&
      value.concessionCriticalPct < value.concessionWarningPct
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["concessionCriticalPct"],
        message: "concessionCriticalPct must be greater than or equal to concessionWarningPct"
      });
    }
  });

const createWaterFlowReadingSchema = z.object({
  recordedAt: z.string().datetime().optional(),
  incomingMeasuredM3h: z.number().min(0),
  outgoingMeasuredM3h: z.number().min(0),
  recirculatedM3h: z.number().min(0).nullable().optional(),
  dischargeQualityPct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional()
});

export const dataRoutes = Router();

const requireCoreDataFeature = requireAnyFeature([
  FEATURE_KEYS.DASHBOARD_VIEW,
  FEATURE_KEYS.PLANT_VIEW,
  FEATURE_KEYS.OXYGEN_VIEW,
  FEATURE_KEYS.HISTORY_VIEW,
  FEATURE_KEYS.ALERTS_VIEW,
  FEATURE_KEYS.OPERATIONS_VIEW,
  FEATURE_KEYS.PLANNING_VIEW,
  FEATURE_KEYS.TRACEABILITY_VIEW,
  FEATURE_KEYS.BIOMASS_VIEW,
  FEATURE_KEYS.HATCHERY_VIEW,
  FEATURE_KEYS.CONSOLIDATION_VIEW
]);
const requireReadingsFeature = requireAnyFeature([
  FEATURE_KEYS.DASHBOARD_VIEW,
  FEATURE_KEYS.PLANT_VIEW,
  FEATURE_KEYS.OXYGEN_VIEW,
  FEATURE_KEYS.HISTORY_VIEW
]);
const requireSetpointsFeature = requireFeature(FEATURE_KEYS.SETPOINTS_VIEW);

const setpointPaths = new Set([
  "/oxygen/setpoints",
  "/oxygen/color-setpoints",
  "/temperature/color-setpoints",
  "/alerts/phone-setpoints",
  "/alerts/sms-setpoints"
]);

const flowMonthLabels = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic"
];

const flowHourWindows = [24, 48, 72, 168];

const waterFlowDefaultMeters = [
  {
    meterCode: "WF-IN-01",
    meterName: "Caudalimetro entrante",
    channelKey: "incoming"
  },
  {
    meterCode: "WF-OUT-01",
    meterName: "Caudalimetro saliente",
    channelKey: "outgoing"
  },
  {
    meterCode: "WF-REC-01",
    meterName: "Caudalimetro recirculacion",
    channelKey: "recirculated"
  }
];

const sensorHealthProfiles = {
  oxygen: {
    min: 5.8,
    max: 9.5,
    jumpWarning: 0.8,
    jumpCritical: 1.4,
    frozenRangeMax: 0.08,
    freezeMinSamples: 6
  },
  temperature: {
    min: 13.5,
    max: 23,
    jumpWarning: 1.8,
    jumpCritical: 3.1,
    frozenRangeMax: 0.24,
    freezeMinSamples: 6
  },
  ph: {
    min: 7,
    max: 8.2,
    jumpWarning: 0.18,
    jumpCritical: 0.32,
    frozenRangeMax: 0.03,
    freezeMinSamples: 6
  },
  salinity: {
    min: 29,
    max: 37.8,
    jumpWarning: 2.2,
    jumpCritical: 3.8,
    frozenRangeMax: 0.32,
    freezeMinSamples: 6
  },
  turbidity: {
    min: 0,
    max: 15,
    jumpWarning: 4,
    jumpCritical: 6.5,
    frozenRangeMax: 0.5,
    freezeMinSamples: 6
  },
  default: {
    min: 0,
    max: 100,
    jumpWarning: 12,
    jumpCritical: 20,
    frozenRangeMax: 0.2,
    freezeMinSamples: 6
  }
};

const sensorHealthSeverityPriority = {
  ok: 0,
  warning: 1,
  critical: 2
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sensorHealthProfileForType(sensorType) {
  const normalized = String(sensorType || "").toLowerCase();
  return sensorHealthProfiles[normalized] || sensorHealthProfiles.default;
}

function healthIncidentPenalty(code, severity) {
  if (code === "missing_signal") {
    return severity === "critical" ? 58 : 34;
  }

  if (code === "out_of_range") {
    return severity === "critical" ? 35 : 20;
  }

  if (code === "abrupt_jump") {
    return severity === "critical" ? 25 : 15;
  }

  if (code === "frozen_signal") {
    return severity === "critical" ? 26 : 18;
  }

  if (code === "quality_flag") {
    return 10;
  }

  return severity === "critical" ? 24 : 12;
}

function evaluateSensorHealthRow(row, { staleMinutes }) {
  const nowMs = Date.now();
  const sensorType = String(row.sensor_type || "unknown").toLowerCase();
  const profile = sensorHealthProfileForType(sensorType);
  const enabled = Boolean(row.enabled);

  const currentValue = toNullableNumber(row.current_value);
  const previousValue = toNullableNumber(row.prev_value);
  const windowMin = toNullableNumber(row.window_min);
  const windowMax = toNullableNumber(row.window_max);
  const sampleCount = toNumber(row.sample_count, 0);
  const quality = String(row.last_quality || "").trim().toLowerCase();

  const lastReadingAt = row.last_recorded_at || null;
  const previousReadingAt = row.prev_recorded_at || null;

  let minutesSinceLast = null;
  if (lastReadingAt) {
    const lastMs = new Date(lastReadingAt).getTime();
    if (Number.isFinite(lastMs)) {
      minutesSinceLast = (nowMs - lastMs) / 60000;
    }
  }

  const checks = {
    missingSignal: {
      triggered: false,
      severity: null,
      thresholdMinutes: staleMinutes,
      minutesSinceLast: minutesSinceLast === null ? null : round(minutesSinceLast, 1)
    },
    outOfRange: {
      triggered: false,
      severity: null,
      minAllowed: profile.min,
      maxAllowed: profile.max,
      distance: null
    },
    frozenSignal: {
      triggered: false,
      severity: null,
      sampleCount,
      range: null,
      maxRangeAllowed: profile.frozenRangeMax
    },
    abruptJump: {
      triggered: false,
      severity: null,
      delta: null,
      warningThreshold: profile.jumpWarning,
      criticalThreshold: profile.jumpCritical
    },
    qualityFlag: {
      triggered: false,
      severity: null,
      quality: quality || null
    }
  };

  const incidents = [];
  const addIncident = (code, severity, message, details = {}) => {
    incidents.push({
      code,
      severity,
      message,
      ...details
    });
  };

  if (enabled) {
    if (minutesSinceLast === null) {
      checks.missingSignal = {
        ...checks.missingSignal,
        triggered: true,
        severity: "critical"
      };

      addIncident(
        "missing_signal",
        "critical",
        "Sensor sin telemetria disponible.",
        { minutesSinceLast: null }
      );
    } else if (minutesSinceLast > staleMinutes) {
      checks.missingSignal = {
        ...checks.missingSignal,
        triggered: true,
        severity: "critical"
      };

      addIncident(
        "missing_signal",
        "critical",
        `Sin muestra reciente (${round(minutesSinceLast, 1)} min).`,
        { minutesSinceLast: round(minutesSinceLast, 1) }
      );
    }

    if (currentValue !== null && (currentValue < profile.min || currentValue > profile.max)) {
      const rangeSpan = Math.max(0.001, profile.max - profile.min);
      const distance = currentValue < profile.min
        ? profile.min - currentValue
        : currentValue - profile.max;
      const severity = distance >= rangeSpan * 0.25 ? "critical" : "warning";

      checks.outOfRange = {
        ...checks.outOfRange,
        triggered: true,
        severity,
        distance: round(distance, 3)
      };

      addIncident(
        "out_of_range",
        severity,
        `Valor fuera de rango recomendado (${profile.min} - ${profile.max}).`,
        {
          currentValue,
          minAllowed: profile.min,
          maxAllowed: profile.max,
          distance: round(distance, 3)
        }
      );
    }

    if (sampleCount >= profile.freezeMinSamples && windowMin !== null && windowMax !== null) {
      const windowRange = Math.abs(windowMax - windowMin);

      checks.frozenSignal = {
        ...checks.frozenSignal,
        range: round(windowRange, 3)
      };

      if (windowRange <= profile.frozenRangeMax) {
        checks.frozenSignal = {
          ...checks.frozenSignal,
          triggered: true,
          severity: "warning"
        };

        addIncident(
          "frozen_signal",
          "warning",
          "Serie con variacion minima (posible sensor degradado o bloqueado).",
          {
            range: round(windowRange, 3),
            sampleCount
          }
        );
      }
    }

    if (currentValue !== null && previousValue !== null) {
      const delta = Math.abs(currentValue - previousValue);

      checks.abruptJump = {
        ...checks.abruptJump,
        delta: round(delta, 3)
      };

      if (delta >= profile.jumpWarning) {
        const severity = delta >= profile.jumpCritical ? "critical" : "warning";

        checks.abruptJump = {
          ...checks.abruptJump,
          triggered: true,
          severity
        };

        addIncident(
          "abrupt_jump",
          severity,
          "Salto brusco entre las dos ultimas lecturas.",
          {
            delta: round(delta, 3),
            previousValue,
            currentValue
          }
        );
      }
    }

    if (quality && !["ok", "good"].includes(quality)) {
      checks.qualityFlag = {
        ...checks.qualityFlag,
        triggered: true,
        severity: "warning"
      };

      addIncident(
        "quality_flag",
        "warning",
        `Muestra marcada con calidad ${quality}.`,
        { quality }
      );
    }
  }

  const status = !enabled
    ? "disabled"
    : incidents.reduce((current, incident) => {
        return sensorHealthSeverityPriority[incident.severity] > sensorHealthSeverityPriority[current]
          ? incident.severity
          : current;
      }, "ok");

  let healthScore = null;
  if (enabled) {
    healthScore = 100;

    for (const incident of incidents) {
      healthScore -= healthIncidentPenalty(incident.code, incident.severity);
    }

    healthScore = clamp(Math.round(healthScore), 0, 100);
  }

  return {
    sensorId: toNumber(row.sensor_id, 0),
    sensorName: row.sensor_name,
    sensorType,
    pondId: toNumber(row.pond_id, 0),
    pondName: row.pond_name,
    unit: row.unit,
    enabled,
    status,
    healthScore,
    currentValue,
    previousValue,
    lastReadingAt,
    previousReadingAt,
    minutesSinceLast: minutesSinceLast === null ? null : round(minutesSinceLast, 1),
    sampleCount,
    windowMin,
    windowMax,
    windowAvg: toNullableNumber(row.window_avg),
    windowStddev: toNullableNumber(row.window_stddev),
    checks,
    incidents
  };
}

function summarizeSensorHealth(sensors) {
  const activeSensors = sensors.filter((sensor) => sensor.enabled);
  const okSensors = activeSensors.filter((sensor) => sensor.status === "ok").length;
  const warningSensors = activeSensors.filter((sensor) => sensor.status === "warning").length;
  const criticalSensors = activeSensors.filter((sensor) => sensor.status === "critical").length;

  const incidentsByCode = {};
  const topIncidents = [];

  const byTypeMap = new Map();
  for (const sensor of sensors) {
    const key = String(sensor.sensorType || "unknown");

    if (!byTypeMap.has(key)) {
      byTypeMap.set(key, {
        sensorType: key,
        total: 0,
        ok: 0,
        warning: 0,
        critical: 0,
        disabled: 0
      });
    }

    const bucket = byTypeMap.get(key);
    bucket.total += 1;

    if (sensor.status === "disabled") {
      bucket.disabled += 1;
    } else if (sensor.status === "critical") {
      bucket.critical += 1;
    } else if (sensor.status === "warning") {
      bucket.warning += 1;
    } else {
      bucket.ok += 1;
    }

    for (const incident of sensor.incidents || []) {
      incidentsByCode[incident.code] = toNumber(incidentsByCode[incident.code], 0) + 1;
      topIncidents.push({
        ...incident,
        sensorId: sensor.sensorId,
        sensorName: sensor.sensorName,
        sensorType: sensor.sensorType,
        pondName: sensor.pondName
      });
    }
  }

  topIncidents.sort((left, right) => {
    const severityDelta =
      toNumber(sensorHealthSeverityPriority[right.severity], 0)
      - toNumber(sensorHealthSeverityPriority[left.severity], 0);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return String(left.sensorName || "").localeCompare(String(right.sensorName || ""));
  });

  const scoreSamples = activeSensors
    .map((sensor) => toNullableNumber(sensor.healthScore))
    .filter((score) => score !== null);
  const overallScore = scoreSamples.length > 0
    ? round(scoreSamples.reduce((sum, score) => sum + score, 0) / scoreSamples.length, 1)
    : null;

  return {
    totalSensors: sensors.length,
    activeSensors: activeSensors.length,
    disabledSensors: sensors.length - activeSensors.length,
    okSensors,
    warningSensors,
    criticalSensors,
    overallScore,
    incidentTotal: topIncidents.length,
    incidentsByCode,
    byType: Array.from(byTypeMap.values()).sort((left, right) =>
      String(left.sensorType).localeCompare(String(right.sensorType))
    ),
    topIncidents: topIncidents.slice(0, 12)
  };
}

function pseudoNoise(seed, index) {
  const value = Math.sin(seed * 13.173 + index * 79.217) * 43758.5453123;
  return value - Math.floor(value);
}

function normalizeWaterFlowConfig(row) {
  return {
    calibrationK: toNumber(row?.calibration_k, 1),
    annualConcessionM3: toNumber(row?.annual_concession_m3, 8_500_000),
    deviationWarningPct: toNumber(row?.deviation_warning_pct, 8),
    deviationCriticalPct: toNumber(row?.deviation_critical_pct, 14),
    concessionWarningPct: toNumber(row?.concession_warning_pct, 85),
    concessionCriticalPct: toNumber(row?.concession_critical_pct, 100),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

function mapWaterFlowMeterRow(row) {
  return {
    id: toNumber(row.id, 0),
    meterCode: row.meter_code,
    meterName: row.meter_name,
    channelKey: row.channel_key,
    calibrationK: toNumber(row.calibration_k, 1),
    enabled: Boolean(row.enabled),
    installedAt: row.installed_at,
    updatedAt: row.updated_at
  };
}

function resolveWaterFlowKByChannel(config, meters) {
  const fallbackK = toNumber(config?.calibrationK, 1);
  const kByChannel = {
    incoming: fallbackK,
    outgoing: fallbackK,
    recirculated: fallbackK
  };

  for (const meter of meters || []) {
    if (!meter || meter.enabled === false) {
      continue;
    }

    const channelKey = String(meter.channelKey || "").toLowerCase();

    if (!["incoming", "outgoing", "recirculated"].includes(channelKey)) {
      continue;
    }

    kByChannel[channelKey] = toNumber(meter.calibrationK, fallbackK);
  }

  return kByChannel;
}

function mapWaterFlowAlertRow(row) {
  return {
    id: toNumber(row.id, 0),
    alertType: row.alert_type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    metricValue: row.metric_value === null ? null : toNumber(row.metric_value, 0),
    thresholdValue: row.threshold_value === null ? null : toNumber(row.threshold_value, 0),
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at
  };
}

async function ensureWaterFlowConfig(tenantId) {
  await query(
    `
      INSERT INTO water_flow_config (
        tenant_id,
        calibration_k,
        annual_concession_m3,
        deviation_warning_pct,
        deviation_critical_pct,
        concession_warning_pct,
        concession_critical_pct
      )
      VALUES ($1, 1, 8500000, 8, 14, 85, 100)
      ON CONFLICT (tenant_id) DO NOTHING
    `,
    [tenantId]
  );

  const configResult = await query(
    `
      SELECT
        calibration_k,
        annual_concession_m3,
        deviation_warning_pct,
        deviation_critical_pct,
        concession_warning_pct,
        concession_critical_pct,
        created_at,
        updated_at
      FROM water_flow_config
      WHERE tenant_id = $1
      LIMIT 1
    `,
    [tenantId]
  );

  return normalizeWaterFlowConfig(configResult.rows[0] || null);
}

async function ensureWaterFlowMeters(tenantId, fallbackCalibrationK = 1) {
  for (const meter of waterFlowDefaultMeters) {
    await query(
      `
        INSERT INTO water_flow_meters (
          tenant_id,
          meter_code,
          meter_name,
          channel_key,
          calibration_k,
          enabled
        )
        VALUES ($1, $2, $3, $4, $5, TRUE)
        ON CONFLICT (tenant_id, channel_key) DO NOTHING
      `,
      [tenantId, meter.meterCode, meter.meterName, meter.channelKey, fallbackCalibrationK]
    );
  }

  const result = await query(
    `
      SELECT
        id,
        meter_code,
        meter_name,
        channel_key,
        calibration_k,
        enabled,
        installed_at,
        updated_at
      FROM water_flow_meters
      WHERE tenant_id = $1
      ORDER BY channel_key ASC, meter_code ASC
    `,
    [tenantId]
  );

  return result.rows.map(mapWaterFlowMeterRow);
}

function buildSyntheticFlowSeries(hours, kByChannel) {
  const safeHours = flowHourWindows.includes(Number(hours)) ? Number(hours) : 72;
  const nowMs = Date.now();

  const incomingK = toNumber(kByChannel?.incoming, 1);
  const outgoingK = toNumber(kByChannel?.outgoing, incomingK);
  const recirculatedK = toNumber(kByChannel?.recirculated, incomingK);

  return Array.from({ length: safeHours }, (_item, index) => {
    const timestamp = new Date(nowMs - (safeHours - 1 - index) * 3600 * 1000);
    const month = timestamp.getMonth();
    const hour = timestamp.getHours() + timestamp.getMinutes() / 60;

    const diurnal = Math.sin((hour / 24) * Math.PI * 2 - Math.PI / 2);
    const weekly = Math.sin((index / 168) * Math.PI * 2 + 0.6);
    const seasonal = 1 + Math.sin((month / 12) * Math.PI * 2 - 0.75) * 0.09;

    const incomingMeasured = clamp(
      (640 + diurnal * 118 + weekly * 42 + (pseudoNoise(7.3, index) - 0.5) * 44) * seasonal,
      420,
      980
    );

    const outgoingMeasured = clamp(
      incomingMeasured * (0.868 + Math.sin(index * 0.13) * 0.025) + (pseudoNoise(11.2, index) - 0.5) * 18,
      350,
      incomingMeasured * 0.985
    );

    const incomingCalibrated = incomingMeasured * incomingK;
    const outgoingCalibrated = outgoingMeasured * outgoingK;

    return {
      timestamp: timestamp.toISOString(),
      incomingMeasured: round(incomingMeasured),
      outgoingMeasured: round(outgoingMeasured),
      incomingCalibrated: round(incomingCalibrated),
      outgoingCalibrated: round(outgoingCalibrated),
      netPlantBalance: round(incomingCalibrated - outgoingCalibrated),
      recirculated: round(
        incomingMeasured * clamp(0.24 + Math.sin(index * 0.07) * 0.05, 0.14, 0.38) * recirculatedK
      ),
      dischargeQualityIndex: round(
        clamp(91 + Math.sin(index * 0.1 + 1.3) * 4 + (pseudoNoise(19.1, index) - 0.5) * 6, 74, 99)
      )
    };
  });
}

async function getWaterFlowSeries(tenantId, hours, kByChannel) {
  const safeHours = flowHourWindows.includes(Number(hours)) ? Number(hours) : 72;
  const fromIso = new Date(Date.now() - (safeHours - 1) * 3600 * 1000).toISOString();

  const incomingK = toNumber(kByChannel?.incoming, 1);
  const outgoingK = toNumber(kByChannel?.outgoing, incomingK);
  const recirculatedK = toNumber(kByChannel?.recirculated, incomingK);

  const result = await query(
    `
      SELECT
        id,
        recorded_at,
        incoming_measured_m3h,
        outgoing_measured_m3h,
        recirculated_m3h,
        discharge_quality_pct
      FROM water_flow_readings
      WHERE tenant_id = $1
        AND recorded_at >= $2
      ORDER BY recorded_at ASC
    `,
    [tenantId, fromIso]
  );

  if (result.rowCount === 0) {
    return {
      syntheticData: true,
      series: buildSyntheticFlowSeries(safeHours, kByChannel)
    };
  }

  const series = result.rows.map((row) => {
    const incomingMeasured = toNumber(row.incoming_measured_m3h, 0);
    const outgoingMeasured = toNumber(row.outgoing_measured_m3h, 0);
    const recirculatedMeasured = toNumber(
      row.recirculated_m3h,
      incomingMeasured * clamp(0.24 + Math.sin(incomingMeasured * 0.01) * 0.06, 0.14, 0.4)
    );
    const qualityIndex = clamp(toNumber(row.discharge_quality_pct, 91), 0, 100);

    const incomingCalibrated = incomingMeasured * incomingK;
    const outgoingCalibrated = outgoingMeasured * outgoingK;

    return {
      timestamp: row.recorded_at,
      incomingMeasured: round(incomingMeasured),
      outgoingMeasured: round(outgoingMeasured),
      incomingCalibrated: round(incomingCalibrated),
      outgoingCalibrated: round(outgoingCalibrated),
      netPlantBalance: round(incomingCalibrated - outgoingCalibrated),
      recirculated: round(recirculatedMeasured * recirculatedK),
      dischargeQualityIndex: round(qualityIndex)
    };
  });

  return {
    syntheticData: false,
    series
  };
}

function buildSyntheticYearlyRows(year, kByChannel, annualConcessionM3) {
  const safeYear = Number(year) || new Date().getFullYear();
  const safeConcession = Math.max(1, toNumber(annualConcessionM3, 8_500_000));
  const incomingK = Math.max(0, toNumber(kByChannel?.incoming, 1));
  const outgoingK = Math.max(0, toNumber(kByChannel?.outgoing, incomingK));
  const recirculatedK = Math.max(0, toNumber(kByChannel?.recirculated, incomingK));
  let cumulativeIncoming = 0;

  return flowMonthLabels.map((monthLabel, monthIndex) => {
    const daysInMonth = new Date(safeYear, monthIndex + 1, 0).getDate();
    const seasonal = 1 + Math.sin(((monthIndex + 1) / 12) * Math.PI * 2 - 0.8) * 0.11;
    const baselineHourlyIncoming = 655 + Math.sin(monthIndex * 0.9) * 52;

    const baseIncomingM3 = Math.max(
      1,
      baselineHourlyIncoming * 24 * daysInMonth * seasonal
        + (pseudoNoise(safeYear * 0.03, monthIndex) - 0.5) * 12000
    );
    const incomingM3 = baseIncomingM3 * incomingK;
    const outgoingM3 = baseIncomingM3
      * clamp(0.868 + Math.sin(monthIndex * 0.65) * 0.03, 0.81, 0.94)
      * outgoingK;
    const recirculatedM3 = baseIncomingM3
      * clamp(0.23 + Math.cos(monthIndex * 0.37) * 0.045, 0.15, 0.35)
      * recirculatedK;

    cumulativeIncoming += incomingM3;

    return {
      monthLabel,
      monthIndex,
      incomingM3: round(incomingM3),
      outgoingM3: round(outgoingM3),
      recirculatedM3: round(recirculatedM3),
      cumulativeIncoming: round(cumulativeIncoming),
      concessionUsedPct: round((cumulativeIncoming / safeConcession) * 100),
      concessionRemainingM3: round(safeConcession - cumulativeIncoming),
      estimated: true
    };
  });
}

async function getWaterFlowYearlyRows(tenantId, year, config, kByChannel) {
  const safeYear = Number(year) || new Date().getFullYear();
  const yearStart = new Date(safeYear, 0, 1).toISOString();
  const yearEnd = new Date(safeYear + 1, 0, 1).toISOString();

  const incomingK = toNumber(kByChannel?.incoming, toNumber(config.calibrationK, 1));
  const outgoingK = toNumber(kByChannel?.outgoing, incomingK);
  const recirculatedK = toNumber(kByChannel?.recirculated, incomingK);

  const result = await query(
    `
      SELECT
        EXTRACT(MONTH FROM recorded_at)::int AS month_index,
        SUM(incoming_measured_m3h) AS incoming_total,
        SUM(outgoing_measured_m3h) AS outgoing_total,
        SUM(COALESCE(recirculated_m3h, 0)) AS recirculated_total
      FROM water_flow_readings
      WHERE tenant_id = $1
        AND recorded_at >= $2
        AND recorded_at < $3
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    [tenantId, yearStart, yearEnd]
  );

  const monthTotals = Array.from({ length: 12 }, () => ({
    incomingM3: 0,
    outgoingM3: 0,
    recirculatedM3: 0
  }));

  for (const row of result.rows) {
    const monthIndex = clamp(toNumber(row.month_index, 1) - 1, 0, 11);
    monthTotals[monthIndex].incomingM3 = toNumber(row.incoming_total, 0) * incomingK;
    monthTotals[monthIndex].outgoingM3 = toNumber(row.outgoing_total, 0) * outgoingK;
    monthTotals[monthIndex].recirculatedM3 = toNumber(row.recirculated_total, 0) * recirculatedK;
  }

  const totalIncoming = monthTotals.reduce((acc, row) => acc + row.incomingM3, 0);

  if (totalIncoming <= 0) {
    return buildSyntheticYearlyRows(safeYear, kByChannel, config.annualConcessionM3);
  }

  let cumulativeIncoming = 0;

  return monthTotals.map((row, monthIndex) => {
    cumulativeIncoming += row.incomingM3;

    return {
      monthLabel: flowMonthLabels[monthIndex],
      monthIndex,
      incomingM3: round(row.incomingM3),
      outgoingM3: round(row.outgoingM3),
      recirculatedM3: round(row.recirculatedM3),
      cumulativeIncoming: round(cumulativeIncoming),
      concessionUsedPct: round((cumulativeIncoming / config.annualConcessionM3) * 100),
      concessionRemainingM3: round(config.annualConcessionM3 - cumulativeIncoming),
      estimated: false
    };
  });
}

async function listWaterFlowAlerts(tenantId, status = "open") {
  const normalized = String(status || "open").toLowerCase();
  const safeStatus = ["open", "resolved", "all"].includes(normalized) ? normalized : "open";

  const params = [tenantId];
  let statusClause = "";

  if (safeStatus !== "all") {
    params.push(safeStatus);
    statusClause = "AND status = $2";
  }

  const result = await query(
    `
      SELECT
        id,
        alert_type,
        severity,
        status,
        title,
        description,
        metric_value,
        threshold_value,
        metadata,
        created_at,
        updated_at,
        resolved_at
      FROM water_flow_alerts
      WHERE tenant_id = $1
        ${statusClause}
      ORDER BY created_at DESC
      LIMIT 120
    `,
    params
  );

  return result.rows.map(mapWaterFlowAlertRow);
}

async function syncWaterFlowAlert({
  tenantId,
  openAlertsByType,
  alertType,
  active,
  severity,
  title,
  description,
  metricValue,
  thresholdValue,
  metadata
}) {
  const existing = openAlertsByType.get(alertType) || null;

  if (!active) {
    if (!existing) {
      return;
    }

    await query(
      `
        UPDATE water_flow_alerts
        SET
          status = 'resolved',
          updated_at = NOW(),
          resolved_at = NOW()
        WHERE id = $1
          AND tenant_id = $2
      `,
      [existing.id, tenantId]
    );
    openAlertsByType.delete(alertType);
    return;
  }

  if (existing) {
    await query(
      `
        UPDATE water_flow_alerts
        SET
          severity = $1,
          title = $2,
          description = $3,
          metric_value = $4,
          threshold_value = $5,
          metadata = $6::jsonb,
          updated_at = NOW()
        WHERE id = $7
          AND tenant_id = $8
      `,
      [
        severity,
        title,
        description,
        metricValue,
        thresholdValue,
        JSON.stringify(metadata || {}),
        existing.id,
        tenantId
      ]
    );
    return;
  }

  const inserted = await query(
    `
      INSERT INTO water_flow_alerts (
        tenant_id,
        alert_type,
        severity,
        status,
        title,
        description,
        metric_value,
        threshold_value,
        metadata
      )
      VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING id, alert_type
    `,
    [
      tenantId,
      alertType,
      severity,
      title,
      description,
      metricValue,
      thresholdValue,
      JSON.stringify(metadata || {})
    ]
  );

  if (inserted.rowCount > 0) {
    openAlertsByType.set(inserted.rows[0].alert_type, inserted.rows[0]);
    return;
  }

  const concurrentResult = await query(
    `
      SELECT id, alert_type
      FROM water_flow_alerts
      WHERE tenant_id = $1
        AND alert_type = $2
        AND status = 'open'
      LIMIT 1
    `,
    [tenantId, alertType]
  );

  if (concurrentResult.rowCount === 0) {
    return;
  }

  openAlertsByType.set(concurrentResult.rows[0].alert_type, concurrentResult.rows[0]);

  await query(
    `
      UPDATE water_flow_alerts
      SET
        severity = $1,
        title = $2,
        description = $3,
        metric_value = $4,
        threshold_value = $5,
        metadata = $6::jsonb,
        updated_at = NOW()
      WHERE id = $7
        AND tenant_id = $8
    `,
    [
      severity,
      title,
      description,
      metricValue,
      thresholdValue,
      JSON.stringify(metadata || {}),
      concurrentResult.rows[0].id,
      tenantId
    ]
  );
}

async function evaluateWaterFlowAlerts(tenantId, config, kByChannel) {
  const now = new Date();
  const yearStartIso = new Date(now.getFullYear(), 0, 1).toISOString();
  const nowIso = now.toISOString();

  const incomingK = toNumber(kByChannel?.incoming, toNumber(config.calibrationK, 1));
  const outgoingK = toNumber(kByChannel?.outgoing, incomingK);

  const [latestResult, ytdResult, openAlertsResult] = await Promise.all([
    query(
      `
        SELECT
          recorded_at,
          incoming_measured_m3h,
          outgoing_measured_m3h
        FROM water_flow_readings
        WHERE tenant_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1
      `,
      [tenantId]
    ),
    query(
      `
        SELECT COALESCE(SUM(incoming_measured_m3h), 0) AS incoming_total
        FROM water_flow_readings
        WHERE tenant_id = $1
          AND recorded_at >= $2
          AND recorded_at <= $3
      `,
      [tenantId, yearStartIso, nowIso]
    ),
    query(
      `
        SELECT id, alert_type
        FROM water_flow_alerts
        WHERE tenant_id = $1
          AND status = 'open'
      `,
      [tenantId]
    )
  ]);

  const openAlertsByType = new Map(
    openAlertsResult.rows.map((row) => [String(row.alert_type), row])
  );

  const latest = latestResult.rows[0] || null;
  const incomingYtd = toNumber(ytdResult.rows[0]?.incoming_total, 0) * incomingK;
  const concessionUsedPct = config.annualConcessionM3 > 0
    ? (incomingYtd / config.annualConcessionM3) * 100
    : 0;

  const deviationPct = latest && toNumber(latest.incoming_measured_m3h, 0) > 0
    ? (
        Math.abs(
          toNumber(latest.incoming_measured_m3h, 0) * incomingK
            - toNumber(latest.outgoing_measured_m3h, 0) * outgoingK
        )
        / Math.max(0.001, toNumber(latest.incoming_measured_m3h, 0) * incomingK)
      ) * 100
    : 0;

  const deviationSeverity = deviationPct >= config.deviationCriticalPct
    ? "critical"
    : deviationPct >= config.deviationWarningPct
      ? "warning"
      : null;

  await syncWaterFlowAlert({
    tenantId,
    openAlertsByType,
    alertType: "flow_deviation",
    active: Boolean(deviationSeverity),
    severity: deviationSeverity || "warning",
    title: "Desviacion de caudal entrante/saliente",
    description: `Desviacion actual ${round(deviationPct, 2)}% con K entrante=${round(incomingK, 3)} y K saliente=${round(outgoingK, 3)}.`,
    metricValue: round(deviationPct, 3),
    thresholdValue: round(
      deviationSeverity === "critical" ? config.deviationCriticalPct : config.deviationWarningPct,
      3
    ),
    metadata: {
      recordedAt: latest?.recorded_at || null,
      incomingCalibrated: latest ? round(toNumber(latest.incoming_measured_m3h, 0) * incomingK, 3) : null,
      outgoingCalibrated: latest ? round(toNumber(latest.outgoing_measured_m3h, 0) * outgoingK, 3) : null
    }
  });

  const concessionSeverity = concessionUsedPct >= config.concessionCriticalPct
    ? "critical"
    : concessionUsedPct >= config.concessionWarningPct
      ? "warning"
      : null;

  await syncWaterFlowAlert({
    tenantId,
    openAlertsByType,
    alertType: "concession_overuse",
    active: Boolean(concessionSeverity),
    severity: concessionSeverity || "warning",
    title: "Sobreconsumo de concesion anual",
    description: `Uso acumulado ${round(concessionUsedPct, 2)}% sobre ${round(config.annualConcessionM3, 0)} m3.`,
    metricValue: round(concessionUsedPct, 3),
    thresholdValue: round(
      concessionSeverity === "critical"
        ? config.concessionCriticalPct
        : config.concessionWarningPct,
      3
    ),
    metadata: {
      incomingYtdM3: round(incomingYtd, 3),
      annualConcessionM3: round(config.annualConcessionM3, 3)
    }
  });

  return listWaterFlowAlerts(tenantId, "open");
}

dataRoutes.use(requireAuth);

dataRoutes.use((req, res, next) => {
  if (setpointPaths.has(req.path)) {
    requireSetpointsFeature(req, res, next);
    return;
  }

  if (req.path.startsWith("/readings/")) {
    requireReadingsFeature(req, res, next);
    return;
  }

  requireCoreDataFeature(req, res, next);
});

dataRoutes.use((req, res, next) => {
  if (!env.noPostgresMode) {
    next();
    return;
  }

  if (req.method === "GET" && req.path === "/sites") {
    res.json(getDemoSites());
    return;
  }

  if (req.method === "GET" && req.path === "/ponds") {
    res.json(getDemoPonds());
    return;
  }

  if (req.method === "GET" && req.path === "/sensors") {
    const pondId = req.query.pondId ? Number(req.query.pondId) : null;
    res.json(getDemoSensors({ pondId }));
    return;
  }

  if (req.method === "GET" && req.path === "/sensors/health") {
    const requestedWindowHours = Number(req.query.windowHours || 24);
    const requestedStaleMinutes = Number(req.query.staleMinutes || 35);
    const windowHours = Number.isFinite(requestedWindowHours)
      ? Math.max(4, Math.min(168, Math.round(requestedWindowHours)))
      : 24;
    const staleMinutes = Number.isFinite(requestedStaleMinutes)
      ? Math.max(5, Math.min(240, Math.round(requestedStaleMinutes)))
      : 35;

    res.json(
      getDemoSensorHealthOverview({
        windowHours,
        staleMinutes
      })
    );
    return;
  }

  if (req.method === "GET" && req.path === "/readings/latest") {
    const requestedLimit = Number(req.query.limit || 24);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(200, requestedLimit))
      : 24;

    res.json(getDemoLatestReadings(limit));
    return;
  }

  if (req.method === "GET" && req.path === "/readings/history") {
    const sensorId = Number(req.query.sensorId);

    if (!sensorId) {
      next(new HttpError(400, "sensorId query param is required"));
      return;
    }

    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 24 * 3600 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      next(new HttpError(400, "Invalid from/to date format"));
      return;
    }

    const durationMs = to.getTime() - from.getTime();
    const requestedBucket = String(req.query.bucket || "auto").toLowerCase();
    const bucket =
      requestedBucket === "hour" || requestedBucket === "day"
        ? requestedBucket
        : durationMs > 30 * 24 * 3600 * 1000
          ? "day"
          : "hour";

    const history = getDemoHistory({
      sensorId,
      from,
      to,
      bucket
    });

    if (!history) {
      next(new HttpError(404, "Sensor not found"));
      return;
    }

    res.json(history);
    return;
  }

  if (req.method === "GET" && req.path === "/water-flow/config") {
    res.json(getDemoWaterFlowConfig());
    return;
  }

  if (req.method === "PUT" && req.path === "/water-flow/config") {
    const parsed = updateWaterFlowConfigSchema.safeParse(req.body);

    if (!parsed.success) {
      next(new HttpError(400, "Invalid water flow config payload"));
      return;
    }

    res.json(updateDemoWaterFlowConfig(parsed.data));
    return;
  }

  if (req.method === "GET" && req.path === "/water-flow/overview") {
    const requestedHours = Number(req.query.hours || 72);
    const requestedYear = Number(req.query.year || new Date().getFullYear());

    const hours = flowHourWindows.includes(requestedHours) ? requestedHours : 72;
    const year = Number.isFinite(requestedYear) ? Math.trunc(requestedYear) : new Date().getFullYear();

    res.json(getDemoWaterFlowOverview({ hours, year }));
    return;
  }

  if (req.method === "POST" && req.path === "/water-flow/readings") {
    const parsed = createWaterFlowReadingSchema.safeParse(req.body);

    if (!parsed.success) {
      next(new HttpError(400, "Invalid water flow reading payload"));
      return;
    }

    res.status(201).json(createDemoWaterFlowReading(parsed.data));
    return;
  }

  if (req.method === "GET" && req.path === "/water-flow/alerts") {
    const status = String(req.query.status || "open").toLowerCase();
    res.json(listDemoWaterFlowAlerts(status));
    return;
  }

  const resolveFlowAlertMatch =
    req.method === "PATCH" ? req.path.match(/^\/water-flow\/alerts\/(\d+)\/resolve$/) : null;

  if (resolveFlowAlertMatch) {
    const resolved = resolveDemoWaterFlowAlert(resolveFlowAlertMatch[1]);

    if (!resolved) {
      next(new HttpError(404, "Water flow alert not found"));
      return;
    }

    res.json(resolved);
    return;
  }

  if (
    req.method === "GET" &&
    [
      "/oxygen/setpoints",
      "/oxygen/color-setpoints",
      "/temperature/color-setpoints",
      "/alerts/phone-setpoints",
      "/alerts/sms-setpoints"
    ].includes(req.path)
  ) {
    res.json([]);
    return;
  }

  next();
});

dataRoutes.get(
  "/sites",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT id, code, name, region, status, created_at
        FROM sites
        WHERE tenant_id = $1
        ORDER BY name ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/ponds",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          p.id,
          p.site_id,
          s.code AS site_code,
          s.name AS site_name,
          s.region AS site_region,
          p.name,
          p.species,
          p.status,
          p.volume_m3,
          p.created_at
        FROM ponds p
        LEFT JOIN sites s ON s.id = p.site_id
        WHERE p.tenant_id = $1
        ORDER BY p.name ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/oxygen/setpoints",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          slot_code,
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 'Zona 1'
            WHEN LEFT(slot_code, 1) = 'D' THEN 'Zona 2'
            WHEN LEFT(slot_code, 1) = 'E' THEN 'Zona 3'
            WHEN LEFT(slot_code, 1) = 'F' THEN 'Zona 4'
            ELSE 'Sin zona'
          END AS zone_name,
          activation_enabled,
          setpoint_on_pct,
          setpoint_off_pct,
          updated_at
        FROM oxygen_valve_setpoints
        WHERE tenant_id = $1
        ORDER BY
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 1
            WHEN LEFT(slot_code, 1) = 'D' THEN 2
            WHEN LEFT(slot_code, 1) = 'E' THEN 3
            WHEN LEFT(slot_code, 1) = 'F' THEN 4
            ELSE 5
          END,
          COALESCE(NULLIF(SUBSTRING(slot_code FROM '([0-9]+)'), '')::int, 0) ASC,
          slot_code ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/oxygen/color-setpoints",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          slot_code,
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 'Zona 1'
            WHEN LEFT(slot_code, 1) = 'D' THEN 'Zona 2'
            WHEN LEFT(slot_code, 1) = 'E' THEN 'Zona 3'
            WHEN LEFT(slot_code, 1) = 'F' THEN 'Zona 4'
            ELSE 'Sin zona'
          END AS zone_name,
          critical_value,
          low_value,
          high_value,
          updated_at
        FROM oxygen_color_setpoints
        WHERE tenant_id = $1
        ORDER BY
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 1
            WHEN LEFT(slot_code, 1) = 'D' THEN 2
            WHEN LEFT(slot_code, 1) = 'E' THEN 3
            WHEN LEFT(slot_code, 1) = 'F' THEN 4
            ELSE 5
          END,
          COALESCE(NULLIF(SUBSTRING(slot_code FROM '([0-9]+)'), '')::int, 0) ASC,
          slot_code ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/temperature/color-setpoints",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          slot_code,
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 'Zona 1'
            WHEN LEFT(slot_code, 1) = 'D' THEN 'Zona 2'
            WHEN LEFT(slot_code, 1) = 'E' THEN 'Zona 3'
            WHEN LEFT(slot_code, 1) = 'F' THEN 'Zona 4'
            ELSE 'Sin zona'
          END AS zone_name,
          critical_value,
          high_value,
          low_value,
          updated_at
        FROM temperature_color_setpoints
        WHERE tenant_id = $1
        ORDER BY
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 1
            WHEN LEFT(slot_code, 1) = 'D' THEN 2
            WHEN LEFT(slot_code, 1) = 'E' THEN 3
            WHEN LEFT(slot_code, 1) = 'F' THEN 4
            ELSE 5
          END,
          COALESCE(NULLIF(SUBSTRING(slot_code FROM '([0-9]+)'), '')::int, 0) ASC,
          slot_code ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/alerts/phone-setpoints",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          slot_code,
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 'Zona 1'
            WHEN LEFT(slot_code, 1) = 'D' THEN 'Zona 2'
            WHEN LEFT(slot_code, 1) = 'E' THEN 'Zona 3'
            WHEN LEFT(slot_code, 1) = 'F' THEN 'Zona 4'
            ELSE 'Sin zona'
          END AS zone_name,
          enabled,
          oxygen_min_pct,
          oxygen_max_pct,
          temperature_max_c,
          updated_at
        FROM phone_alert_setpoints
        WHERE tenant_id = $1
        ORDER BY
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 1
            WHEN LEFT(slot_code, 1) = 'D' THEN 2
            WHEN LEFT(slot_code, 1) = 'E' THEN 3
            WHEN LEFT(slot_code, 1) = 'F' THEN 4
            ELSE 5
          END,
          COALESCE(NULLIF(SUBSTRING(slot_code FROM '([0-9]+)'), '')::int, 0) ASC,
          slot_code ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/alerts/sms-setpoints",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          slot_code,
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 'Zona 1'
            WHEN LEFT(slot_code, 1) = 'D' THEN 'Zona 2'
            WHEN LEFT(slot_code, 1) = 'E' THEN 'Zona 3'
            WHEN LEFT(slot_code, 1) = 'F' THEN 'Zona 4'
            ELSE 'Sin zona'
          END AS zone_name,
          enabled,
          oxygen_min_pct,
          oxygen_max_pct,
          temperature_max_c,
          updated_at
        FROM sms_alert_setpoints
        WHERE tenant_id = $1
        ORDER BY
          CASE
            WHEN LEFT(slot_code, 1) IN ('A', 'B', 'C') THEN 1
            WHEN LEFT(slot_code, 1) = 'D' THEN 2
            WHEN LEFT(slot_code, 1) = 'E' THEN 3
            WHEN LEFT(slot_code, 1) = 'F' THEN 4
            ELSE 5
          END,
          COALESCE(NULLIF(SUBSTRING(slot_code FROM '([0-9]+)'), '')::int, 0) ASC,
          slot_code ASC
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

dataRoutes.post(
  "/ponds",
  validate(createPondSchema),
  asyncHandler(async (req, res) => {
    const { siteId, name, species, volumeM3 } = req.body;

    if (siteId) {
      const siteResult = await query(
        `
          SELECT id
          FROM sites
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1
        `,
        [siteId, req.user.tenantId]
      );

      if (siteResult.rowCount === 0) {
        throw new HttpError(404, "Site not found");
      }
    }

    const result = await query(
      `
        INSERT INTO ponds (tenant_id, site_id, name, species, volume_m3)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, site_id, name, species, status, volume_m3, created_at
      `,
      [req.user.tenantId, siteId ?? null, name, species, volumeM3 ?? null]
    );

    res.status(201).json(result.rows[0]);
  })
);

dataRoutes.get(
  "/sensors",
  asyncHandler(async (req, res) => {
    const pondId = req.query.pondId ? Number(req.query.pondId) : null;

    const params = [req.user.tenantId];
    let whereClause = "WHERE s.tenant_id = $1";

    if (pondId) {
      params.push(pondId);
      whereClause += " AND s.pond_id = $2";
    }

    const result = await query(
      `
        SELECT
          s.id,
          s.pond_id,
          p.name AS pond_name,
          s.name,
          s.type,
          s.unit,
          s.enabled,
          s.created_at
        FROM sensors s
        JOIN ponds p ON p.id = s.pond_id
        ${whereClause}
        ORDER BY p.name ASC, s.name ASC
      `,
      params
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/sensors/health",
  asyncHandler(async (req, res) => {
    const requestedWindowHours = Number(req.query.windowHours || 24);
    const requestedStaleMinutes = Number(req.query.staleMinutes || 35);
    const windowHours = Number.isFinite(requestedWindowHours)
      ? Math.max(4, Math.min(168, Math.round(requestedWindowHours)))
      : 24;
    const staleMinutes = Number.isFinite(requestedStaleMinutes)
      ? Math.max(5, Math.min(240, Math.round(requestedStaleMinutes)))
      : 35;

    const result = await query(
      `
        SELECT
          s.id AS sensor_id,
          s.pond_id,
          p.name AS pond_name,
          s.name AS sensor_name,
          s.type AS sensor_type,
          s.unit,
          s.enabled,
          latest.value AS current_value,
          latest.recorded_at AS last_recorded_at,
          latest.quality AS last_quality,
          prev.value AS prev_value,
          prev.recorded_at AS prev_recorded_at,
          stats.sample_count,
          stats.window_min,
          stats.window_max,
          stats.window_avg,
          stats.window_stddev
        FROM sensors s
        JOIN ponds p ON p.id = s.pond_id
        LEFT JOIN LATERAL (
          SELECT m.value, m.recorded_at, m.quality
          FROM measurements m
          WHERE m.tenant_id = $1
            AND m.sensor_id = s.id
          ORDER BY m.recorded_at DESC
          LIMIT 1
        ) latest ON TRUE
        LEFT JOIN LATERAL (
          SELECT m.value, m.recorded_at
          FROM measurements m
          WHERE m.tenant_id = $1
            AND m.sensor_id = s.id
          ORDER BY m.recorded_at DESC
          OFFSET 1
          LIMIT 1
        ) prev ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS sample_count,
            MIN(m.value) AS window_min,
            MAX(m.value) AS window_max,
            ROUND(AVG(m.value)::numeric, 3) AS window_avg,
            ROUND(STDDEV_SAMP(m.value)::numeric, 3) AS window_stddev
          FROM measurements m
          WHERE m.tenant_id = $1
            AND m.sensor_id = s.id
            AND m.recorded_at >= NOW() - ($2::int * INTERVAL '1 hour')
        ) stats ON TRUE
        WHERE s.tenant_id = $1
        ORDER BY p.name ASC, s.name ASC
      `,
      [req.user.tenantId, windowHours]
    );

    const sensors = result.rows.map((row) =>
      evaluateSensorHealthRow(row, {
        staleMinutes
      })
    );
    const summary = summarizeSensorHealth(sensors);

    res.json({
      generatedAt: new Date().toISOString(),
      windowHours,
      staleMinutes,
      summary: {
        totalSensors: summary.totalSensors,
        activeSensors: summary.activeSensors,
        disabledSensors: summary.disabledSensors,
        okSensors: summary.okSensors,
        warningSensors: summary.warningSensors,
        criticalSensors: summary.criticalSensors,
        overallScore: summary.overallScore,
        incidentTotal: summary.incidentTotal,
        incidentsByCode: summary.incidentsByCode
      },
      byType: summary.byType,
      topIncidents: summary.topIncidents,
      sensors
    });
  })
);

dataRoutes.post(
  "/sensors",
  validate(createSensorSchema),
  asyncHandler(async (req, res) => {
    const { pondId, name, type, unit } = req.body;

    const pondResult = await query(
      `
        SELECT id
        FROM ponds
        WHERE id = $1 AND tenant_id = $2
        LIMIT 1
      `,
      [pondId, req.user.tenantId]
    );

    if (pondResult.rowCount === 0) {
      throw new HttpError(404, "Pond not found");
    }

    const result = await query(
      `
        INSERT INTO sensors (tenant_id, pond_id, name, type, unit)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, pond_id, name, type, unit, enabled, created_at
      `,
      [req.user.tenantId, pondId, name, type, unit]
    );

    res.status(201).json(result.rows[0]);
  })
);

dataRoutes.get(
  "/readings/latest",
  asyncHandler(async (req, res) => {
    const requestedLimit = Number(req.query.limit || 24);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(200, requestedLimit))
      : 24;

    const result = await query(
      `
        SELECT
          m.id,
          m.sensor_id,
          m.pond_id,
          m.value,
          m.quality,
          m.recorded_at,
          s.name AS sensor_name,
          s.type AS sensor_type,
          s.unit,
          p.name AS pond_name
        FROM measurements m
        JOIN sensors s ON s.id = m.sensor_id
        JOIN ponds p ON p.id = m.pond_id
        WHERE m.tenant_id = $1
        ORDER BY m.recorded_at DESC
        LIMIT $2
      `,
      [req.user.tenantId, limit]
    );

    res.json(result.rows);
  })
);

dataRoutes.get(
  "/readings/history",
  asyncHandler(async (req, res) => {
    const sensorId = Number(req.query.sensorId);

    if (!sensorId) {
      throw new HttpError(400, "sensorId query param is required");
    }

    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 24 * 3600 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new HttpError(400, "Invalid from/to date format");
    }

    const durationMs = to.getTime() - from.getTime();
    const requestedBucket = String(req.query.bucket || "auto").toLowerCase();

    const bucket =
      requestedBucket === "hour" || requestedBucket === "day"
        ? requestedBucket
        : durationMs > 30 * 24 * 3600 * 1000
          ? "day"
          : "hour";

    const sensorResult = await query(
      `
        SELECT id, name, type, unit
        FROM sensors
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1
      `,
      [sensorId, req.user.tenantId]
    );

    if (sensorResult.rowCount === 0) {
      throw new HttpError(404, "Sensor not found");
    }

    const result = await query(
      `
        SELECT
          date_trunc($4, recorded_at) AS bucket_start,
          ROUND(AVG(value)::numeric, 3) AS avg_value,
          MIN(value) AS min_value,
          MAX(value) AS max_value,
          COUNT(*)::int AS samples
        FROM measurements
        WHERE tenant_id = $1
          AND sensor_id = $2
          AND recorded_at BETWEEN $3 AND $5
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      [req.user.tenantId, sensorId, from.toISOString(), bucket, to.toISOString()]
    );

    res.json({
      sensor: sensorResult.rows[0],
      bucket,
      from,
      to,
      series: result.rows
    });
  })
);

dataRoutes.get(
  "/water-flow/config",
  asyncHandler(async (req, res) => {
    const config = await ensureWaterFlowConfig(req.user.tenantId);
    const meters = await ensureWaterFlowMeters(req.user.tenantId, config.calibrationK);
    res.json({
      ...config,
      meters
    });
  })
);

dataRoutes.put(
  "/water-flow/config",
  validate(updateWaterFlowConfigSchema),
  asyncHandler(async (req, res) => {
    const current = await ensureWaterFlowConfig(req.user.tenantId);
    await ensureWaterFlowMeters(req.user.tenantId, current.calibrationK);
    const merged = {
      ...current,
      ...req.body
    };

    if (merged.deviationCriticalPct < merged.deviationWarningPct) {
      throw new HttpError(
        400,
        "deviationCriticalPct must be greater than or equal to deviationWarningPct"
      );
    }

    if (merged.concessionCriticalPct < merged.concessionWarningPct) {
      throw new HttpError(
        400,
        "concessionCriticalPct must be greater than or equal to concessionWarningPct"
      );
    }

    if (Array.isArray(req.body.meters)) {
      for (const meterPatch of req.body.meters) {
        const updateResult = await query(
          `
            UPDATE water_flow_meters
            SET
              calibration_k = $3,
              enabled = COALESCE($4, enabled),
              updated_at = NOW()
            WHERE id = $1
              AND tenant_id = $2
            RETURNING id
          `,
          [meterPatch.id, req.user.tenantId, meterPatch.calibrationK, meterPatch.enabled ?? null]
        );

        if (updateResult.rowCount === 0) {
          throw new HttpError(404, `Water flow meter ${meterPatch.id} not found for tenant`);
        }
      }
    } else if (Number.isFinite(req.body.calibrationK)) {
      await query(
        `
          UPDATE water_flow_meters
          SET
            calibration_k = $2,
            updated_at = NOW()
          WHERE tenant_id = $1
        `,
        [req.user.tenantId, req.body.calibrationK]
      );
    }

    const meters = await ensureWaterFlowMeters(req.user.tenantId, merged.calibrationK);
    const kByChannel = resolveWaterFlowKByChannel(merged, meters);
    const effectiveCalibrationK = toNumber(kByChannel.incoming, merged.calibrationK);

    const updatedResult = await query(
      `
        UPDATE water_flow_config
        SET
          calibration_k = $2,
          annual_concession_m3 = $3,
          deviation_warning_pct = $4,
          deviation_critical_pct = $5,
          concession_warning_pct = $6,
          concession_critical_pct = $7,
          updated_at = NOW()
        WHERE tenant_id = $1
        RETURNING
          calibration_k,
          annual_concession_m3,
          deviation_warning_pct,
          deviation_critical_pct,
          concession_warning_pct,
          concession_critical_pct,
          created_at,
          updated_at
      `,
      [
        req.user.tenantId,
        effectiveCalibrationK,
        merged.annualConcessionM3,
        merged.deviationWarningPct,
        merged.deviationCriticalPct,
        merged.concessionWarningPct,
        merged.concessionCriticalPct
      ]
    );

    if (updatedResult.rowCount === 0) {
      throw new HttpError(500, "Water flow config could not be updated");
    }

    const config = {
      ...normalizeWaterFlowConfig(updatedResult.rows[0] || merged),
      meters
    };
    const alerts = await evaluateWaterFlowAlerts(req.user.tenantId, config, kByChannel);

    res.json({
      config,
      alerts
    });
  })
);

dataRoutes.get(
  "/water-flow/overview",
  asyncHandler(async (req, res) => {
    const requestedHours = Number(req.query.hours || 72);
    const requestedYear = Number(req.query.year || new Date().getFullYear());

    const hours = flowHourWindows.includes(requestedHours) ? requestedHours : 72;
    const year = Number.isFinite(requestedYear) ? Math.trunc(requestedYear) : new Date().getFullYear();

    const config = await ensureWaterFlowConfig(req.user.tenantId);
    const meters = await ensureWaterFlowMeters(req.user.tenantId, config.calibrationK);
    const kByChannel = resolveWaterFlowKByChannel(config, meters);
    const [seriesResult, yearlyRows] = await Promise.all([
      getWaterFlowSeries(req.user.tenantId, hours, kByChannel),
      getWaterFlowYearlyRows(req.user.tenantId, year, config, kByChannel)
    ]);
    const alerts = await evaluateWaterFlowAlerts(req.user.tenantId, config, kByChannel);

    res.json({
      generatedAt: new Date().toISOString(),
      year,
      windowHours: hours,
      config: {
        ...config,
        meters
      },
      flags: {
        syntheticData: seriesResult.syntheticData
      },
      hourlySeries: seriesResult.series,
      yearlyRows,
      alerts
    });
  })
);

dataRoutes.post(
  "/water-flow/readings",
  validate(createWaterFlowReadingSchema),
  asyncHandler(async (req, res) => {
    const config = await ensureWaterFlowConfig(req.user.tenantId);
    const meters = await ensureWaterFlowMeters(req.user.tenantId, config.calibrationK);
    const kByChannel = resolveWaterFlowKByChannel(config, meters);

    const payload = {
      recordedAt: req.body.recordedAt ? new Date(req.body.recordedAt) : new Date(),
      incomingMeasuredM3h: req.body.incomingMeasuredM3h,
      outgoingMeasuredM3h: req.body.outgoingMeasuredM3h,
      recirculatedM3h: req.body.recirculatedM3h,
      dischargeQualityPct: req.body.dischargeQualityPct,
      notes: req.body.notes
    };

    if (Number.isNaN(payload.recordedAt.getTime())) {
      throw new HttpError(400, "Invalid recordedAt datetime format");
    }

    const inserted = await query(
      `
        INSERT INTO water_flow_readings (
          tenant_id,
          recorded_at,
          incoming_measured_m3h,
          outgoing_measured_m3h,
          recirculated_m3h,
          discharge_quality_pct,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id,
          recorded_at,
          incoming_measured_m3h,
          outgoing_measured_m3h,
          recirculated_m3h,
          discharge_quality_pct,
          notes,
          created_at
      `,
      [
        req.user.tenantId,
        payload.recordedAt.toISOString(),
        payload.incomingMeasuredM3h,
        payload.outgoingMeasuredM3h,
        payload.recirculatedM3h ?? null,
        payload.dischargeQualityPct ?? null,
        payload.notes ?? null
      ]
    );

    const row = inserted.rows[0];
    const incomingCalibrated = toNumber(row.incoming_measured_m3h, 0) * toNumber(kByChannel.incoming, 1);
    const outgoingCalibrated = toNumber(row.outgoing_measured_m3h, 0) * toNumber(kByChannel.outgoing, 1);
    const alerts = await evaluateWaterFlowAlerts(req.user.tenantId, config, kByChannel);

    res.status(201).json({
      reading: {
        id: row.id,
        recordedAt: row.recorded_at,
        incomingMeasuredM3h: toNumber(row.incoming_measured_m3h, 0),
        outgoingMeasuredM3h: toNumber(row.outgoing_measured_m3h, 0),
        recirculatedM3h: row.recirculated_m3h === null ? null : toNumber(row.recirculated_m3h, 0),
        dischargeQualityPct:
          row.discharge_quality_pct === null ? null : toNumber(row.discharge_quality_pct, 0),
        incomingCalibrated: round(incomingCalibrated),
        outgoingCalibrated: round(outgoingCalibrated),
        netPlantBalance: round(incomingCalibrated - outgoingCalibrated),
        notes: row.notes,
        createdAt: row.created_at
      },
      alerts
    });
  })
);

dataRoutes.get(
  "/water-flow/alerts",
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || "open").toLowerCase();
    const config = await ensureWaterFlowConfig(req.user.tenantId);
    const meters = await ensureWaterFlowMeters(req.user.tenantId, config.calibrationK);
    const kByChannel = resolveWaterFlowKByChannel(config, meters);
    await evaluateWaterFlowAlerts(req.user.tenantId, config, kByChannel);
    const alerts = await listWaterFlowAlerts(req.user.tenantId, status);

    res.json(alerts);
  })
);

dataRoutes.patch(
  "/water-flow/alerts/:alertId/resolve",
  asyncHandler(async (req, res) => {
    const alertId = Number(req.params.alertId);

    if (!Number.isInteger(alertId) || alertId <= 0) {
      throw new HttpError(400, "Invalid alert id");
    }

    const result = await query(
      `
        UPDATE water_flow_alerts
        SET
          status = 'resolved',
          updated_at = NOW(),
          resolved_at = NOW()
        WHERE id = $1
          AND tenant_id = $2
          AND status = 'open'
        RETURNING
          id,
          alert_type,
          severity,
          status,
          title,
          description,
          metric_value,
          threshold_value,
          metadata,
          created_at,
          updated_at,
          resolved_at
      `,
      [alertId, req.user.tenantId]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, "Water flow alert not found");
    }

    res.json(mapWaterFlowAlertRow(result.rows[0]));
  })
);
