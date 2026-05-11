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

  if (Array.isArray(configuredFeatures) && configuredFeatures.length > 0) {
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
    species: "trucha",
    status: "active",
    volume_m3: 680,
    created_at: "2026-01-10T08:35:00.000Z"
  }
];

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

export function getDemoSensors({ pondId = null } = {}) {
  const filtered = pondId
    ? demoSensors.filter((sensor) => sensor.pond_id === Number(pondId))
    : demoSensors;

  return clone(filtered);
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
