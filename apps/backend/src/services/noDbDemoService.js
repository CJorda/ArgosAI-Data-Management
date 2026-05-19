import { env } from "../config/env.js";
import { resolveTenantFeaturesFromConfig } from "../config/tenantFeatures.js";
import { ALL_FEATURE_KEYS, isKnownFeature } from "../security/featureCatalog.js";
import { buildAlertProtocolTemplate, normalizeAlertProtocolSteps } from "../utils/alertProtocol.js";

const demoTenant = {
  id: 1,
  code: env.demoTenantCode,
  name: env.demoTenantName
};

const demoUser = {
  id: 1,
  tenantId: demoTenant.id,
  fullName: env.demoAdminName,
  email: env.demoAdminEmail,
  role: "admin"
};

const demoEnabledFeatures = (() => {
  const configuredFeatures = resolveTenantFeaturesFromConfig(demoTenant.code);

  if (Array.isArray(configuredFeatures)) {
    return configuredFeatures;
  }

  const raw = String(env.demoFeatures || "*").trim();

  if (!raw || raw === "*" || raw.toLowerCase() === "all") {
    return [...ALL_FEATURE_KEYS];
  }

  const parsed = Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && isKnownFeature(item))
    )
  );

  return parsed.length > 0 ? parsed : [...ALL_FEATURE_KEYS];
})();

const demoSites = [
  {
    id: 1,
    code: "NORTE",
    name: "Centro Norte",
    region: "Cantabrico",
    status: "active",
    created_at: "2026-01-10T08:00:00.000Z"
  },
  {
    id: 2,
    code: "SUR",
    name: "Centro Sur",
    region: "Andalucia",
    status: "active",
    created_at: "2026-01-10T08:00:00.000Z"
  }
];

const demoPonds = [
  {
    id: 101,
    site_id: 1,
    site_code: "NORTE",
    site_name: "Centro Norte",
    site_region: "Cantabrico",
    name: "F1",
    external_code: "F1",
    species: "dorada",
    status: "active",
    volume_m3: 920,
    created_at: "2026-01-10T08:30:00.000Z"
  },
  {
    id: 102,
    site_id: 1,
    site_code: "NORTE",
    site_name: "Centro Norte",
    site_region: "Cantabrico",
    name: "F2",
    external_code: "F2",
    species: "lubina",
    status: "active",
    volume_m3: 950,
    created_at: "2026-01-10T08:32:00.000Z"
  },
  {
    id: 201,
    site_id: 2,
    site_code: "SUR",
    site_name: "Centro Sur",
    site_region: "Andalucia",
    name: "A1",
    external_code: "A1",
    species: "trucha",
    status: "active",
    volume_m3: 680,
    created_at: "2026-01-10T08:35:00.000Z"
  }
];

let demoPondIdSequence = demoPonds.reduce(
  (maxValue, item) => Math.max(maxValue, Number(item.id) || 0),
  0
);
let demoScadaReadingSequence = 1;
const demoScadaIngestLog = [];
let demoScadaUnmappedSequence = 1;
const demoScadaUnmappedSignals = [];

const demoSensors = [
  {
    id: 1001,
    pond_id: 101,
    pond_name: "F1",
    name: "OX F1",
    type: "oxygen",
    unit: "mg/L",
    enabled: true,
    created_at: "2026-01-10T09:00:00.000Z"
  },
  {
    id: 1002,
    pond_id: 101,
    pond_name: "F1",
    name: "TEMP F1",
    type: "temperature",
    unit: "C",
    enabled: true,
    created_at: "2026-01-10T09:00:00.000Z"
  },
  {
    id: 1003,
    pond_id: 102,
    pond_name: "F2",
    name: "OX F2",
    type: "oxygen",
    unit: "mg/L",
    enabled: true,
    created_at: "2026-01-10T09:00:00.000Z"
  },
  {
    id: 1004,
    pond_id: 201,
    pond_name: "A1",
    name: "PH A1",
    type: "ph",
    unit: "pH",
    enabled: true,
    created_at: "2026-01-10T09:00:00.000Z"
  }
];

const metricRanges = {
  oxygen: { min: 5.5, max: 9.2 },
  temperature: { min: 13.5, max: 21.5 },
  salinity: { min: 29, max: 37 },
  ph: { min: 7.1, max: 8.1 },
  turbidity: { min: 1, max: 15 }
};

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

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getSensorById(sensorId) {
  return demoSensors.find((sensor) => sensor.id === sensorId) || null;
}

function readingValueForSensor(sensor, timestampMs) {
  const range = metricRanges[sensor.type] || { min: 0, max: 100 };
  const amplitude = (range.max - range.min) * 0.4;
  const baseline = range.min + (range.max - range.min) / 2;
  const wave = Math.sin(timestampMs / 3_600_000 + sensor.id / 15) * amplitude;
  const noise = (Math.random() - 0.5) * (range.max - range.min) * 0.08;
  return round(clamp(baseline + wave + noise, range.min, range.max), 3);
}

let readingIdSequence = 20_000;
const demoTraceabilityCertificates = new Map();

function buildReadingRow(sensor, recordedAtIso) {
  const recordedAt = new Date(recordedAtIso).getTime();
  const value = readingValueForSensor(sensor, recordedAt);

  return {
    id: readingIdSequence += 1,
    sensor_id: sensor.id,
    pond_id: sensor.pond_id,
    value,
    quality: "good",
    recorded_at: recordedAtIso,
    sensor_name: sensor.name,
    sensor_type: sensor.type,
    unit: sensor.unit,
    pond_name: sensor.pond_name
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mapDemoLabWaterSample(sample) {
  const pond = demoPonds.find((item) => Number(item.id) === Number(sample.pond_id));

  return {
    id: sample.id,
    pond_id: sample.pond_id,
    pond_name: pond?.name || null,
    sampled_at: sample.sampled_at,
    source_label: sample.source_label,
    technician_name: sample.technician_name,
    analysis_type: sample.analysis_type,
    oxygen_mg_l: sample.oxygen_mg_l,
    temperature_c: sample.temperature_c,
    ph: sample.ph,
    salinity_ppt: sample.salinity_ppt,
    turbidity_ntu: sample.turbidity_ntu,
    ammonia_mg_l: sample.ammonia_mg_l,
    nitrite_mg_l: sample.nitrite_mg_l,
    nitrate_mg_l: sample.nitrate_mg_l,
    alkalinity_mg_l: sample.alkalinity_mg_l,
    hardness_mg_l: sample.hardness_mg_l,
    conductivity_us_cm: sample.conductivity_us_cm,
    notes: sample.notes,
    pdf_file_name: sample.pdf_file_name,
    pdf_mime_type: sample.pdf_mime_type,
    has_pdf: Boolean(sample.pdf_base64),
    pdf_uploaded_at: sample.pdf_uploaded_at,
    created_by: sample.created_by,
    created_by_name: demoUser.fullName,
    created_at: sample.created_at
  };
}

let alertIdSequence = 900;

function buildAlert({ pondId, sensorId, severity, message, status = "open", createdAt, currentValue }) {
  const sensor = getSensorById(sensorId);
  const pond = demoPonds.find((item) => item.id === pondId) || null;
  const timestamp = createdAt || new Date().toISOString();

  return {
    id: ++alertIdSequence,
    pond_id: pondId,
    sensor_id: sensorId,
    rule_id: null,
    severity,
    status,
    protocol_status: status === "open" ? "pending" : "resolved",
    protocol_owner: status === "open" ? null : demoUser.id,
    protocol_started_at: status === "open" ? null : timestamp,
    protocol_updated_at: status === "open" ? null : timestamp,
    protocol_steps: buildAlertProtocolTemplate(sensor?.type || "oxygen", severity),
    protocol_notes: null,
    escalation_deadline: null,
    message,
    current_value: currentValue,
    created_at: timestamp,
    resolved_at: status === "open" ? null : timestamp,
    resolved_by: status === "open" ? null : demoUser.id,
    pond_name: pond?.name || "Desconocida",
    sensor_name: sensor?.name || "Sensor",
    sensor_type: sensor?.type || "oxygen",
    protocol_owner_name: status === "open" ? null : demoUser.fullName,
    resolved_by_name: status === "open" ? null : demoUser.fullName
  };
}

const demoAlerts = [
  buildAlert({
    pondId: 101,
    sensorId: 1001,
    severity: "high",
    message: "Oxygen below minimum threshold",
    status: "open",
    createdAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    currentValue: 5.7
  }),
  buildAlert({
    pondId: 201,
    sensorId: 1004,
    severity: "medium",
    message: "pH approaching maximum threshold",
    status: "open",
    createdAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    currentValue: 8.03
  }),
  buildAlert({
    pondId: 102,
    sensorId: 1003,
    severity: "low",
    message: "Oxygen stabilized after corrective action",
    status: "resolved",
    createdAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    currentValue: 6.5
  })
];

let ruleIdSequence = 100;
const demoRules = [];

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

let demoWaterFlowConfig = {
  calibrationK: 1,
  annualConcessionM3: 8_500_000,
  deviationWarningPct: 8,
  deviationCriticalPct: 14,
  concessionWarningPct: 85,
  concessionCriticalPct: 100,
  updatedAt: new Date().toISOString()
};

const demoWaterFlowMeters = [
  {
    id: 1,
    meterCode: "WF-IN-01",
    meterName: "Caudalimetro entrante",
    channelKey: "incoming",
    calibrationK: 1,
    enabled: true,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 2,
    meterCode: "WF-OUT-01",
    meterName: "Caudalimetro saliente",
    channelKey: "outgoing",
    calibrationK: 1,
    enabled: true,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 3,
    meterCode: "WF-REC-01",
    meterName: "Caudalimetro recirculacion",
    channelKey: "recirculated",
    calibrationK: 1,
    enabled: true,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

let demoWaterFlowReadingIdSequence = 30_000;
let demoWaterFlowAlertIdSequence = 4_000;

const demoLabWaterSamples = [
  {
    id: 1,
    pond_id: 101,
    sampled_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    source_label: "Canal de entrada norte",
    technician_name: "Equipo laboratorio",
    analysis_type: "laboratorio",
    oxygen_mg_l: 7.3,
    temperature_c: 16.8,
    ph: 7.64,
    salinity_ppt: 33.2,
    turbidity_ntu: 4.5,
    ammonia_mg_l: 0.16,
    nitrite_mg_l: 0.04,
    nitrate_mg_l: 7.1,
    alkalinity_mg_l: 115,
    hardness_mg_l: 202,
    conductivity_us_cm: 47890,
    notes: "Muestra manual para contraste con sensores en linea.",
    pdf_file_name: null,
    pdf_mime_type: null,
    pdf_uploaded_at: null,
    pdf_base64: null,
    created_by: demoUser.id,
    created_at: new Date(Date.now() - 71 * 3600 * 1000).toISOString()
  },
  {
    id: 2,
    pond_id: 102,
    sampled_at: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
    source_label: "Piscina F2 - toma lateral",
    technician_name: "Control calidad",
    analysis_type: "laboratorio",
    oxygen_mg_l: 6.9,
    temperature_c: 17.3,
    ph: 7.48,
    salinity_ppt: 32.7,
    turbidity_ntu: 5.1,
    ammonia_mg_l: 0.19,
    nitrite_mg_l: 0.06,
    nitrate_mg_l: 8.4,
    alkalinity_mg_l: 121,
    hardness_mg_l: 214,
    conductivity_us_cm: 48620,
    notes: "Lectura previa a ajuste de aireacion.",
    pdf_file_name: null,
    pdf_mime_type: null,
    pdf_uploaded_at: null,
    pdf_base64: null,
    created_by: demoUser.id,
    created_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString()
  }
];

let demoLabWaterSampleIdSequence = demoLabWaterSamples.reduce(
  (maxValue, sample) => Math.max(maxValue, Number(sample.id) || 0),
  0
);

function getDemoMetersSnapshot() {
  return demoWaterFlowMeters.map((meter) => ({ ...meter }));
}

function syncDemoLegacyCalibrationK() {
  const incomingMeter = demoWaterFlowMeters.find((meter) => meter.channelKey === "incoming");
  demoWaterFlowConfig.calibrationK = Math.max(0, toFiniteNumber(incomingMeter?.calibrationK, 1));
}

function applyDemoMeterPatches(meters = []) {
  const nowIso = new Date().toISOString();

  for (const patch of meters) {
    const meter = demoWaterFlowMeters.find((item) => item.id === Number(patch.id));

    if (!meter) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "calibrationK")) {
      meter.calibrationK = Math.max(0, toFiniteNumber(patch.calibrationK, meter.calibrationK));
    }

    if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
      meter.enabled = Boolean(patch.enabled);
    }

    meter.updatedAt = nowIso;
  }

  syncDemoLegacyCalibrationK();
}

function getDemoFlowKByChannel(config = demoWaterFlowConfig) {
  const fallbackK = Math.max(0, toFiniteNumber(config?.calibrationK, 1));
  const kByChannel = {
    incoming: fallbackK,
    outgoing: fallbackK,
    recirculated: fallbackK
  };

  for (const meter of demoWaterFlowMeters) {
    if (!meter.enabled) {
      continue;
    }

    if (!["incoming", "outgoing", "recirculated"].includes(meter.channelKey)) {
      continue;
    }

    kByChannel[meter.channelKey] = Math.max(0, toFiniteNumber(meter.calibrationK, fallbackK));
  }

  return kByChannel;
}

function pseudoNoise(seed, index) {
  const value = Math.sin(seed * 13.173 + index * 79.217) * 43758.5453123;
  return value - Math.floor(value);
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeFlowConfigDraft(config) {
  const draft = {
    calibrationK: Math.max(0, toFiniteNumber(config.calibrationK, 1)),
    annualConcessionM3: clamp(toFiniteNumber(config.annualConcessionM3, 8_500_000), 10_000, 2_000_000_000),
    deviationWarningPct: clamp(toFiniteNumber(config.deviationWarningPct, 8), 1, 99),
    deviationCriticalPct: clamp(toFiniteNumber(config.deviationCriticalPct, 14), 1, 150),
    concessionWarningPct: clamp(toFiniteNumber(config.concessionWarningPct, 85), 1, 150),
    concessionCriticalPct: clamp(toFiniteNumber(config.concessionCriticalPct, 100), 1, 200),
    updatedAt: config.updatedAt || new Date().toISOString()
  };

  if (draft.deviationCriticalPct < draft.deviationWarningPct) {
    draft.deviationCriticalPct = draft.deviationWarningPct;
  }

  if (draft.concessionCriticalPct < draft.concessionWarningPct) {
    draft.concessionCriticalPct = draft.concessionWarningPct;
  }

  return draft;
}

function buildSyntheticFlowPoint(index, totalHours, kByChannel, endingAtMs) {
  const timestamp = new Date(endingAtMs - (totalHours - 1 - index) * 3600 * 1000);
  const month = timestamp.getMonth();
  const hour = timestamp.getHours() + timestamp.getMinutes() / 60;

  const incomingK = toFiniteNumber(kByChannel?.incoming, 1);
  const outgoingK = toFiniteNumber(kByChannel?.outgoing, incomingK);
  const recirculatedK = toFiniteNumber(kByChannel?.recirculated, incomingK);

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

  const recirculatedMeasured = incomingMeasured * clamp(0.24 + Math.sin(index * 0.07) * 0.05, 0.14, 0.38);
  const dischargeQualityPct = clamp(
    91 + Math.sin(index * 0.1 + 1.3) * 4 + (pseudoNoise(19.1, index) - 0.5) * 6,
    74,
    99
  );

  const incomingCalibrated = incomingMeasured * incomingK;
  const outgoingCalibrated = outgoingMeasured * outgoingK;

  return {
    id: ++demoWaterFlowReadingIdSequence,
    recorded_at: timestamp.toISOString(),
    incoming_measured_m3h: round(incomingMeasured, 3),
    outgoing_measured_m3h: round(outgoingMeasured, 3),
    recirculated_m3h: round(recirculatedMeasured, 3),
    discharge_quality_pct: round(dischargeQualityPct, 3),
    incomingCalibrated: round(incomingCalibrated, 3),
    outgoingCalibrated: round(outgoingCalibrated, 3),
    netPlantBalance: round(incomingCalibrated - outgoingCalibrated, 3),
    recirculated: round(recirculatedMeasured * recirculatedK, 3),
    dischargeQualityIndex: round(dischargeQualityPct, 3)
  };
}

function seedDemoWaterFlowReadings(hours = 360) {
  const safeHours = Math.max(24, Math.min(720, Math.trunc(hours)));
  const endingAtMs = Date.now();

  return Array.from({ length: safeHours }, (_item, index) => {
    const point = buildSyntheticFlowPoint(index, safeHours, { incoming: 1, outgoing: 1, recirculated: 1 }, endingAtMs);
    return {
      id: point.id,
      recorded_at: point.recorded_at,
      incoming_measured_m3h: point.incoming_measured_m3h,
      outgoing_measured_m3h: point.outgoing_measured_m3h,
      recirculated_m3h: point.recirculated_m3h,
      discharge_quality_pct: point.discharge_quality_pct,
      notes: null,
      created_at: point.recorded_at
    };
  });
}

const demoWaterFlowReadings = seedDemoWaterFlowReadings();
const demoWaterFlowAlerts = [];

function mapReadingToFlowPoint(reading, kByChannel) {
  const incomingMeasured = toFiniteNumber(reading.incoming_measured_m3h, 0);
  const outgoingMeasured = toFiniteNumber(reading.outgoing_measured_m3h, 0);
  const recirculatedMeasured = toFiniteNumber(
    reading.recirculated_m3h,
    incomingMeasured * clamp(0.24 + Math.sin(incomingMeasured * 0.01) * 0.06, 0.14, 0.4)
  );
  const qualityPct = clamp(toFiniteNumber(reading.discharge_quality_pct, 91), 0, 100);
  const incomingK = toFiniteNumber(kByChannel?.incoming, 1);
  const outgoingK = toFiniteNumber(kByChannel?.outgoing, incomingK);
  const recirculatedK = toFiniteNumber(kByChannel?.recirculated, incomingK);
  const incomingCalibrated = incomingMeasured * incomingK;
  const outgoingCalibrated = outgoingMeasured * outgoingK;

  return {
    timestamp: reading.recorded_at,
    incomingMeasured: round(incomingMeasured, 3),
    outgoingMeasured: round(outgoingMeasured, 3),
    incomingCalibrated: round(incomingCalibrated, 3),
    outgoingCalibrated: round(outgoingCalibrated, 3),
    netPlantBalance: round(incomingCalibrated - outgoingCalibrated, 3),
    recirculated: round(recirculatedMeasured * recirculatedK, 3),
    dischargeQualityIndex: round(qualityPct, 3)
  };
}

function buildSyntheticYearlyRows(year, kByChannel, annualConcessionM3) {
  const safeYear = Number(year) || new Date().getFullYear();
  const incomingK = Math.max(0, toFiniteNumber(kByChannel?.incoming, 1));
  const outgoingK = Math.max(0, toFiniteNumber(kByChannel?.outgoing, incomingK));
  const recirculatedK = Math.max(0, toFiniteNumber(kByChannel?.recirculated, incomingK));
  const safeConcession = Math.max(1, toFiniteNumber(annualConcessionM3, 8_500_000));
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
    const concessionUsedPct = (cumulativeIncoming / safeConcession) * 100;

    return {
      monthLabel,
      monthIndex,
      incomingM3: round(incomingM3, 3),
      outgoingM3: round(outgoingM3, 3),
      recirculatedM3: round(recirculatedM3, 3),
      cumulativeIncoming: round(cumulativeIncoming, 3),
      concessionUsedPct: round(concessionUsedPct, 3),
      concessionRemainingM3: round(safeConcession - cumulativeIncoming, 3),
      estimated: true
    };
  });
}

function buildMeasuredYearlyRows(year, kByChannel, annualConcessionM3) {
  const safeYear = Number(year) || new Date().getFullYear();
  const safeConcession = Math.max(1, toFiniteNumber(annualConcessionM3, 8_500_000));
  const incomingK = Math.max(0, toFiniteNumber(kByChannel?.incoming, 1));
  const outgoingK = Math.max(0, toFiniteNumber(kByChannel?.outgoing, incomingK));
  const recirculatedK = Math.max(0, toFiniteNumber(kByChannel?.recirculated, incomingK));
  const monthTotals = Array.from({ length: 12 }, () => ({
    incomingM3: 0,
    outgoingM3: 0,
    recirculatedM3: 0
  }));

  for (const reading of demoWaterFlowReadings) {
    const recordedAt = new Date(reading.recorded_at);

    if (recordedAt.getFullYear() !== safeYear) {
      continue;
    }

    const monthIndex = recordedAt.getMonth();
    monthTotals[monthIndex].incomingM3 += toFiniteNumber(reading.incoming_measured_m3h, 0) * incomingK;
    monthTotals[monthIndex].outgoingM3 += toFiniteNumber(reading.outgoing_measured_m3h, 0) * outgoingK;
    monthTotals[monthIndex].recirculatedM3 += toFiniteNumber(reading.recirculated_m3h, 0) * recirculatedK;
  }

  const totalIncoming = monthTotals.reduce((acc, row) => acc + row.incomingM3, 0);

  if (totalIncoming <= 0) {
    return buildSyntheticYearlyRows(safeYear, kByChannel, safeConcession);
  }

  let cumulativeIncoming = 0;

  return monthTotals.map((row, monthIndex) => {
    cumulativeIncoming += row.incomingM3;

    return {
      monthLabel: flowMonthLabels[monthIndex],
      monthIndex,
      incomingM3: round(row.incomingM3, 3),
      outgoingM3: round(row.outgoingM3, 3),
      recirculatedM3: round(row.recirculatedM3, 3),
      cumulativeIncoming: round(cumulativeIncoming, 3),
      concessionUsedPct: round((cumulativeIncoming / safeConcession) * 100, 3),
      concessionRemainingM3: round(safeConcession - cumulativeIncoming, 3),
      estimated: false
    };
  });
}

function listCurrentDemoFlowAlerts() {
  return demoWaterFlowAlerts
    .filter((item) => item.status === "open")
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function upsertDemoFlowAlert({
  alertType,
  severity,
  title,
  description,
  metricValue,
  thresholdValue,
  metadata,
  active
}) {
  const nowIso = new Date().toISOString();
  const existing = demoWaterFlowAlerts.find(
    (item) => item.alert_type === alertType && item.status === "open"
  );

  if (!active) {
    if (existing) {
      existing.status = "resolved";
      existing.updated_at = nowIso;
      existing.resolved_at = nowIso;
    }
    return;
  }

  if (existing) {
    existing.severity = severity;
    existing.title = title;
    existing.description = description;
    existing.metric_value = metricValue;
    existing.threshold_value = thresholdValue;
    existing.metadata = metadata;
    existing.updated_at = nowIso;
    return;
  }

  demoWaterFlowAlerts.unshift({
    id: ++demoWaterFlowAlertIdSequence,
    alert_type: alertType,
    severity,
    status: "open",
    title,
    description,
    metric_value: metricValue,
    threshold_value: thresholdValue,
    metadata,
    created_at: nowIso,
    updated_at: nowIso,
    resolved_at: null
  });
}

function evaluateDemoWaterFlowAlerts(config, series, kByChannel) {
  const latest = series[series.length - 1] || null;
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const incomingK = Math.max(0, toFiniteNumber(kByChannel?.incoming, config.calibrationK));
  const outgoingK = Math.max(0, toFiniteNumber(kByChannel?.outgoing, incomingK));

  const incomingYtdM3 = demoWaterFlowReadings.reduce((acc, reading) => {
    const recordedAt = new Date(reading.recorded_at);

    if (recordedAt < yearStart || recordedAt > now) {
      return acc;
    }

    return acc + toFiniteNumber(reading.incoming_measured_m3h, 0) * incomingK;
  }, 0);

  const concessionUsedPct = config.annualConcessionM3 > 0
    ? (incomingYtdM3 / config.annualConcessionM3) * 100
    : 0;

  const deviationPct = latest && latest.incomingCalibrated > 0
    ? (Math.abs(latest.incomingCalibrated - latest.outgoingCalibrated) / latest.incomingCalibrated) * 100
    : 0;

  const deviationSeverity = deviationPct >= config.deviationCriticalPct
    ? "critical"
    : deviationPct >= config.deviationWarningPct
      ? "warning"
      : null;

  upsertDemoFlowAlert({
    alertType: "flow_deviation",
    severity: deviationSeverity || "warning",
    title: "Desviacion de caudal entrante/saliente",
    description: `Desviacion actual ${round(deviationPct, 2)}% con K entrante=${round(incomingK, 3)} y K saliente=${round(outgoingK, 3)}.`,
    metricValue: round(deviationPct, 3),
    thresholdValue: round(
      deviationSeverity === "critical" ? config.deviationCriticalPct : config.deviationWarningPct,
      3
    ),
    metadata: {
      incomingCalibrated: latest ? round(latest.incomingCalibrated, 3) : null,
      outgoingCalibrated: latest ? round(latest.outgoingCalibrated, 3) : null
    },
    active: Boolean(deviationSeverity)
  });

  const concessionSeverity = concessionUsedPct >= config.concessionCriticalPct
    ? "critical"
    : concessionUsedPct >= config.concessionWarningPct
      ? "warning"
      : null;

  upsertDemoFlowAlert({
    alertType: "concession_overuse",
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
      incomingYtdM3: round(incomingYtdM3, 3),
      annualConcessionM3: round(config.annualConcessionM3, 3)
    },
    active: Boolean(concessionSeverity)
  });
}

function getDemoWaterFlowOverviewInternal({ hours = 72, year = new Date().getFullYear() } = {}) {
  const allowedWindow = flowHourWindows.includes(Number(hours)) ? Number(hours) : 72;
  const kByChannel = getDemoFlowKByChannel(demoWaterFlowConfig);
  const nowMs = Date.now();
  const fromMs = nowMs - (allowedWindow - 1) * 3600 * 1000;
  const readings = demoWaterFlowReadings
    .filter((item) => new Date(item.recorded_at).getTime() >= fromMs)
    .sort((left, right) => new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime());

  const syntheticData = readings.length === 0;

  const hourlySeries = syntheticData
    ? Array.from({ length: allowedWindow }, (_item, index) =>
        buildSyntheticFlowPoint(index, allowedWindow, kByChannel, nowMs)
      ).map((point) => ({
        timestamp: point.recorded_at,
        incomingMeasured: point.incoming_measured_m3h,
        outgoingMeasured: point.outgoing_measured_m3h,
        incomingCalibrated: point.incomingCalibrated,
        outgoingCalibrated: point.outgoingCalibrated,
        netPlantBalance: point.netPlantBalance,
        recirculated: point.recirculated,
        dischargeQualityIndex: point.dischargeQualityIndex
      }))
    : readings.map((reading) => mapReadingToFlowPoint(reading, kByChannel));

  evaluateDemoWaterFlowAlerts(demoWaterFlowConfig, hourlySeries, kByChannel);

  return {
    generatedAt: new Date().toISOString(),
    year: Number(year) || new Date().getFullYear(),
    windowHours: allowedWindow,
    config: {
      ...demoWaterFlowConfig,
      meters: getDemoMetersSnapshot()
    },
    flags: {
      syntheticData
    },
    hourlySeries,
    yearlyRows: buildMeasuredYearlyRows(
      Number(year) || new Date().getFullYear(),
      kByChannel,
      demoWaterFlowConfig.annualConcessionM3
    ),
    alerts: listCurrentDemoFlowAlerts()
  };
}

function scoreToLevel(score) {
  if (score >= 78) {
    return "critical";
  }

  if (score >= 58) {
    return "high";
  }

  if (score >= 35) {
    return "medium";
  }

  return "low";
}

export function isDemoLoginValid({ tenantCode, email, password }) {
  return (
    String(tenantCode || "").trim().toLowerCase() === demoTenant.code.toLowerCase() &&
    String(email || "").trim().toLowerCase() === demoUser.email.toLowerCase() &&
    String(password || "") === env.demoAdminPassword
  );
}

export function getDemoUserIdentity() {
  return {
    id: demoUser.id,
    tenantId: demoUser.tenantId,
    fullName: demoUser.fullName,
    email: demoUser.email,
    role: demoUser.role,
    features: [...demoEnabledFeatures]
  };
}

export function getDemoUserResponse() {
  return {
    ...getDemoUserIdentity(),
    tenant: {
      code: demoTenant.code,
      name: demoTenant.name
    }
  };
}

export function getDemoEnabledFeatures() {
  return [...demoEnabledFeatures];
}

export function getDemoSummary() {
  const openAlerts = demoAlerts.filter((item) => item.status === "open").length;
  const resolvedAlerts = demoAlerts.filter((item) => item.status === "resolved").length;

  return {
    openAlerts,
    resolvedAlerts,
    totalPonds: demoPonds.length,
    totalSensors: demoSensors.length,
    operations24h: 6,
    estimatedBiomassKg30d: 18245.4
  };
}

export function getDemoSites() {
  return clone(demoSites);
}

export function getDemoPonds() {
  return clone(demoPonds);
}

export function createDemoPond({ siteId = null, name, externalCode = null, species, volumeM3 = null } = {}) {
  const normalizedName = String(name || "").trim();
  const normalizedSpecies = String(species || "").trim();

  if (normalizedName.length < 2) {
    return {
      error: "El nombre de la piscina debe tener al menos 2 caracteres.",
      status: 400
    };
  }

  if (normalizedSpecies.length < 2) {
    return {
      error: "La especie debe tener al menos 2 caracteres.",
      status: 400
    };
  }

  const normalizedExternalCode = String(externalCode || "").trim().toUpperCase() || null;

  if (normalizedExternalCode) {
    const duplicatedExternalCode = demoPonds.some(
      (item) => String(item.external_code || "").toUpperCase() === normalizedExternalCode
    );

    if (duplicatedExternalCode) {
      return {
        error: "Ya existe una piscina con ese codigo externo.",
        status: 409
      };
    }
  }

  const duplicated = demoPonds.some(
    (item) => String(item.name || "").toLowerCase() === normalizedName.toLowerCase()
  );

  if (duplicated) {
    return {
      error: "Ya existe una piscina con ese nombre.",
      status: 409
    };
  }

  let selectedSite = null;
  if (siteId !== null && siteId !== undefined) {
    selectedSite = demoSites.find((item) => Number(item.id) === Number(siteId)) || null;
    if (!selectedSite) {
      return {
        error: "Site not found",
        status: 404
      };
    }
  }

  demoPondIdSequence += 1;

  const pond = {
    id: demoPondIdSequence,
    site_id: selectedSite ? selectedSite.id : null,
    site_code: selectedSite ? selectedSite.code : null,
    site_name: selectedSite ? selectedSite.name : null,
    site_region: selectedSite ? selectedSite.region : null,
    name: normalizedName,
    external_code: normalizedExternalCode,
    species: normalizedSpecies,
    status: "active",
    volume_m3: Number.isFinite(Number(volumeM3)) ? Number(volumeM3) : null,
    created_at: new Date().toISOString()
  };

  demoPonds.push(pond);

  return {
    pond: clone(pond),
    error: null,
    status: 201
  };
}

export function getDemoSensors({ pondId = null } = {}) {
  const filtered = pondId
    ? demoSensors.filter((sensor) => sensor.pond_id === Number(pondId))
    : demoSensors;

  return clone(filtered);
}

export function updateDemoPondExternalCode({ pondId, externalCode }) {
  const target = demoPonds.find((item) => Number(item.id) === Number(pondId));

  if (!target) {
    return {
      error: "Pond not found",
      status: 404,
      pond: null
    };
  }

  const normalizedExternalCode = String(externalCode || "").trim().toUpperCase() || null;

  if (normalizedExternalCode) {
    const duplicated = demoPonds.some(
      (item) =>
        Number(item.id) !== Number(pondId) &&
        String(item.external_code || "").toUpperCase() === normalizedExternalCode
    );

    if (duplicated) {
      return {
        error: "Ya existe una piscina con ese codigo externo.",
        status: 409,
        pond: null
      };
    }
  }

  target.external_code = normalizedExternalCode;

  return {
    error: null,
    status: 200,
    pond: clone(target)
  };
}

export function ingestDemoScadaReadings(readings = []) {
  const mapped = [];
  const unmapped = [];

  for (const reading of readings) {
    const externalCode = String(reading.externalCode || "").trim().toUpperCase();
    const pond = demoPonds.find(
      (item) => String(item.external_code || "").toUpperCase() === externalCode
    );

    if (!pond) {
      const normalizedSensorType = String(reading.sensorType || "").toLowerCase();
      const nowIso = new Date().toISOString();
      const existingUnmapped = demoScadaUnmappedSignals.find(
        (item) =>
          String(item.external_code || "").toUpperCase() === externalCode &&
          String(item.sensor_type || "").toLowerCase() === normalizedSensorType
      );

      if (existingUnmapped) {
        existingUnmapped.status = "open";
        existingUnmapped.samples_count = Number(existingUnmapped.samples_count || 0) + 1;
        existingUnmapped.last_value = Number(reading.value);
        existingUnmapped.last_unit = String(reading.unit || "") || null;
        existingUnmapped.last_recorded_at = reading.recordedAt || nowIso;
        existingUnmapped.last_seen_at = nowIso;
        existingUnmapped.resolved_at = null;
        existingUnmapped.resolved_by = null;
        existingUnmapped.resolved_pond_id = null;
      } else {
        demoScadaUnmappedSignals.push({
          id: demoScadaUnmappedSequence += 1,
          external_code: externalCode,
          sensor_type: normalizedSensorType,
          samples_count: 1,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
          last_value: Number(reading.value),
          last_unit: String(reading.unit || "") || null,
          last_recorded_at: reading.recordedAt || nowIso,
          status: "open",
          resolved_at: null,
          resolved_by: null,
          resolved_pond_id: null
        });
      }

      unmapped.push({
        externalCode,
        sensorType: normalizedSensorType,
        reason: "Pond external code is not mapped"
      });
      continue;
    }

    for (const pending of demoScadaUnmappedSignals) {
      if (String(pending.external_code || "").toUpperCase() === externalCode && pending.status === "open") {
        pending.status = "resolved";
        pending.resolved_pond_id = pond.id;
        pending.resolved_at = new Date().toISOString();
      }
    }

    const loggedReading = {
      id: demoScadaReadingSequence += 1,
      pondId: pond.id,
      pondName: pond.name,
      externalCode,
      sensorType: String(reading.sensorType || "").toLowerCase(),
      value: Number(reading.value),
      unit: String(reading.unit || ""),
      quality: String(reading.quality || "good").toLowerCase(),
      recordedAt: reading.recordedAt || new Date().toISOString()
    };

    demoScadaIngestLog.push(loggedReading);
    if (demoScadaIngestLog.length > 1000) {
      demoScadaIngestLog.splice(0, demoScadaIngestLog.length - 1000);
    }

    mapped.push(loggedReading);
  }

  return {
    total: readings.length,
    accepted: mapped.length,
    rejected: unmapped.length,
    mapped,
    unmapped
  };
}

export function listDemoScadaUnmappedSignals() {
  return clone(
    demoScadaUnmappedSignals
      .filter((item) => item.status === "open")
      .sort((left, right) => new Date(right.last_seen_at).getTime() - new Date(left.last_seen_at).getTime())
  );
}

export function resolveDemoScadaUnmappedSignal({ signalId, pondId, actorUserId = null }) {
  const signal = demoScadaUnmappedSignals.find((item) => Number(item.id) === Number(signalId));

  if (!signal) {
    return {
      error: "Signal not found",
      status: 404,
      signal: null
    };
  }

  if (signal.status !== "open") {
    return {
      error: "Signal is not open",
      status: 409,
      signal: null
    };
  }

  const targetPond = demoPonds.find((item) => Number(item.id) === Number(pondId));

  if (!targetPond) {
    return {
      error: "Pond not found",
      status: 404,
      signal: null
    };
  }

  const duplicated = demoPonds.some(
    (item) =>
      Number(item.id) !== Number(targetPond.id) &&
      String(item.external_code || "").toUpperCase() === String(signal.external_code || "").toUpperCase()
  );

  if (duplicated) {
    return {
      error: "Ya existe una piscina con ese codigo externo.",
      status: 409,
      signal: null
    };
  }

  targetPond.external_code = String(signal.external_code || "").toUpperCase();
  signal.status = "resolved";
  signal.resolved_at = new Date().toISOString();
  signal.resolved_by = actorUserId;
  signal.resolved_pond_id = targetPond.id;

  return {
    error: null,
    status: 200,
    signal: clone(signal),
    pond: clone(targetPond)
  };
}

export function getDemoLatestReadings(limit = 24) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 24));
  const rows = [];

  for (let index = 0; index < safeLimit; index += 1) {
    const sensor = demoSensors[index % demoSensors.length];
    const recordedAtIso = new Date(Date.now() - index * 5 * 60 * 1000).toISOString();
    rows.push(buildReadingRow(sensor, recordedAtIso));
  }

  return rows;
}

export function getDemoHistory({ sensorId, from, to, bucket }) {
  const sensor = getSensorById(Number(sensorId));

  if (!sensor) {
    return null;
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }

  const bucketName = bucket === "day" ? "day" : "hour";
  const stepMs = bucketName === "day" ? 24 * 3_600_000 : 3_600_000;
  const series = [];

  for (let cursor = fromDate.getTime(); cursor <= toDate.getTime(); cursor += stepMs) {
    const pointIso = new Date(cursor).toISOString();
    const reading = buildReadingRow(sensor, pointIso);
    const spread = (metricRanges[sensor.type]?.max - metricRanges[sensor.type]?.min || 1) * 0.04;

    series.push({
      bucket_start: pointIso,
      avg_value: reading.value,
      min_value: round(Math.max(reading.value - spread, 0), 3),
      max_value: round(reading.value + spread, 3),
      samples: bucketName === "day" ? 24 : 6
    });
  }

  return {
    sensor: {
      id: sensor.id,
      name: sensor.name,
      type: sensor.type,
      unit: sensor.unit
    },
    bucket: bucketName,
    from: fromDate,
    to: toDate,
    series
  };
}

function sensorHealthProfileForType(sensorType) {
  return sensorHealthProfiles[String(sensorType || "").toLowerCase()] || sensorHealthProfiles.default;
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

function summarizeSensorHealth(sensors) {
  const activeSensors = sensors.filter((sensor) => sensor.enabled);
  const okSensors = activeSensors.filter((sensor) => sensor.status === "ok").length;
  const warningSensors = activeSensors.filter((sensor) => sensor.status === "warning").length;
  const criticalSensors = activeSensors.filter((sensor) => sensor.status === "critical").length;

  const incidentsByCode = {};
  const topIncidents = [];
  const byTypeMap = new Map();

  for (const sensor of sensors) {
    const typeKey = String(sensor.sensorType || "unknown");

    if (!byTypeMap.has(typeKey)) {
      byTypeMap.set(typeKey, {
        sensorType: typeKey,
        total: 0,
        ok: 0,
        warning: 0,
        critical: 0,
        disabled: 0
      });
    }

    const bucket = byTypeMap.get(typeKey);
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
      incidentsByCode[incident.code] = Number(incidentsByCode[incident.code] || 0) + 1;
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
      Number(sensorHealthSeverityPriority[right.severity] || 0)
      - Number(sensorHealthSeverityPriority[left.severity] || 0);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return String(left.sensorName || "").localeCompare(String(right.sensorName || ""));
  });

  const scoreSamples = activeSensors
    .map((sensor) => Number(sensor.healthScore))
    .filter((score) => Number.isFinite(score));
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

function evaluateSensorHealthSample(sample, staleMinutes) {
  const sensorType = String(sample.sensorType || "unknown").toLowerCase();
  const profile = sensorHealthProfileForType(sensorType);
  const nowMs = Date.now();

  let minutesSinceLast = null;
  if (sample.lastReadingAt) {
    const ts = new Date(sample.lastReadingAt).getTime();
    if (Number.isFinite(ts)) {
      minutesSinceLast = (nowMs - ts) / 60000;
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
      sampleCount: sample.sampleCount,
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
      quality: sample.lastQuality || null
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

  if (sample.enabled) {
    if (minutesSinceLast === null || minutesSinceLast > staleMinutes) {
      checks.missingSignal = {
        ...checks.missingSignal,
        triggered: true,
        severity: "critical"
      };

      addIncident(
        "missing_signal",
        "critical",
        minutesSinceLast === null
          ? "Sensor sin telemetria disponible."
          : `Sin muestra reciente (${round(minutesSinceLast, 1)} min).`,
        {
          minutesSinceLast: minutesSinceLast === null ? null : round(minutesSinceLast, 1)
        }
      );
    }

    if (Number.isFinite(sample.currentValue) && (sample.currentValue < profile.min || sample.currentValue > profile.max)) {
      const rangeSpan = Math.max(0.001, profile.max - profile.min);
      const distance = sample.currentValue < profile.min
        ? profile.min - sample.currentValue
        : sample.currentValue - profile.max;
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
          currentValue: sample.currentValue,
          minAllowed: profile.min,
          maxAllowed: profile.max,
          distance: round(distance, 3)
        }
      );
    }

    if (Number.isFinite(sample.windowMin) && Number.isFinite(sample.windowMax) && sample.sampleCount >= profile.freezeMinSamples) {
      const windowRange = Math.abs(sample.windowMax - sample.windowMin);

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
            sampleCount: sample.sampleCount
          }
        );
      }
    }

    if (Number.isFinite(sample.currentValue) && Number.isFinite(sample.previousValue)) {
      const delta = Math.abs(sample.currentValue - sample.previousValue);

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
            previousValue: sample.previousValue,
            currentValue: sample.currentValue
          }
        );
      }
    }

    if (sample.lastQuality && !["ok", "good"].includes(String(sample.lastQuality).toLowerCase())) {
      checks.qualityFlag = {
        ...checks.qualityFlag,
        triggered: true,
        severity: "warning"
      };

      addIncident(
        "quality_flag",
        "warning",
        `Muestra marcada con calidad ${sample.lastQuality}.`,
        {
          quality: String(sample.lastQuality)
        }
      );
    }
  }

  const status = !sample.enabled
    ? "disabled"
    : incidents.reduce((current, incident) => {
        return sensorHealthSeverityPriority[incident.severity] > sensorHealthSeverityPriority[current]
          ? incident.severity
          : current;
      }, "ok");

  let healthScore = null;
  if (sample.enabled) {
    healthScore = 100;
    for (const incident of incidents) {
      healthScore -= healthIncidentPenalty(incident.code, incident.severity);
    }
    healthScore = clamp(Math.round(healthScore), 0, 100);
  }

  return {
    sensorId: sample.sensorId,
    sensorName: sample.sensorName,
    sensorType,
    pondId: sample.pondId,
    pondName: sample.pondName,
    unit: sample.unit,
    enabled: sample.enabled,
    status,
    healthScore,
    currentValue: Number.isFinite(sample.currentValue) ? round(sample.currentValue, 3) : null,
    previousValue: Number.isFinite(sample.previousValue) ? round(sample.previousValue, 3) : null,
    lastReadingAt: sample.lastReadingAt,
    previousReadingAt: sample.previousReadingAt,
    minutesSinceLast: minutesSinceLast === null ? null : round(minutesSinceLast, 1),
    sampleCount: sample.sampleCount,
    windowMin: Number.isFinite(sample.windowMin) ? round(sample.windowMin, 3) : null,
    windowMax: Number.isFinite(sample.windowMax) ? round(sample.windowMax, 3) : null,
    windowAvg: Number.isFinite(sample.windowAvg) ? round(sample.windowAvg, 3) : null,
    windowStddev: Number.isFinite(sample.windowStddev) ? round(sample.windowStddev, 3) : null,
    checks,
    incidents
  };
}

export function getDemoSensorHealthOverview({ windowHours = 24, staleMinutes = 35 } = {}) {
  const nowMs = Date.now();
  const safeWindowHours = Math.max(4, Math.min(168, Math.round(Number(windowHours) || 24)));
  const safeStaleMinutes = Math.max(5, Math.min(240, Math.round(Number(staleMinutes) || 35)));

  const simulated = demoSensors.map((sensor) => {
    const profile = sensorHealthProfileForType(sensor.type);
    const range = metricRanges[sensor.type] || { min: profile.min, max: profile.max };
    const mid = (range.min + range.max) / 2;

    const sample = {
      sensorId: sensor.id,
      sensorName: sensor.name,
      sensorType: sensor.type,
      pondId: sensor.pond_id,
      pondName: sensor.pond_name,
      unit: sensor.unit,
      enabled: Boolean(sensor.enabled),
      currentValue: mid,
      previousValue: mid,
      lastReadingAt: new Date(nowMs - 6 * 60 * 1000).toISOString(),
      previousReadingAt: new Date(nowMs - 11 * 60 * 1000).toISOString(),
      sampleCount: 24,
      windowMin: mid - profile.frozenRangeMax * 3,
      windowMax: mid + profile.frozenRangeMax * 3,
      windowAvg: mid,
      windowStddev: profile.frozenRangeMax,
      lastQuality: "good"
    };

    if (sensor.id === 1001) {
      sample.currentValue = profile.min - 0.7;
      sample.previousValue = sample.currentValue + 1.05;
      sample.lastReadingAt = new Date(nowMs - 5 * 60 * 1000).toISOString();
      sample.previousReadingAt = new Date(nowMs - 10 * 60 * 1000).toISOString();
      sample.windowMin = sample.currentValue - 0.12;
      sample.windowMax = sample.currentValue + 0.2;
      sample.windowStddev = 0.18;
    } else if (sensor.id === 1002) {
      sample.currentValue = mid;
      sample.previousValue = mid - 0.15;
      sample.lastReadingAt = new Date(nowMs - (safeStaleMinutes + 22) * 60 * 1000).toISOString();
      sample.previousReadingAt = new Date(nowMs - (safeStaleMinutes + 28) * 60 * 1000).toISOString();
      sample.sampleCount = 5;
      sample.windowMin = mid - 0.3;
      sample.windowMax = mid + 0.35;
      sample.windowStddev = 0.14;
    } else if (sensor.id === 1003) {
      sample.currentValue = mid + 0.1;
      sample.previousValue = sample.currentValue - 0.01;
      sample.lastReadingAt = new Date(nowMs - 4 * 60 * 1000).toISOString();
      sample.previousReadingAt = new Date(nowMs - 9 * 60 * 1000).toISOString();
      sample.sampleCount = 30;
      sample.windowMin = sample.currentValue - 0.01;
      sample.windowMax = sample.currentValue + 0.01;
      sample.windowStddev = 0.006;
    } else if (sensor.id === 1004) {
      sample.currentValue = profile.max - 0.02;
      sample.previousValue = sample.currentValue - 0.62;
      sample.lastReadingAt = new Date(nowMs - 2 * 60 * 1000).toISOString();
      sample.previousReadingAt = new Date(nowMs - 7 * 60 * 1000).toISOString();
      sample.sampleCount = 28;
      sample.windowMin = sample.currentValue - 0.28;
      sample.windowMax = sample.currentValue + 0.22;
      sample.windowStddev = 0.19;
      sample.lastQuality = "suspect";
    }

    return sample;
  });

  const sensors = simulated.map((sample) => evaluateSensorHealthSample(sample, safeStaleMinutes));
  const summary = summarizeSensorHealth(sensors);

  return {
    generatedAt: new Date().toISOString(),
    windowHours: safeWindowHours,
    staleMinutes: safeStaleMinutes,
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
  };
}

const demoSensorHealthAlertMessageByCode = {
  missing_signal: "Sin señal reciente",
  out_of_range: "Valor fuera de rango",
  frozen_signal: "Posible señal congelada",
  abrupt_jump: "Salto brusco detectado",
  quality_flag: "Calidad de muestra no fiable"
};

function demoSensorHealthAlertMessage(code) {
  const title = demoSensorHealthAlertMessageByCode[code] || "Incidencia de salud de sensor";
  return `Salud sensor - ${code}: ${title}`;
}

function demoAlertSeverityForIncident(severity) {
  return severity === "critical" ? "critical" : "medium";
}

function parseDemoSensorHealthAlertCode(message) {
  const text = String(message || "");
  const match = text.match(/^Salud sensor - ([a-z_]+):/i);
  return match ? String(match[1]).toLowerCase() : null;
}

export function syncDemoSensorHealthAlerts({ windowHours = 24, staleMinutes = 35, actorUser } = {}) {
  const overview = getDemoSensorHealthOverview({ windowHours, staleMinutes });
  const expectedByKey = new Map();

  for (const sensor of overview.sensors || []) {
    if (!sensor?.enabled) {
      continue;
    }

    for (const incident of sensor.incidents || []) {
      const code = String(incident.code || "").toLowerCase();
      if (!code) {
        continue;
      }

      const key = `${sensor.sensorId}:${code}`;
      expectedByKey.set(key, {
        sensor,
        incident,
        message: demoSensorHealthAlertMessage(code),
        severity: demoAlertSeverityForIncident(incident.severity)
      });
    }
  }

  const openManagedAlerts = demoAlerts.filter(
    (item) =>
      item.status === "open"
      && typeof parseDemoSensorHealthAlertCode(item.message) === "string"
  );

  let created = 0;
  let updated = 0;
  let autoResolved = 0;

  const openByKey = new Map();
  for (const alert of openManagedAlerts) {
    const code = parseDemoSensorHealthAlertCode(alert.message);
    if (!code) {
      continue;
    }

    openByKey.set(`${alert.sensor_id}:${code}`, alert);
  }

  for (const [key, expected] of expectedByKey.entries()) {
    const existing = openByKey.get(key);

    if (existing) {
      existing.severity = expected.severity;
      existing.current_value = Number.isFinite(Number(expected.sensor.currentValue))
        ? Number(expected.sensor.currentValue)
        : null;
      existing.protocol_updated_at = new Date().toISOString();
      updated += 1;
      continue;
    }

    const createdAlert = buildAlert({
      pondId: expected.sensor.pondId,
      sensorId: expected.sensor.sensorId,
      severity: expected.severity,
      message: expected.message,
      status: "open",
      createdAt: new Date().toISOString(),
      currentValue: Number.isFinite(Number(expected.sensor.currentValue))
        ? Number(expected.sensor.currentValue)
        : null
    });

    demoAlerts.unshift(createdAlert);
    created += 1;
  }

  for (const alert of openManagedAlerts) {
    const code = parseDemoSensorHealthAlertCode(alert.message);
    if (!code) {
      continue;
    }

    const key = `${alert.sensor_id}:${code}`;
    if (expectedByKey.has(key)) {
      continue;
    }

    const nowIso = new Date().toISOString();
    alert.status = "resolved";
    alert.protocol_status = "resolved";
    alert.protocol_owner = alert.protocol_owner || Number(actorUser?.id || demoUser.id);
    alert.protocol_owner_name = demoUser.fullName;
    alert.protocol_started_at = alert.protocol_started_at || nowIso;
    alert.protocol_updated_at = nowIso;
    alert.resolved_at = nowIso;
    alert.resolved_by = Number(actorUser?.id || demoUser.id);
    alert.resolved_by_name = demoUser.fullName;
    alert.protocol_steps = normalizeAlertProtocolSteps(
      (alert.protocol_steps || []).map((step) => ({
        ...step,
        done: true
      }))
    );
    autoResolved += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    windowHours: overview.windowHours,
    staleMinutes: overview.staleMinutes,
    summary: {
      created,
      updated,
      autoResolved,
      openManaged: demoAlerts.filter(
        (item) =>
          item.status === "open"
          && typeof parseDemoSensorHealthAlertCode(item.message) === "string"
      ).length,
      expectedIncidents: expectedByKey.size
    }
  };
}

export function listDemoAlerts(status = "open") {
  const normalized = String(status || "open").toLowerCase();
  const selected =
    normalized === "all" ? demoAlerts : demoAlerts.filter((item) => item.status === normalized);

  return clone(
    selected.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  );
}

export function resolveDemoAlert(alertId, actorUser) {
  const numericId = Number(alertId);
  const alert = demoAlerts.find((item) => item.id === numericId && item.status === "open");

  if (!alert) {
    return null;
  }

  const nowIso = new Date().toISOString();
  alert.status = "resolved";
  alert.protocol_status = "resolved";
  alert.protocol_owner = alert.protocol_owner || Number(actorUser?.id || demoUser.id);
  alert.protocol_owner_name = demoUser.fullName;
  alert.protocol_started_at = alert.protocol_started_at || nowIso;
  alert.protocol_updated_at = nowIso;
  alert.resolved_at = nowIso;
  alert.resolved_by = Number(actorUser?.id || demoUser.id);
  alert.resolved_by_name = demoUser.fullName;
  alert.protocol_steps = normalizeAlertProtocolSteps(
    (alert.protocol_steps || []).map((step) => ({
      ...step,
      done: true
    }))
  );

  return clone(alert);
}

export function updateDemoAlertProtocol(alertId, payload, actorUser) {
  const numericId = Number(alertId);
  const alert = demoAlerts.find((item) => item.id === numericId);

  if (!alert) {
    return null;
  }

  const nowIso = new Date().toISOString();

  if (Object.prototype.hasOwnProperty.call(payload, "protocolStatus")) {
    alert.protocol_status = payload.protocolStatus;

    if (payload.protocolStatus === "in_progress") {
      alert.protocol_started_at = alert.protocol_started_at || nowIso;
    }

    if (payload.protocolStatus === "resolved") {
      alert.status = "resolved";
      alert.resolved_at = alert.resolved_at || nowIso;
      alert.resolved_by = Number(actorUser?.id || demoUser.id);
      alert.resolved_by_name = demoUser.fullName;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "protocolOwnerId")) {
    alert.protocol_owner = payload.protocolOwnerId;
    alert.protocol_owner_name = payload.protocolOwnerId ? demoUser.fullName : null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "protocolNotes")) {
    alert.protocol_notes = payload.protocolNotes;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "escalationDeadline")) {
    alert.escalation_deadline = payload.escalationDeadline;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "protocolSteps")) {
    alert.protocol_steps = normalizeAlertProtocolSteps(payload.protocolSteps || []);
  }

  alert.protocol_updated_at = nowIso;

  return clone(alert);
}

export function getDemoRiskForecast() {
  const byPond = new Map();

  for (const pond of demoPonds) {
    const pondAlerts = demoAlerts.filter((alert) => alert.pond_id === pond.id && alert.status === "open");
    const baseScore = 24 + pondAlerts.length * 19;
    const risk24Score = round(clamp(baseScore + Math.random() * 12, 5, 95), 1);
    const risk48Score = round(clamp(risk24Score + 6 + Math.random() * 10, 5, 96), 1);
    const risk72Score = round(clamp(risk48Score + 4 + Math.random() * 12, 5, 98), 1);

    const criticalSensors = pondAlerts
      .map((alert) => ({
        sensorType: alert.sensor_type,
        score: round(clamp(risk72Score - Math.random() * 10, 5, 99), 1),
        minThreshold: null,
        maxThreshold: null,
        reasons: ["Open alert in pond"],
        openAlerts: 1
      }))
      .slice(0, 3);

    byPond.set(pond.id, {
      pondId: pond.id,
      pondName: pond.name,
      risk24: {
        score: risk24Score,
        level: scoreToLevel(risk24Score),
        topSensorType: criticalSensors[0]?.sensorType || null,
        sensorsAtRisk: criticalSensors.length,
        reasons: criticalSensors.length ? ["Active alerts and unstable trend"] : ["Stable readings"]
      },
      risk48: {
        score: risk48Score,
        level: scoreToLevel(risk48Score),
        topSensorType: criticalSensors[0]?.sensorType || null,
        sensorsAtRisk: criticalSensors.length,
        reasons: criticalSensors.length ? ["Potential threshold breach"] : ["Low risk"]
      },
      risk72: {
        score: risk72Score,
        level: scoreToLevel(risk72Score),
        topSensorType: criticalSensors[0]?.sensorType || null,
        sensorsAtRisk: criticalSensors.length,
        reasons: criticalSensors.length ? ["Intervention recommended"] : ["Operationally stable"]
      },
      criticalSensors,
      sensorForecasts: criticalSensors.map((item) => ({
        sensorType: item.sensorType,
        sensorUnit: null,
        latestValue: null,
        trendPerHour: null,
        stddevValue: null,
        minThreshold: null,
        maxThreshold: null,
        openAlerts: item.openAlerts,
        samples: 12,
        risk24: {
          score: risk24Score,
          level: scoreToLevel(risk24Score),
          predictedValue: null,
          reasons: ["Synthetic forecast"]
        },
        risk48: {
          score: risk48Score,
          level: scoreToLevel(risk48Score),
          predictedValue: null,
          reasons: ["Synthetic forecast"]
        },
        risk72: {
          score: risk72Score,
          level: scoreToLevel(risk72Score),
          predictedValue: null,
          reasons: ["Synthetic forecast"]
        }
      }))
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    horizons: [24, 48, 72],
    ponds: Array.from(byPond.values()).sort((a, b) => b.risk72.score - a.risk72.score)
  };
}

export function listDemoRules() {
  return clone(demoRules);
}

export function createDemoRule(payload) {
  const nowIso = new Date().toISOString();
  const nextRule = {
    id: ++ruleIdSequence,
    pond_id: payload.pondId ?? null,
    sensor_type: payload.sensorType,
    min_value: payload.minValue ?? null,
    max_value: payload.maxValue ?? null,
    severity: payload.severity,
    enabled: true,
    created_at: nowIso
  };

  demoRules.unshift(nextRule);
  return clone(nextRule);
}

export function getDemoWaterFlowConfig() {
  return clone({
    ...demoWaterFlowConfig,
    meters: getDemoMetersSnapshot()
  });
}

export function updateDemoWaterFlowConfig(payload) {
  if (Array.isArray(payload.meters)) {
    applyDemoMeterPatches(payload.meters);
  } else if (Object.prototype.hasOwnProperty.call(payload, "calibrationK")) {
    applyDemoMeterPatches(
      demoWaterFlowMeters.map((meter) => ({
        id: meter.id,
        calibrationK: payload.calibrationK
      }))
    );
  }

  demoWaterFlowConfig = normalizeFlowConfigDraft({
    ...demoWaterFlowConfig,
    ...payload,
    updatedAt: new Date().toISOString()
  });

  syncDemoLegacyCalibrationK();

  const overview = getDemoWaterFlowOverviewInternal({
    hours: 72,
    year: new Date().getFullYear()
  });

  return {
    config: clone({
      ...demoWaterFlowConfig,
      meters: getDemoMetersSnapshot()
    }),
    alerts: clone(overview.alerts)
  };
}

export function getDemoWaterFlowOverview(params = {}) {
  return clone(getDemoWaterFlowOverviewInternal(params));
}

export function createDemoWaterFlowReading(payload) {
  const kByChannel = getDemoFlowKByChannel(demoWaterFlowConfig);
  const incomingMeasuredM3h = Math.max(0, toFiniteNumber(payload.incomingMeasuredM3h, 0));
  const outgoingMeasuredM3h = Math.max(0, toFiniteNumber(payload.outgoingMeasuredM3h, 0));
  const recirculatedM3h = Math.max(0, toFiniteNumber(payload.recirculatedM3h, incomingMeasuredM3h * 0.23));
  const dischargeQualityPct = clamp(toFiniteNumber(payload.dischargeQualityPct, 91), 0, 100);
  const recordedAt = payload.recordedAt ? new Date(payload.recordedAt) : new Date();
  const safeRecordedAt = Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt;

  const row = {
    id: ++demoWaterFlowReadingIdSequence,
    recorded_at: safeRecordedAt.toISOString(),
    incoming_measured_m3h: round(incomingMeasuredM3h, 3),
    outgoing_measured_m3h: round(outgoingMeasuredM3h, 3),
    recirculated_m3h: round(recirculatedM3h, 3),
    discharge_quality_pct: round(dischargeQualityPct, 3),
    notes: payload.notes || null,
    created_at: new Date().toISOString()
  };

  demoWaterFlowReadings.push(row);
  demoWaterFlowReadings.sort(
    (left, right) => new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime()
  );

  if (demoWaterFlowReadings.length > 6_000) {
    demoWaterFlowReadings.splice(0, demoWaterFlowReadings.length - 6_000);
  }

  const overview = getDemoWaterFlowOverviewInternal({
    hours: 72,
    year: safeRecordedAt.getFullYear()
  });

  return {
    reading: {
      ...mapReadingToFlowPoint(row, kByChannel),
      id: row.id,
      recorded_at: row.recorded_at,
      incoming_measured_m3h: row.incoming_measured_m3h,
      outgoing_measured_m3h: row.outgoing_measured_m3h,
      recirculated_m3h: row.recirculated_m3h,
      discharge_quality_pct: row.discharge_quality_pct,
      notes: row.notes,
      created_at: row.created_at
    },
    alerts: clone(overview.alerts)
  };
}

export function listDemoWaterFlowAlerts(status = "open") {
  const normalized = String(status || "open").toLowerCase();

  if (normalized === "all") {
    return clone(
      [...demoWaterFlowAlerts].sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      )
    );
  }

  return clone(
    demoWaterFlowAlerts
      .filter((item) => item.status === normalized)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
  );
}

export function resolveDemoWaterFlowAlert(alertId) {
  const numericId = Number(alertId);
  const alert = demoWaterFlowAlerts.find((item) => item.id === numericId && item.status === "open");

  if (!alert) {
    return null;
  }

  const nowIso = new Date().toISOString();
  alert.status = "resolved";
  alert.updated_at = nowIso;
  alert.resolved_at = nowIso;

  return clone(alert);
}

export function listDemoLabWaterSamples({
  pondId = null,
  from = null,
  to = null,
  limit = 120
} = {}) {
  const normalizedPondId = Number(pondId);
  const fromMs = from ? new Date(from).getTime() : null;
  const toMs = to ? new Date(to).getTime() : null;
  const maxLimit = Math.max(1, Math.min(500, Number(limit) || 120));

  const filtered = demoLabWaterSamples.filter((sample) => {
    if (Number.isFinite(normalizedPondId) && normalizedPondId > 0) {
      if (Number(sample.pond_id) !== normalizedPondId) {
        return false;
      }
    }

    const sampledMs = new Date(sample.sampled_at).getTime();

    if (Number.isFinite(fromMs) && sampledMs < fromMs) {
      return false;
    }

    if (Number.isFinite(toMs) && sampledMs > toMs) {
      return false;
    }

    return true;
  });

  return clone(
    filtered
      .sort((left, right) => new Date(right.sampled_at).getTime() - new Date(left.sampled_at).getTime())
      .slice(0, maxLimit)
      .map((sample) => mapDemoLabWaterSample(sample))
  );
}

export function createDemoLabWaterSample(payload, actorUser = null) {
  const sampledAtDate = payload.sampledAt ? new Date(payload.sampledAt) : new Date();
  const sampledAt = Number.isNaN(sampledAtDate.getTime())
    ? new Date().toISOString()
    : sampledAtDate.toISOString();
  const pondId = payload.pondId === null || payload.pondId === undefined
    ? null
    : Number(payload.pondId);

  if (pondId !== null) {
    const pond = demoPonds.find((item) => Number(item.id) === pondId);

    if (!pond) {
      return {
        error: "Pond not found",
        status: 404,
        sample: null
      };
    }
  }

  const normalizedPdfBase64 = String(payload.pdfBase64 || "").trim() || null;
  const normalizedPdfMimeType = normalizedPdfBase64
    ? String(payload.pdfMimeType || "application/pdf").trim() || "application/pdf"
    : null;
  const normalizedPdfFileName = normalizedPdfBase64
    ? String(payload.pdfFileName || "muestra-laboratorio.pdf").trim()
    : null;

  if (normalizedPdfBase64) {
    const byteLength = Buffer.from(normalizedPdfBase64, "base64").length;

    if (!byteLength || Number.isNaN(byteLength)) {
      return {
        error: "PDF invalid",
        status: 400,
        sample: null
      };
    }

    if (byteLength > 12 * 1024 * 1024) {
      return {
        error: "PDF exceeds 12 MB",
        status: 400,
        sample: null
      };
    }
  }

  const nowIso = new Date().toISOString();
  demoLabWaterSampleIdSequence += 1;

  const sample = {
    id: demoLabWaterSampleIdSequence,
    pond_id: Number.isFinite(pondId) && pondId > 0 ? pondId : null,
    sampled_at: sampledAt,
    source_label: String(payload.sourceLabel || "").trim() || null,
    technician_name: String(payload.technicianName || "").trim() || null,
    analysis_type: String(payload.analysisType || "laboratorio").trim() || "laboratorio",
    oxygen_mg_l: normalizeOptionalNumber(payload.oxygenMgL),
    temperature_c: normalizeOptionalNumber(payload.temperatureC),
    ph: normalizeOptionalNumber(payload.ph),
    salinity_ppt: normalizeOptionalNumber(payload.salinityPpt),
    turbidity_ntu: normalizeOptionalNumber(payload.turbidityNtu),
    ammonia_mg_l: normalizeOptionalNumber(payload.ammoniaMgL),
    nitrite_mg_l: normalizeOptionalNumber(payload.nitriteMgL),
    nitrate_mg_l: normalizeOptionalNumber(payload.nitrateMgL),
    alkalinity_mg_l: normalizeOptionalNumber(payload.alkalinityMgL),
    hardness_mg_l: normalizeOptionalNumber(payload.hardnessMgL),
    conductivity_us_cm: normalizeOptionalNumber(payload.conductivityUsCm),
    notes: String(payload.notes || "").trim() || null,
    pdf_file_name: normalizedPdfFileName,
    pdf_mime_type: normalizedPdfMimeType,
    pdf_uploaded_at: normalizedPdfBase64 ? nowIso : null,
    pdf_base64: normalizedPdfBase64,
    created_by: Number(actorUser?.id || demoUser.id),
    created_at: nowIso
  };

  demoLabWaterSamples.unshift(sample);

  if (demoLabWaterSamples.length > 1200) {
    demoLabWaterSamples.splice(1200);
  }

  return {
    error: null,
    status: 201,
    sample: clone(mapDemoLabWaterSample(sample))
  };
}

export function getDemoLabWaterSamplePdf(sampleId) {
  const sample = demoLabWaterSamples.find((item) => Number(item.id) === Number(sampleId));

  if (!sample || !sample.pdf_base64) {
    return null;
  }

  return {
    id: sample.id,
    fileName: sample.pdf_file_name || `sample-${sample.id}.pdf`,
    mimeType: sample.pdf_mime_type || "application/pdf",
    pdfBase64: sample.pdf_base64,
    uploadedAt: sample.pdf_uploaded_at
  };
}

export function createDemoTraceabilityCertificate(record) {
  const normalizedRecord = {
    public_id: String(record.public_id),
    lot_code: String(record.lot_code),
    payload: clone(record.payload || {}),
    payload_hash: String(record.payload_hash),
    verification_signature: String(record.verification_signature),
    status: String(record.status || "valid"),
    created_at: record.created_at || new Date().toISOString(),
    revoked_at: record.revoked_at || null,
    replaced_by_public_id: record.replaced_by_public_id || null
  };

  demoTraceabilityCertificates.set(normalizedRecord.public_id, normalizedRecord);
  return clone(normalizedRecord);
}

export function getDemoTraceabilityCertificate(publicId) {
  const record = demoTraceabilityCertificates.get(String(publicId));
  return record ? clone(record) : null;
}
