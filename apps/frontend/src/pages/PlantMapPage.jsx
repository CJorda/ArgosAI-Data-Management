import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  alertsRequest,
  historyReadingsRequest,
  latestReadingsRequest,
  oxygenColorSetpointsRequest,
  pondsRequest,
  sensorsRequest,
  temperatureColorSetpointsRequest,
  waterQualityEmailReportRequest
} from "../api/services";
import {
  REPORT_EMAIL_TEMPLATES,
  applyEmailTemplate,
  resolveReportEmailTemplate
} from "../config/reportEmailTemplates";
import { useAuth } from "../context/AuthContext";
import "./PlantMapPage.css";

const plantTemplate = [
  {
    zoneName: "Z4 - F",
    slotCodes: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"]
  },
  {
    zoneName: "Z3 - E",
    slotCodes: ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10", "E11", "E12"]
  },
  {
    zoneName: "Z2 - D",
    slotCodes: ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12"]
  },
  {
    zoneName: "Z1 - A/B/C",
    slotCodes: [
      "A1",
      "A2",
      "A3",
      "A4",
      "B1",
      "B2",
      "B3",
      "B4",
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
      "C6",
      "C7"
    ]
  }
];

const colorSetpointZones = [
  {
    zoneName: "Zona 1",
    slotCodes: ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "C5", "C6", "C7"]
  },
  {
    zoneName: "Zona 2",
    slotCodes: ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12"]
  },
  {
    zoneName: "Zona 3",
    slotCodes: ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10", "E11", "E12"]
  },
  {
    zoneName: "Zona 4",
    slotCodes: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"]
  }
];

const oxygenColorNoConfigSlots = new Set(["C2", "D11", "E12", "F9"]);
const temperatureColorNoConfigSlots = new Set(["B4", "C6", "D12", "F10"]);

function zoneNameFromSlotCode(slotCode) {
  const prefix = String(slotCode || "").toUpperCase().charAt(0);

  if (["A", "B", "C"].includes(prefix)) {
    return "Zona 1";
  }

  if (prefix === "D") {
    return "Zona 2";
  }

  if (prefix === "E") {
    return "Zona 3";
  }

  if (prefix === "F") {
    return "Zona 4";
  }

  return "Sin zona";
}

function zoneSortOrder(zoneName) {
  switch (zoneName) {
    case "Zona 1":
      return 1;
    case "Zona 2":
      return 2;
    case "Zona 3":
      return 3;
    case "Zona 4":
      return 4;
    default:
      return 5;
  }
}

function slotCodeNumber(slotCode) {
  const match = String(slotCode || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function oxygenColorThresholdsFromCode(slotCode) {
  const prefix = String(slotCode || "").toUpperCase().charAt(0);
  const index = slotCodeNumber(slotCode) || 1;
  const zoneOffset = {
    A: 0,
    B: 0.08,
    C: 0.12,
    D: 0.2,
    E: 0.28,
    F: 0.16
  }[prefix] ?? 0;
  const criticalValue = Number((4.6 + zoneOffset + (index % 3) * 0.07).toFixed(2));
  const lowValue = Number((criticalValue + 1.3 + (index % 4) * 0.05).toFixed(2));
  const highValue = Number((lowValue + 2.1 + (index % 5) * 0.04).toFixed(2));

  return {
    criticalValue,
    lowValue,
    highValue
  };
}

function temperatureColorThresholdsFromCode(slotCode) {
  const prefix = String(slotCode || "").toUpperCase().charAt(0);
  const index = slotCodeNumber(slotCode) || 1;
  const zoneOffset = {
    A: 0.2,
    B: 0.3,
    C: 0.4,
    D: 0.6,
    E: 0.8,
    F: 0.5
  }[prefix] ?? 0.3;
  const criticalValue = Number((27.4 + zoneOffset + (index % 3) * 0.2).toFixed(2));
  const highValue = Number((criticalValue - 3.1 - (index % 4) * 0.15).toFixed(2));
  const lowValue = Number((highValue - 5.4 - (index % 5) * 0.18).toFixed(2));

  return {
    criticalValue,
    highValue,
    lowValue
  };
}

function buildDemoOxygenColorSetpoints() {
  const now = Date.now();

  return colorSetpointZones
    .flatMap((zone) =>
      zone.slotCodes.map((slotCode, index) => {
        const hasSetpoint = !oxygenColorNoConfigSlots.has(slotCode);
        const thresholds = oxygenColorThresholdsFromCode(slotCode);

        return {
          slotCode,
          zoneName: zone.zoneName,
          criticalValue: hasSetpoint ? thresholds.criticalValue : null,
          lowValue: hasSetpoint ? thresholds.lowValue : null,
          highValue: hasSetpoint ? thresholds.highValue : null,
          updatedAt: hasSetpoint ? new Date(now - (index % 6) * 3600 * 1000).toISOString() : null
        };
      })
    )
    .sort(
      (left, right) =>
        zoneSortOrder(left.zoneName) - zoneSortOrder(right.zoneName) ||
        slotCodeNumber(left.slotCode) - slotCodeNumber(right.slotCode) ||
        left.slotCode.localeCompare(right.slotCode)
    );
}

function buildDemoTemperatureColorSetpoints() {
  const now = Date.now();

  return colorSetpointZones
    .flatMap((zone) =>
      zone.slotCodes.map((slotCode, index) => {
        const hasSetpoint = !temperatureColorNoConfigSlots.has(slotCode);
        const thresholds = temperatureColorThresholdsFromCode(slotCode);

        return {
          slotCode,
          zoneName: zone.zoneName,
          criticalValue: hasSetpoint ? thresholds.criticalValue : null,
          highValue: hasSetpoint ? thresholds.highValue : null,
          lowValue: hasSetpoint ? thresholds.lowValue : null,
          updatedAt: hasSetpoint ? new Date(now - (index % 5) * 3600 * 1000).toISOString() : null
        };
      })
    )
    .sort(
      (left, right) =>
        zoneSortOrder(left.zoneName) - zoneSortOrder(right.zoneName) ||
        slotCodeNumber(left.slotCode) - slotCodeNumber(right.slotCode) ||
        left.slotCode.localeCompare(right.slotCode)
    );
}

function buildDemoMetricsForSlot(slotCode, oxygenSetpoint, temperatureSetpoint) {
  const index = slotCodeNumber(slotCode) || 1;
  const now = Date.now();
  const recordedAt = new Date(now - (index % 10) * 2 * 60000).toISOString();

  let oxygenValue = 6.2 + (index % 5) * 0.28;
  const oxygenCritical = Number(oxygenSetpoint?.criticalValue);
  const oxygenLow = Number(oxygenSetpoint?.lowValue);
  const oxygenHigh = Number(oxygenSetpoint?.highValue);

  if ([oxygenCritical, oxygenLow, oxygenHigh].every(Number.isFinite)) {
    switch (index % 4) {
      case 0:
        oxygenValue = oxygenCritical - 0.22;
        break;
      case 1:
        oxygenValue = (oxygenCritical + oxygenLow) / 2;
        break;
      case 2:
        oxygenValue = (oxygenLow + oxygenHigh) / 2;
        break;
      default:
        oxygenValue = oxygenHigh + 0.32;
        break;
    }
  }

  let temperatureValue = 18 + (index % 6) * 0.85;
  const temperatureCritical = Number(temperatureSetpoint?.criticalValue);
  const temperatureHigh = Number(temperatureSetpoint?.highValue);
  const temperatureLow = Number(temperatureSetpoint?.lowValue);

  if ([temperatureCritical, temperatureHigh, temperatureLow].every(Number.isFinite)) {
    switch ((index + 1) % 4) {
      case 0:
        temperatureValue = temperatureCritical + 0.35;
        break;
      case 1:
        temperatureValue = (temperatureCritical + temperatureHigh) / 2;
        break;
      case 2:
        temperatureValue = (temperatureHigh + temperatureLow) / 2;
        break;
      default:
        temperatureValue = temperatureLow - 0.45;
        break;
    }
  }

  const salinityValue = 31 + (index % 5) * 0.7;
  const conductivityValue = salinityValue * 1.5;
  const phValue = 7.2 + ((index % 7) - 3) * 0.07;
  const turbidityValue = 7.5 + (index % 8) * 1.1;

  return {
    updatedAt: recordedAt,
    metrics: {
      oxygen: {
        value: Number(oxygenValue.toFixed(2)),
        unit: "mg/L",
        recordedAt
      },
      temperature: {
        value: Number(temperatureValue.toFixed(2)),
        unit: "C",
        recordedAt
      },
      salinity: {
        value: Number(salinityValue.toFixed(2)),
        unit: "ppt",
        recordedAt
      },
      conductivity: {
        value: Number(conductivityValue.toFixed(2)),
        unit: "mS/cm",
        recordedAt
      },
      turbidity: {
        value: Number(turbidityValue.toFixed(2)),
        unit: "NTU",
        recordedAt
      },
      ph: {
        value: Number(phValue.toFixed(2)),
        unit: "pH",
        recordedAt
      }
    }
  };
}

function buildTrendPreviewPreviousMetrics(slotCode, currentMetrics) {
  const index = slotCodeNumber(slotCode) || 1;
  const trendCycle = ["up", "down", "flat"];
  const sensorConfig = [
    { key: "oxygen", step: 0.18, min: 0, offset: 0 },
    { key: "temperature", step: 0.35, min: -20, offset: 1 },
    { key: "turbidity", step: 0.6, min: 0, offset: 2 },
    { key: "ph", step: 0.04, min: 0, offset: 3 },
    { key: "salinity", step: 0.4, min: 0, offset: 4 },
    { key: "conductivity", step: 0.55, min: 0, offset: 5 }
  ];
  const previousMetrics = {};

  for (const config of sensorConfig) {
    const currentMetric = currentMetrics?.[config.key];
    const currentValue = Number(currentMetric?.value);

    if (!Number.isFinite(currentValue)) {
      continue;
    }

    const direction = trendCycle[(index + config.offset) % trendCycle.length];
    let previousValue = currentValue;

    if (direction === "up") {
      previousValue = currentValue - config.step;
    } else if (direction === "down") {
      previousValue = currentValue + config.step;
    }

    const boundedValue = Math.max(config.min, previousValue);
    const currentRecordedAt = new Date(currentMetric?.recordedAt || Date.now()).getTime();
    const previousRecordedAt = new Date(currentRecordedAt - 15 * 60 * 1000).toISOString();

    previousMetrics[config.key] = {
      value: Number(boundedValue.toFixed(2)),
      unit: currentMetric?.unit,
      recordedAt: previousRecordedAt
    };
  }

  return previousMetrics;
}

function isFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric);
}

function classifyOxygenState(oxygenValue, setpoint) {
  if (!isFiniteNumber(oxygenValue) || !setpoint) {
    return "unknown";
  }

  const criticalValue = Number(setpoint.criticalValue);
  const lowValue = Number(setpoint.lowValue);
  const highValue = Number(setpoint.highValue);

  if (![criticalValue, lowValue, highValue].every(Number.isFinite)) {
    return "unknown";
  }

  const value = Number(oxygenValue);

  if (value < criticalValue) {
    return "critical";
  }

  if (value < lowValue) {
    return "low";
  }

  if (value < highValue) {
    return "normal";
  }

  return "high";
}

function classifyTemperatureState(temperatureValue, setpoint) {
  if (!isFiniteNumber(temperatureValue) || !setpoint) {
    return "unknown";
  }

  const criticalValue = Number(setpoint.criticalValue);
  const highValue = Number(setpoint.highValue);
  const lowValue = Number(setpoint.lowValue);

  if (![criticalValue, highValue, lowValue].every(Number.isFinite)) {
    return "unknown";
  }

  const value = Number(temperatureValue);

  if (value > criticalValue) {
    return "critical";
  }

  if (value > highValue) {
    return "high";
  }

  if (value > lowValue) {
    return "normal";
  }

  return "low";
}

function extractSlotCandidates(name) {
  const normalized = String(name || "").toUpperCase();
  const explicitCodes = Array.from(normalized.matchAll(/\b([A-F]\d{1,2})\b/g)).map(
    (match) => match[1]
  );
  const singleLetters = Array.from(normalized.matchAll(/\b([A-F])\b/g)).map((match) => match[1]);

  const candidates = [...explicitCodes];

  for (const letter of singleLetters) {
    candidates.push(`${letter}1`);
  }

  return [...new Set(candidates)];
}

function formatMetric(metric, options = {}) {
  const { includeUnit = true } = options;

  if (!metric) return "--";
  const numericValue = Number(metric.value);

  if (!Number.isFinite(numericValue)) {
    return "--";
  }

  const decimals = Math.abs(numericValue) >= 10 ? 1 : 2;

  if (!includeUnit) {
    return numericValue.toFixed(decimals);
  }

  return `${numericValue.toFixed(decimals)} ${metric.unit || ""}`.trim();
}

function buildSaturationMetric(metrics) {
  const oxygenValue = Number(metrics?.oxygen?.value);
  if (!Number.isFinite(oxygenValue)) {
    return null;
  }

  const temperatureValue = Number(metrics?.temperature?.value);
  const salinityValue = Number(metrics?.salinity?.value);
  let oxygenAtSaturation = 9.08;

  if (Number.isFinite(temperatureValue)) {
    const clampedTemp = Math.max(0, Math.min(40, temperatureValue));
    oxygenAtSaturation =
      14.652 -
      0.41022 * clampedTemp +
      0.007991 * clampedTemp * clampedTemp -
      0.000077774 * clampedTemp * clampedTemp * clampedTemp;
  }

  if (Number.isFinite(salinityValue)) {
    const salinityCorrection = Math.max(0.55, 1 - salinityValue * 0.0055);
    oxygenAtSaturation *= salinityCorrection;
  }

  if (!Number.isFinite(oxygenAtSaturation) || oxygenAtSaturation <= 0) {
    return null;
  }

  const saturationPercent = (oxygenValue / oxygenAtSaturation) * 100;

  return {
    value: Math.max(0, Math.min(180, saturationPercent)),
    unit: "%"
  };
}

function buildConductivityMetric(metrics) {
  const conductivityValue = Number(metrics?.conductivity?.value);
  if (Number.isFinite(conductivityValue)) {
    return metrics.conductivity;
  }

  const salinityValue = Number(metrics?.salinity?.value);
  if (!Number.isFinite(salinityValue)) {
    return null;
  }

  return {
    value: Number((salinityValue * 1.5).toFixed(2)),
    unit: "mS/cm",
    recordedAt: metrics?.salinity?.recordedAt || null,
    estimated: true
  };
}

function relativeTimeLabel(timestamp) {
  if (!timestamp) return "Sin datos";

  const elapsedMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.round(elapsedMs / 60000);

  if (minutes <= 0) return "Ahora";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  return `${hours} h`;
}

function tileStatusLabel(status) {
  switch (status) {
    case "ok":
      return "Operativa";
    case "alarm":
      return "En alarma";
    case "stale":
      return "Dato atrasado";
    case "unknown":
      return "Sin datos";
    case "template":
      return "Sin vincular";
    default:
      return "Desconocido";
  }
}

function metricTrendDirection(currentMetric, previousMetric, minTolerance = 0) {
  const current = Number(currentMetric?.value);
  const previous = Number(previousMetric?.value);

  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return "none";
  }

  const delta = current - previous;
  const tolerance = Math.max(minTolerance, Math.abs(previous) * 0.01);

  if (Math.abs(delta) <= tolerance) {
    return "flat";
  }

  return delta > 0 ? "up" : "down";
}

function trendArrow(direction) {
  switch (direction) {
    case "up":
      return "▲";
    case "down":
      return "▼";
    case "flat":
      return "→";
    default:
      return "•";
  }
}

function trendLabel(direction) {
  switch (direction) {
    case "up":
      return "Sube";
    case "down":
      return "Baja";
    case "flat":
      return "Estable";
    default:
      return "Sin dato previo";
  }
}

function trendToneBySensor(sensorType, direction, metric) {
  if (sensorType === "ph") {
    const phValue = Number(metric?.value);

    if (!Number.isFinite(phValue)) {
      return "neutral";
    }

    return phValue >= 6.5 && phValue <= 8.5 ? "good" : "bad";
  }

  if (direction === "none" || direction === "flat") {
    return "neutral";
  }

  if (sensorType === "temperature") {
    return direction === "down" ? "good" : "bad";
  }

  if (sensorType === "oxygen") {
    return direction === "up" ? "good" : "bad";
  }

  if (sensorType === "turbidity") {
    return direction === "down" ? "good" : "bad";
  }

  if (sensorType === "saturation" || sensorType === "conductivity") {
    return direction === "up" ? "good" : "bad";
  }

  return "neutral";
}

const trendToleranceBySensor = {
  oxygen: 0.05,
  temperature: 0.1,
  saturation: 0.5,
  turbidity: 0.1,
  conductivity: 0.15,
  ph: 0.02
};

const waterQualitySensorTypes = new Set([
  "oxygen",
  "temperature",
  "ph",
  "salinity",
  "turbidity",
  "conductivity"
]);

const sensorTypeLabelByKey = {
  oxygen: "Oxigeno",
  temperature: "Temperatura",
  ph: "pH",
  salinity: "Salinidad",
  turbidity: "Turbidez",
  conductivity: "Conductividad"
};

const exportBucketLabelByKey = {
  auto: "Automatico",
  hour: "Por hora",
  day: "Por dia"
};

const exportScheduleOptions = [
  { value: "900000", label: "Cada 15 minutos" },
  { value: "1800000", label: "Cada 30 minutos" },
  { value: "3600000", label: "Cada 1 hora" },
  { value: "21600000", label: "Cada 6 horas" },
  { value: "43200000", label: "Cada 12 horas" },
  { value: "86400000", label: "Cada 24 horas" }
];

const exportScheduleModeOptions = [
  { value: "dailyTimes", label: "Horas fijas" },
  { value: "interval", label: "Intervalo" }
];

const defaultDailyScheduleTimes = "08:00,15:00,20:00";

const exportDatePresetOptions = [
  { value: "24h", label: "Ultimas 24h" },
  { value: "7d", label: "Ultimos 7 dias" },
  { value: "30d", label: "Ultimos 30 dias" },
  { value: "month", label: "Mes actual" },
  { value: "custom", label: "Personalizado" }
];

const exportFormatOptions = [
  {
    value: "xlsx",
    label: "Excel (.xlsx)",
    extension: "xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  },
  {
    value: "csv",
    label: "CSV (.csv)",
    extension: "csv",
    mimeType: "text/csv"
  },
  {
    value: "json",
    label: "JSON (.json)",
    extension: "json",
    mimeType: "application/json"
  }
];

const exportProfileStorageKey = "plant-water-quality-export-profiles-v1";
const exportHistoryStorageKey = "plant-water-quality-export-history-v1";

function readStoredJsonCollection(storageKey, fallbackValue) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return fallbackValue;
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }

    return fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function csvEscape(value) {
  const normalized = value === null || value === undefined ? "" : String(value);
  if (/[,"\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function buildCsvFromRows(rows, headers) {
  const headerLine = headers.map((header) => csvEscape(header)).join(",");
  const bodyLines = rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","));
  return [headerLine, ...bodyLines].join("\n");
}

function downloadBlobFile(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

function toArrayBufferFromString(value) {
  return new TextEncoder().encode(String(value || "")).buffer;
}

function formatDateInputValue(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatFileTimestamp(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}`;
}

function resolveDatePresetRange(presetValue) {
  const now = new Date();

  if (presetValue === "24h") {
    const from = new Date(now);
    from.setDate(from.getDate() - 1);
    return {
      fromDate: formatDateInputValue(from),
      toDate: formatDateInputValue(now)
    };
  }

  if (presetValue === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return {
      fromDate: formatDateInputValue(from),
      toDate: formatDateInputValue(now)
    };
  }

  if (presetValue === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      fromDate: formatDateInputValue(from),
      toDate: formatDateInputValue(now)
    };
  }

  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  return {
    fromDate: formatDateInputValue(from),
    toDate: formatDateInputValue(now)
  };
}

function resolveExportDateRange(fromDateValue, toDateValue) {
  const fromDate = new Date(`${fromDateValue}T00:00:00`);
  const toDate = new Date(`${toDateValue}T23:59:59.999`);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error("Selecciona un rango de fechas valido.");
  }

  if (toDate.getTime() < fromDate.getTime()) {
    throw new Error("La fecha fin debe ser mayor o igual que la fecha inicio.");
  }

  return {
    fromDate,
    toDate,
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString()
  };
}

function toFiniteNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return window.btoa(binary);
}

function parseRecipientEmails(rawValue) {
  return Array.from(
    new Set(
      String(rawValue || "")
        .split(/[;,\s]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function normalizeDailyTimeToken(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDailyScheduleTimes(rawValue) {
  const timeTokens = String(rawValue || "")
    .split(/[\s,;]+/)
    .map((item) => normalizeDailyTimeToken(item))
    .filter(Boolean);

  return Array.from(new Set(timeTokens));
}

function createEmailTemplateContext({
  fromDate,
  toDate,
  bucketLabel,
  formatLabel,
  rowCount,
  sensorCount,
  generatedAt,
  requestedBy
}) {
  return {
    fromDate,
    toDate,
    bucket: bucketLabel,
    format: formatLabel,
    rowCount,
    sensorCount,
    generatedAt,
    requestedBy
  };
}

export function PlantMapPage({ mode = "scada" }) {
  const { accessToken, user } = useAuth();
  const scheduledRunKeyRef = useRef("");
  const isReportsSubsection = mode === "reportes";
  const initialPresetRange = resolveDatePresetRange("7d");
  const [selectedDatePreset, setSelectedDatePreset] = useState("7d");
  const [exportFromDate, setExportFromDate] = useState(() => {
    return initialPresetRange.fromDate;
  });
  const [exportToDate, setExportToDate] = useState(() => initialPresetRange.toDate);
  const [exportBucket, setExportBucket] = useState("auto");
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [exportDeliveryMode, setExportDeliveryMode] = useState("download");
  const [exportRecipientEmails, setExportRecipientEmails] = useState("");
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState(
    REPORT_EMAIL_TEMPLATES[0].id
  );
  const [exportEmailSubject, setExportEmailSubject] = useState("");
  const [exportEmailMessage, setExportEmailMessage] = useState("");
  const [selectedSensorTypes, setSelectedSensorTypes] = useState([]);
  const [selectedPondIds, setSelectedPondIds] = useState([]);
  const [includeSummarySheet, setIncludeSummarySheet] = useState(true);
  const [exportSortDirection, setExportSortDirection] = useState("asc");
  const [exportScheduleEnabled, setExportScheduleEnabled] = useState(false);
  const [exportScheduleMode, setExportScheduleMode] = useState("dailyTimes");
  const [exportScheduleIntervalMs, setExportScheduleIntervalMs] = useState("3600000");
  const [exportScheduleDailyTimesText, setExportScheduleDailyTimesText] = useState(
    defaultDailyScheduleTimes
  );
  const [profileDraftName, setProfileDraftName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [savedExportProfiles, setSavedExportProfiles] = useState(() =>
    readStoredJsonCollection(exportProfileStorageKey, [])
  );
  const [exportRunHistory, setExportRunHistory] = useState(() =>
    readStoredJsonCollection(exportHistoryStorageKey, [])
  );
  const [isExportingWaterQuality, setIsExportingWaterQuality] = useState(false);
  const [lastScheduledExportAt, setLastScheduledExportAt] = useState(null);
  const [waterQualityExportFeedback, setWaterQualityExportFeedback] = useState({
    tone: "info",
    message: "Configura filtros, formato y destino para exportar calidad del agua."
  });

  useEffect(() => {
    if (exportRecipientEmails.trim().length > 0) {
      return;
    }

    if (user?.email) {
      setExportRecipientEmails(String(user.email));
    }
  }, [exportRecipientEmails, user?.email]);

  useEffect(() => {
    try {
      localStorage.setItem(exportProfileStorageKey, JSON.stringify(savedExportProfiles));
    } catch {
      // Ignore storage failures and keep session-only state.
    }
  }, [savedExportProfiles]);

  useEffect(() => {
    try {
      localStorage.setItem(exportHistoryStorageKey, JSON.stringify(exportRunHistory));
    } catch {
      // Ignore storage failures and keep session-only state.
    }
  }, [exportRunHistory]);

  const pondsQuery = useQuery({
    queryKey: ["ponds", "plant-map"],
    queryFn: () => pondsRequest(accessToken),
    enabled: !isReportsSubsection
  });

  const latestQuery = useQuery({
    queryKey: ["latest", "plant-map"],
    queryFn: () => latestReadingsRequest(accessToken, 400),
    refetchInterval: 15000,
    enabled: !isReportsSubsection
  });

  const alertsQuery = useQuery({
    queryKey: ["alerts", "open", "plant-map"],
    queryFn: () => alertsRequest(accessToken, "open"),
    refetchInterval: 15000,
    enabled: !isReportsSubsection
  });

  const oxygenColorSetpointsQuery = useQuery({
    queryKey: ["oxygen-color-setpoints", "plant-map"],
    queryFn: () => oxygenColorSetpointsRequest(accessToken),
    refetchInterval: 15000,
    enabled: !isReportsSubsection
  });

  const temperatureColorSetpointsQuery = useQuery({
    queryKey: ["temperature-color-setpoints", "plant-map"],
    queryFn: () => temperatureColorSetpointsRequest(accessToken),
    refetchInterval: 15000,
    enabled: !isReportsSubsection
  });

  const sensorsQuery = useQuery({
    queryKey: ["sensors", "plant-map", "water-quality-export"],
    queryFn: () => sensorsRequest(accessToken),
    enabled: isReportsSubsection
  });

  const waterQualitySensors = useMemo(
    () =>
      (sensorsQuery.data || []).filter((sensor) =>
        waterQualitySensorTypes.has(String(sensor.type || "").toLowerCase())
      ),
    [sensorsQuery.data]
  );

  const waterQualityPondOptions = useMemo(() => {
    const map = new Map();

    for (const sensor of waterQualitySensors) {
      const key = String(sensor.pond_id || "");
      if (!key || map.has(key)) {
        continue;
      }

      map.set(key, {
        pondId: key,
        pondName: sensor.pond_name || `Piscina ${sensor.pond_id || "-"}`
      });
    }

    return Array.from(map.values()).sort((left, right) => left.pondName.localeCompare(right.pondName));
  }, [waterQualitySensors]);

  const filteredWaterQualitySensors = useMemo(() => {
    const selectedTypeSet = selectedSensorTypes.length > 0 ? new Set(selectedSensorTypes) : null;
    const selectedPondSet = selectedPondIds.length > 0 ? new Set(selectedPondIds) : null;

    return waterQualitySensors.filter((sensor) => {
      const sensorType = String(sensor.type || "").toLowerCase();
      const pondId = String(sensor.pond_id || "");

      if (selectedTypeSet && !selectedTypeSet.has(sensorType)) {
        return false;
      }

      if (selectedPondSet && !selectedPondSet.has(pondId)) {
        return false;
      }

      return true;
    });
  }, [waterQualitySensors, selectedSensorTypes, selectedPondIds]);

  const selectedExportSchedule = useMemo(
    () =>
      exportScheduleOptions.find((option) => option.value === exportScheduleIntervalMs)
      || exportScheduleOptions[2],
    [exportScheduleIntervalMs]
  );

  const selectedExportScheduleMode = useMemo(
    () =>
      exportScheduleModeOptions.find((option) => option.value === exportScheduleMode)
      || exportScheduleModeOptions[0],
    [exportScheduleMode]
  );

  const parsedDailyScheduleTimes = useMemo(
    () => parseDailyScheduleTimes(exportScheduleDailyTimesText),
    [exportScheduleDailyTimesText]
  );

  const selectedExportFormat = useMemo(
    () => exportFormatOptions.find((option) => option.value === exportFormat) || exportFormatOptions[0],
    [exportFormat]
  );

  const selectedEmailTemplate = useMemo(
    () => resolveReportEmailTemplate(selectedEmailTemplateId),
    [selectedEmailTemplateId]
  );

  const selectedProfile = useMemo(
    () => savedExportProfiles.find((profile) => profile.id === selectedProfileId) || null,
    [savedExportProfiles, selectedProfileId]
  );

  const alertsByPond = useMemo(() => {
    const map = new Map();

    for (const alert of alertsQuery.data || []) {
      const pondId = alert.pond_id;
      if (!map.has(pondId)) {
        map.set(pondId, []);
      }
      map.get(pondId).push(alert);
    }

    return map;
  }, [alertsQuery.data]);

  const metricsByPond = useMemo(() => {
    const map = new Map();

    const orderedReadings = [...(latestQuery.data || [])].sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );

    for (const reading of orderedReadings) {
      const pondId = reading.pond_id;

      if (!map.has(pondId)) {
        map.set(pondId, {
          metrics: {},
          previousMetrics: {},
          updatedAt: reading.recorded_at
        });
      }

      const current = map.get(pondId);
      const sensorType = reading.sensor_type;

      if (!current.metrics[sensorType]) {
        current.metrics[sensorType] = {
          value: reading.value,
          unit: reading.unit,
          recordedAt: reading.recorded_at
        };
      } else if (!current.previousMetrics[sensorType]) {
        current.previousMetrics[sensorType] = {
          value: reading.value,
          unit: reading.unit,
          recordedAt: reading.recorded_at
        };
      }

      if (new Date(reading.recorded_at).getTime() > new Date(current.updatedAt).getTime()) {
        current.updatedAt = reading.recorded_at;
      }
    }

    return map;
  }, [latestQuery.data]);

  const templateSlots = useMemo(
    () =>
      plantTemplate.flatMap((zone) =>
        zone.slotCodes.map((slotCode) => ({
          zoneName: zone.zoneName,
          slotCode
        }))
      ),
    []
  );

  const oxygenColorSetpointsState = useMemo(() => {
    const rows = oxygenColorSetpointsQuery.data || [];

    if (rows.length > 0) {
      const normalizedRows = rows
        .map((row) => ({
          slotCode: row.slot_code,
          zoneName: row.zone_name || zoneNameFromSlotCode(row.slot_code),
          criticalValue: row.critical_value,
          lowValue: row.low_value,
          highValue: row.high_value,
          updatedAt: row.updated_at || null
        }))
        .sort(
          (left, right) =>
            zoneSortOrder(left.zoneName) - zoneSortOrder(right.zoneName) ||
            slotCodeNumber(left.slotCode) - slotCodeNumber(right.slotCode) ||
            left.slotCode.localeCompare(right.slotCode)
        );

      return {
        rows: normalizedRows,
        isDemo: false
      };
    }

    return {
      rows: buildDemoOxygenColorSetpoints(),
      isDemo: true
    };
  }, [oxygenColorSetpointsQuery.data]);

  const temperatureColorSetpointsState = useMemo(() => {
    const rows = temperatureColorSetpointsQuery.data || [];

    if (rows.length > 0) {
      const normalizedRows = rows
        .map((row) => ({
          slotCode: row.slot_code,
          zoneName: row.zone_name || zoneNameFromSlotCode(row.slot_code),
          criticalValue: row.critical_value,
          highValue: row.high_value,
          lowValue: row.low_value,
          updatedAt: row.updated_at || null
        }))
        .sort(
          (left, right) =>
            zoneSortOrder(left.zoneName) - zoneSortOrder(right.zoneName) ||
            slotCodeNumber(left.slotCode) - slotCodeNumber(right.slotCode) ||
            left.slotCode.localeCompare(right.slotCode)
        );

      return {
        rows: normalizedRows,
        isDemo: false
      };
    }

    return {
      rows: buildDemoTemperatureColorSetpoints(),
      isDemo: true
    };
  }, [temperatureColorSetpointsQuery.data]);

  const oxygenColorBySlot = useMemo(
    () => new Map(oxygenColorSetpointsState.rows.map((row) => [row.slotCode, row])),
    [oxygenColorSetpointsState.rows]
  );

  const temperatureColorBySlot = useMemo(
    () => new Map(temperatureColorSetpointsState.rows.map((row) => [row.slotCode, row])),
    [temperatureColorSetpointsState.rows]
  );

  const pondTiles = useMemo(() => {
    const availablePonds = pondsQuery.data || [];
    const assignmentBySlot = new Map();
    const usedSlots = new Set();
    const templateCodeSet = new Set(templateSlots.map((slot) => slot.slotCode));
    const unassigned = [];

    for (const pond of availablePonds) {
      const candidates = extractSlotCandidates(pond.external_code || pond.name);
      const targetSlot = candidates.find(
        (candidate) => templateCodeSet.has(candidate) && !usedSlots.has(candidate)
      );

      if (targetSlot) {
        assignmentBySlot.set(targetSlot, pond);
        usedSlots.add(targetSlot);
      } else {
        unassigned.push(pond);
      }
    }

    const freeSlots = templateSlots.filter((slot) => !usedSlots.has(slot.slotCode));

    for (let index = 0; index < unassigned.length && index < freeSlots.length; index += 1) {
      assignmentBySlot.set(freeSlots[index].slotCode, unassigned[index]);
    }

    return templateSlots.map((slot) => {
      const pond = assignmentBySlot.get(slot.slotCode) || null;
      const pondMetrics = pond
        ? metricsByPond.get(pond.id) || { metrics: {}, previousMetrics: {}, updatedAt: null }
        : null;
      const pondAlerts = pond ? alertsByPond.get(pond.id) || [] : [];
      const oxygenSetpoint = oxygenColorBySlot.get(slot.slotCode) || null;
      const temperatureSetpoint = temperatureColorBySlot.get(slot.slotCode) || null;
      const shouldUseDemoMetrics = !pond || !pondMetrics?.updatedAt;
      const demoMetricsPack = shouldUseDemoMetrics
        ? buildDemoMetricsForSlot(slot.slotCode, oxygenSetpoint, temperatureSetpoint)
        : null;
      const resolvedMetrics = {
        ...(demoMetricsPack?.metrics || {}),
        ...(pondMetrics?.metrics || {})
      };
      const fallbackPreviousMetrics = buildTrendPreviewPreviousMetrics(slot.slotCode, resolvedMetrics);
      const resolvedPreviousMetrics = {
        ...fallbackPreviousMetrics,
        ...(pondMetrics?.previousMetrics || {})
      };
      const resolvedUpdatedAt = pondMetrics?.updatedAt || demoMetricsPack?.updatedAt || null;
      const oxygenMetricValue = Number(resolvedMetrics?.oxygen?.value);
      const temperatureMetricValue = Number(resolvedMetrics?.temperature?.value);
      const oxygenState = classifyOxygenState(oxygenMetricValue, oxygenSetpoint);
      const temperatureState = classifyTemperatureState(temperatureMetricValue, temperatureSetpoint);
      const hasRealtimeData = Boolean(pondMetrics?.updatedAt);
      const isDemoData = Boolean(demoMetricsPack);

      let status = "template";
      if (pond || isDemoData) {
        status = "ok";

        if (pondAlerts.length > 0) {
          status = "alarm";
        } else if (!resolvedUpdatedAt) {
          status = "unknown";
        } else if (
          hasRealtimeData &&
          Date.now() - new Date(pondMetrics.updatedAt).getTime() > 20 * 60 * 1000
        ) {
          status = "stale";
        }
      }

      return {
        key: pond ? `pond-${pond.id}` : `slot-${slot.slotCode}`,
        pondId: pond?.id || null,
        configured: Boolean(pond),
        shortCode: slot.slotCode,
        zoneName: slot.zoneName,
        name: pond ? pond.name : `Piscina ${slot.slotCode}`,
        species: pond ? pond.species : "Sin vincular",
        updatedAt: resolvedUpdatedAt,
        metrics: resolvedMetrics,
        previousMetrics: resolvedPreviousMetrics,
        alerts: pondAlerts,
        status,
        oxygenState,
        temperatureState,
        dataSource: hasRealtimeData ? "real" : isDemoData ? "demo" : "none"
      };
    });
  }, [
    pondsQuery.data,
    metricsByPond,
    alertsByPond,
    templateSlots,
    oxygenColorBySlot,
    temperatureColorBySlot
  ]);

  const summary = useMemo(() => {
    const total = pondTiles.length;
    const configured = pondTiles.filter((item) => item.configured).length;
    const inAlarm = pondTiles.filter((item) => item.status === "alarm").length;
    const stale = pondTiles.filter((item) => item.status === "stale" || item.status === "unknown").length;
    const unlinked = total - configured;

    return {
      total,
      configured,
      inAlarm,
      stale,
      unlinked,
      healthy: Math.max(configured - inAlarm - stale, 0)
    };
  }, [pondTiles]);

  const scadaDataState = useMemo(() => {
    const demoTiles = pondTiles.filter((tile) => tile.dataSource === "demo").length;
    const realTiles = pondTiles.filter((tile) => tile.dataSource === "real").length;

    return {
      demoTiles,
      realTiles,
      isDemoFallback: demoTiles > 0 && realTiles === 0
    };
  }, [pondTiles]);

  const scadaTableRows = useMemo(
    () =>
      pondTiles.map((tile) => {
        const saturationMetric = buildSaturationMetric(tile.metrics);
        const previousSaturationMetric = buildSaturationMetric(tile.previousMetrics);
        const conductivityMetric = buildConductivityMetric(tile.metrics);
        const previousConductivityMetric = buildConductivityMetric(tile.previousMetrics);
        const hasDirectConductivity = Number.isFinite(Number(tile.metrics?.conductivity?.value));

        return {
          ...tile,
          saturationMetric,
          conductivityMetric,
          isConductivityEstimated: Boolean(conductivityMetric) && !hasDirectConductivity,
          statusLabel: tileStatusLabel(tile.status),
          trends: {
            temperature: metricTrendDirection(
              tile.metrics.temperature,
              tile.previousMetrics.temperature,
              trendToleranceBySensor.temperature
            ),
            oxygen: metricTrendDirection(
              tile.metrics.oxygen,
              tile.previousMetrics.oxygen,
              trendToleranceBySensor.oxygen
            ),
            saturation: metricTrendDirection(
              saturationMetric,
              previousSaturationMetric,
              trendToleranceBySensor.saturation
            ),
            turbidity: metricTrendDirection(
              tile.metrics.turbidity,
              tile.previousMetrics.turbidity,
              trendToleranceBySensor.turbidity
            ),
            conductivity: metricTrendDirection(
              conductivityMetric,
              previousConductivityMetric,
              trendToleranceBySensor.conductivity
            ),
            ph: metricTrendDirection(
              tile.metrics.ph,
              tile.previousMetrics.ph,
              trendToleranceBySensor.ph
            )
          }
        };
      }),
    [pondTiles]
  );

  const pondsOutsideScadaTemplate = useMemo(() => {
    const displayedPondIds = new Set(
      pondTiles
        .filter((tile) => tile.configured && tile.pondId)
        .map((tile) => Number(tile.pondId))
    );

    return (pondsQuery.data || []).filter((pond) => !displayedPondIds.has(Number(pond.id)));
  }, [pondTiles, pondsQuery.data]);

  const renderMetricWithTrend = (sensorType, metric, direction, options = {}) => {
    const { valuePrefix = "", ...metricFormatOptions } = options;
    const trendTone = trendToneBySensor(sensorType, direction, metric);
    const title =
      sensorType === "ph"
        ? `Tendencia: ${trendLabel(direction)}. Objetivo pH: 6.5 - 8.5`
        : `Tendencia: ${trendLabel(direction)}`;

    return (
      <span className="scada-metric-with-trend" title={title}>
        <span className={`scada-trend-arrow scada-trend-${trendTone}`}>{trendArrow(direction)}</span>
        <span>{`${valuePrefix}${formatMetric(metric, metricFormatOptions)}`}</span>
      </span>
    );
  };

  const applyDatePreset = (presetValue) => {
    setSelectedDatePreset(presetValue);

    if (presetValue === "custom") {
      return;
    }

    const range = resolveDatePresetRange(presetValue);
    setExportFromDate(range.fromDate);
    setExportToDate(range.toDate);
  };

  const toggleSensorTypeFilter = (sensorType) => {
    setSelectedSensorTypes((current) => {
      if (current.includes(sensorType)) {
        return current.filter((item) => item !== sensorType);
      }

      return [...current, sensorType];
    });
  };

  const togglePondFilter = (pondId) => {
    setSelectedPondIds((current) => {
      if (current.includes(pondId)) {
        return current.filter((item) => item !== pondId);
      }

      return [...current, pondId];
    });
  };

  const applySelectedTemplateToDraft = () => {
    const template = resolveReportEmailTemplate(selectedEmailTemplateId);
    const draftContext = createEmailTemplateContext({
      fromDate: exportFromDate,
      toDate: exportToDate,
      bucketLabel: exportBucketLabelByKey[exportBucket] || "Automatico",
      formatLabel: selectedExportFormat.label,
      rowCount: "n/d",
      sensorCount: filteredWaterQualitySensors.length,
      generatedAt: new Date().toLocaleString("es-ES"),
      requestedBy: user?.email || "usuario"
    });

    setExportEmailSubject(applyEmailTemplate(template.subjectTemplate, draftContext));
    setExportEmailMessage(applyEmailTemplate(template.bodyTemplate, draftContext));
  };

  const saveCurrentProfile = () => {
    const name = profileDraftName.trim();
    if (!name) {
      setWaterQualityExportFeedback({
        tone: "error",
        message: "Indica un nombre para guardar el perfil de exportacion."
      });
      return;
    }

    const profileId = `profile-${Date.now()}`;
    const profile = {
      id: profileId,
      name,
      createdAt: new Date().toISOString(),
      config: {
        selectedDatePreset,
        exportFromDate,
        exportToDate,
        exportBucket,
        exportFormat,
        exportDeliveryMode,
        exportRecipientEmails,
        selectedEmailTemplateId,
        exportEmailSubject,
        exportEmailMessage,
        selectedSensorTypes,
        selectedPondIds,
        includeSummarySheet,
        exportSortDirection,
        exportScheduleEnabled,
        exportScheduleMode,
        exportScheduleIntervalMs,
        exportScheduleDailyTimesText
      }
    };

    setSavedExportProfiles((current) => [profile, ...current].slice(0, 25));
    setSelectedProfileId(profileId);
    setProfileDraftName("");
    setWaterQualityExportFeedback({
      tone: "success",
      message: `Perfil \"${name}\" guardado correctamente.`
    });
  };

  const loadSelectedProfile = () => {
    if (!selectedProfile) {
      setWaterQualityExportFeedback({
        tone: "error",
        message: "Selecciona un perfil guardado para cargarlo."
      });
      return;
    }

    const config = selectedProfile.config || {};
    setSelectedDatePreset(config.selectedDatePreset || "custom");
    setExportFromDate(config.exportFromDate || exportFromDate);
    setExportToDate(config.exportToDate || exportToDate);
    setExportBucket(config.exportBucket || "auto");
    setExportFormat(config.exportFormat || "xlsx");
    setExportDeliveryMode(config.exportDeliveryMode || "download");
    setExportRecipientEmails(config.exportRecipientEmails || "");
    setSelectedEmailTemplateId(config.selectedEmailTemplateId || REPORT_EMAIL_TEMPLATES[0].id);
    setExportEmailSubject(config.exportEmailSubject || "");
    setExportEmailMessage(config.exportEmailMessage || "");
    setSelectedSensorTypes(Array.isArray(config.selectedSensorTypes) ? config.selectedSensorTypes : []);
    setSelectedPondIds(Array.isArray(config.selectedPondIds) ? config.selectedPondIds : []);
    setIncludeSummarySheet(Boolean(config.includeSummarySheet));
    setExportSortDirection(config.exportSortDirection === "desc" ? "desc" : "asc");
    setExportScheduleEnabled(Boolean(config.exportScheduleEnabled));
    setExportScheduleMode(config.exportScheduleMode || "dailyTimes");
    setExportScheduleIntervalMs(config.exportScheduleIntervalMs || "3600000");
    setExportScheduleDailyTimesText(config.exportScheduleDailyTimesText || defaultDailyScheduleTimes);
    setWaterQualityExportFeedback({
      tone: "success",
      message: `Perfil \"${selectedProfile.name}\" cargado.`
    });
  };

  const deleteSelectedProfile = () => {
    if (!selectedProfile) {
      return;
    }

    setSavedExportProfiles((current) => current.filter((profile) => profile.id !== selectedProfile.id));
    setSelectedProfileId("");
    setWaterQualityExportFeedback({
      tone: "info",
      message: `Perfil \"${selectedProfile.name}\" eliminado.`
    });
  };

  const exportWaterQualityToExcel = useCallback(
    async ({ trigger = "manual" } = {}) => {
      if (isExportingWaterQuality) {
        return;
      }

      const shouldEmail = exportDeliveryMode === "email" || exportDeliveryMode === "both";
      const shouldDownload = exportDeliveryMode === "download" || exportDeliveryMode === "both";

      setIsExportingWaterQuality(true);
      setWaterQualityExportFeedback({
        tone: "info",
        message: trigger === "scheduled"
          ? shouldEmail
            ? "Ejecutando envio automatico por correo..."
            : "Ejecutando exportacion automatica..."
          : shouldEmail
            ? "Preparando envio por correo..."
            : "Preparando exportacion en Excel..."
      });

      try {
        const { fromDate, toDate, fromIso, toIso } = resolveExportDateRange(exportFromDate, exportToDate);
        const sensorsToExport = filteredWaterQualitySensors;

        if (sensorsToExport.length === 0) {
          throw new Error("No hay sensores con los filtros seleccionados para exportar.");
        }

        const historyResponses = await Promise.allSettled(
          sensorsToExport.map((sensor) =>
            historyReadingsRequest(accessToken, {
              sensorId: sensor.id,
              from: fromIso,
              to: toIso,
              bucket: exportBucket
            })
          )
        );

        const exportedRows = [];

        for (let index = 0; index < historyResponses.length; index += 1) {
          const response = historyResponses[index];
          const sensor = sensorsToExport[index];

          if (response.status !== "fulfilled") {
            continue;
          }

          const payload = response.value || {};
          const sensorTypeKey = String(sensor.type || payload.sensor?.type || "").toLowerCase();
          const parameterLabel = sensorTypeLabelByKey[sensorTypeKey] || sensorTypeKey || "Sensor";
          const slotCandidate = extractSlotCandidates(sensor.pond_name || "")[0] || null;
          const zoneLabel = slotCandidate ? zoneNameFromSlotCode(slotCandidate) : "Sin zona";

          for (const point of payload.series || []) {
            const bucketDate = point.bucket_start ? new Date(point.bucket_start) : null;
            const bucketIso =
              bucketDate && !Number.isNaN(bucketDate.getTime()) ? bucketDate.toISOString() : "";

            exportedRows.push({
              bucketIso,
              Fecha: bucketIso ? new Date(bucketIso).toLocaleString("es-ES") : "",
              Zona: zoneLabel,
              Piscina: sensor.pond_name || `Piscina ${sensor.pond_id || "-"}`,
              Sensor: sensor.name || `Sensor ${sensor.id}`,
              Parametro: parameterLabel,
              Unidad: sensor.unit || payload.sensor?.unit || "",
              Bucket: exportBucketLabelByKey[payload.bucket] || exportBucketLabelByKey[exportBucket] || "Auto",
              Promedio: toFiniteNumberOrNull(point.avg_value),
              Minimo: toFiniteNumberOrNull(point.min_value),
              Maximo: toFiniteNumberOrNull(point.max_value),
              Muestras: Number(point.samples) || 0
            });
          }
        }

        if (exportedRows.length === 0) {
          throw new Error("No hay registros en el rango seleccionado para exportar.");
        }

        const sortComparator = (left, right) =>
          String(left.bucketIso).localeCompare(String(right.bucketIso))
          || String(left.Zona).localeCompare(String(right.Zona))
          || String(left.Piscina).localeCompare(String(right.Piscina))
          || String(left.Parametro).localeCompare(String(right.Parametro));
        exportedRows.sort(sortComparator);

        if (exportSortDirection === "desc") {
          exportedRows.reverse();
        }

        const sheetRows = exportedRows.map(({ bucketIso: _bucketIso, ...row }) => row);
        const headers = [
          "Fecha",
          "Zona",
          "Piscina",
          "Sensor",
          "Parametro",
          "Unidad",
          "Bucket",
          "Promedio",
          "Minimo",
          "Maximo",
          "Muestras"
        ];

        const sensorsWithErrors = historyResponses.filter((response) => response.status === "rejected").length;
        const summaryRows = [
          ["Exportado en", new Date().toLocaleString("es-ES")],
          ["Rango desde", fromDate.toLocaleString("es-ES")],
          ["Rango hasta", toDate.toLocaleString("es-ES")],
          ["Agrupacion", exportBucketLabelByKey[exportBucket] || "Automatico"],
          [
            "Destino",
            exportDeliveryMode === "both"
              ? "Descarga + Correo"
              : shouldEmail
                ? "Correo electronico"
                : "Descarga local"
          ],
          ["Formato", selectedExportFormat.label],
          ["Sensores consultados", sensorsToExport.length],
          ["Sensores con error", sensorsWithErrors],
          ["Filas exportadas", sheetRows.length],
          [
            "Filtros parametros",
            selectedSensorTypes.length > 0
              ? selectedSensorTypes
                .map((item) => sensorTypeLabelByKey[item] || item)
                .join(", ")
              : "Todos"
          ],
          [
            "Filtros piscinas",
            selectedPondIds.length > 0
              ? selectedPondIds
                .map((pondId) =>
                  waterQualityPondOptions.find((option) => option.pondId === pondId)?.pondName || pondId
                )
                .join(", ")
              : "Todas"
          ]
        ];

        const fileBaseName = `calidad-agua-${formatFileTimestamp(fromDate)}-${formatFileTimestamp(toDate)}`;
        const fileName = `${fileBaseName}.${selectedExportFormat.extension}`;
        let attachmentBuffer = null;
        let attachmentMimeType = selectedExportFormat.mimeType;

        if (selectedExportFormat.value === "xlsx") {
          const XLSX = await import("xlsx");
          const workbook = XLSX.utils.book_new();
          const readingsSheet = XLSX.utils.json_to_sheet(sheetRows, {
            header: headers
          });
          XLSX.utils.book_append_sheet(workbook, readingsSheet, "CalidadAgua");

          if (includeSummarySheet) {
            const infoSheet = XLSX.utils.aoa_to_sheet(summaryRows);
            XLSX.utils.book_append_sheet(workbook, infoSheet, "Resumen");
          }

          if (shouldDownload) {
            XLSX.writeFile(workbook, fileName);
          }

          if (shouldEmail) {
            attachmentBuffer = XLSX.write(workbook, {
              bookType: "xlsx",
              type: "array"
            });
          }
        } else if (selectedExportFormat.value === "csv") {
          const csvText = buildCsvFromRows(sheetRows, headers);

          if (shouldDownload) {
            const csvBlob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
            downloadBlobFile(csvBlob, fileName);
          }

          if (shouldEmail) {
            attachmentBuffer = toArrayBufferFromString(csvText);
          }
        } else {
          const jsonPayload = {
            generatedAt: new Date().toISOString(),
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            bucket: exportBucket,
            filters: {
              sensorTypes: selectedSensorTypes,
              pondIds: selectedPondIds
            },
            summary: Object.fromEntries(summaryRows.map((row) => [row[0], row[1]])),
            rows: sheetRows
          };
          const jsonText = JSON.stringify(jsonPayload, null, 2);

          if (shouldDownload) {
            const jsonBlob = new Blob([jsonText], { type: "application/json;charset=utf-8;" });
            downloadBlobFile(jsonBlob, fileName);
          }

          if (shouldEmail) {
            attachmentBuffer = toArrayBufferFromString(jsonText);
          }
        }

        if (shouldEmail) {
          const recipients = parseRecipientEmails(exportRecipientEmails);

          if (recipients.length === 0) {
            throw new Error("Indica al menos un correo destinatario para el envio.");
          }

          if (!attachmentBuffer || attachmentBuffer.byteLength === 0) {
            throw new Error("No se pudo construir el adjunto para correo.");
          }

          if (attachmentBuffer.byteLength > 8 * 1024 * 1024) {
            throw new Error("El archivo supera 8 MB. Reduce el rango de fechas para enviarlo por correo.");
          }

          const attachmentBase64 = arrayBufferToBase64(attachmentBuffer);
          const templateContext = createEmailTemplateContext({
            fromDate: fromDate.toISOString().slice(0, 10),
            toDate: toDate.toISOString().slice(0, 10),
            bucketLabel: exportBucketLabelByKey[exportBucket] || "Automatico",
            formatLabel: selectedExportFormat.label,
            rowCount: sheetRows.length,
            sensorCount: sensorsToExport.length,
            generatedAt: new Date().toLocaleString("es-ES"),
            requestedBy: user?.email || "usuario"
          });
          const subjectFromTemplate = applyEmailTemplate(
            selectedEmailTemplate.subjectTemplate,
            templateContext
          );
          const messageFromTemplate = applyEmailTemplate(
            selectedEmailTemplate.bodyTemplate,
            templateContext
          );

          await waterQualityEmailReportRequest(accessToken, {
            recipients,
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            bucket: exportBucket,
            fileName,
            attachmentBase64,
            mimeType: attachmentMimeType,
            subject: exportEmailSubject.trim() || subjectFromTemplate,
            message: exportEmailMessage.trim() || messageFromTemplate
          });
        }

        if (trigger === "scheduled") {
          setLastScheduledExportAt(new Date().toISOString());
        }

        setExportRunHistory((current) => {
          const entry = {
            id: `run-${Date.now()}`,
            at: new Date().toISOString(),
            trigger,
            format: selectedExportFormat.value,
            delivery: exportDeliveryMode,
            rows: sheetRows.length,
            sensors: sensorsToExport.length,
            recipients: shouldEmail ? parseRecipientEmails(exportRecipientEmails).length : 0,
            templateId: shouldEmail ? selectedEmailTemplate.id : null
          };
          return [entry, ...current].slice(0, 20);
        });

        setWaterQualityExportFeedback({
          tone: "success",
          message: shouldEmail && shouldDownload
            ? `Exportacion y envio completados (${selectedExportFormat.label}) con ${sheetRows.length} fila(s).`
            : shouldEmail
              ? `Envio ${trigger === "scheduled" ? "automatico" : "manual"} completado a ${parseRecipientEmails(exportRecipientEmails).length} destinatario(s) con ${sheetRows.length} fila(s).`
              : `Exportacion ${trigger === "scheduled" ? "automatica" : "manual"} completada (${selectedExportFormat.label}) con ${sheetRows.length} fila(s).`
            + (sensorsWithErrors > 0
              ? ` ${sensorsWithErrors} sensor(es) no pudieron leerse en este intento.`
              : "")
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo completar la exportacion.";
        setWaterQualityExportFeedback({
          tone: "error",
          message
        });
      } finally {
        setIsExportingWaterQuality(false);
      }
    },
    [
      accessToken,
      exportBucket,
      exportDeliveryMode,
      exportEmailMessage,
      exportEmailSubject,
      exportFormat,
      exportFromDate,
      exportRecipientEmails,
      exportSortDirection,
      exportToDate,
      filteredWaterQualitySensors,
      includeSummarySheet,
      isExportingWaterQuality,
      selectedEmailTemplate,
      selectedExportFormat,
      selectedPondIds,
      selectedSensorTypes,
      user?.email,
      waterQualityPondOptions
    ]
  );

  useEffect(() => {
    if (!isReportsSubsection || !exportScheduleEnabled) {
      scheduledRunKeyRef.current = "";
      return undefined;
    }

    const requiresRecipients = exportDeliveryMode === "email" || exportDeliveryMode === "both";
    if (requiresRecipients && parseRecipientEmails(exportRecipientEmails).length === 0) {
      return undefined;
    }

    if (exportScheduleMode === "dailyTimes") {
      if (parsedDailyScheduleTimes.length === 0) {
        return undefined;
      }

      const tick = () => {
        const now = new Date();
        const timeToken = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

        if (!parsedDailyScheduleTimes.includes(timeToken)) {
          return;
        }

        const runKey = `${formatDateInputValue(now)} ${timeToken}`;
        if (scheduledRunKeyRef.current === runKey) {
          return;
        }

        scheduledRunKeyRef.current = runKey;
        void exportWaterQualityToExcel({ trigger: "scheduled" });
      };

      tick();
      const dailyTimerId = window.setInterval(tick, 30_000);

      return () => {
        window.clearInterval(dailyTimerId);
      };
    }

    const intervalMs = Number(exportScheduleIntervalMs);

    if (!Number.isFinite(intervalMs) || intervalMs < 60_000) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      void exportWaterQualityToExcel({ trigger: "scheduled" });
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [
    isReportsSubsection,
    exportScheduleEnabled,
    exportScheduleMode,
    parsedDailyScheduleTimes,
    exportScheduleIntervalMs,
    exportDeliveryMode,
    exportRecipientEmails,
    exportWaterQualityToExcel
  ]);

  return (
    <section className="plant-page">
      {!isReportsSubsection ? (
      <article className="panel plant-summary-panel">
        <h3>Plano de planta SCADA</h3>
        <p className="plant-summary-text">
          Vista tabular operativa con estado por piscina, alertas activas y últimas lecturas de
          sensores en tiempo real o demo.
        </p>
        {scadaDataState.isDemoFallback ? (
          <p className="plant-demo-note">
            No se detectan lecturas en tiempo real. Se muestran datos demo por piscina y el fondo
            se calcula con las consignas PLC de oxígeno configuradas.
          </p>
        ) : null}

        <div className="plant-summary-grid">
          <div className="plant-stat plant-stat-registered">
            <span>Piscinas registradas</span>
            <strong>{(pondsQuery.data || []).length}</strong>
          </div>
          <div className="plant-stat">
            <span>Total piscinas</span>
            <strong>{summary.total}</strong>
          </div>
          <div className="plant-stat plant-stat-configured">
            <span>Vinculadas con datos</span>
            <strong>{summary.configured}</strong>
          </div>
          <div className="plant-stat plant-stat-alarm">
            <span>En alarma</span>
            <strong>{summary.inAlarm}</strong>
          </div>
          <div className="plant-stat plant-stat-stale">
            <span>Sin vincular</span>
            <strong>{summary.unlinked}</strong>
          </div>
        </div>

        {pondsOutsideScadaTemplate.length > 0 ? (
          <p className="plant-template-overflow-note">
            Hay {pondsOutsideScadaTemplate.length} piscina(s) registrada(s) fuera del plano SCADA actual.
            Se muestran abajo para que no se pierdan.
          </p>
        ) : null}
      </article>
      ) : null}

      {isReportsSubsection ? (
      <article className="panel plant-export-panel">
        <header className="plant-export-head">
          <h3>Subsección: reportes calidad del agua</h3>
          <p>
            Genera reportes de calidad de agua con filtros avanzados por fecha, parametro y piscina.
            Puedes exportar en XLSX, CSV o JSON, y entregarlo por descarga, correo o ambos.
          </p>
        </header>

        <div className="plant-export-presets">
          {exportDatePresetOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`plant-export-preset-chip ${selectedDatePreset === option.value ? "plant-export-preset-chip-active" : ""}`}
              onClick={() => applyDatePreset(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="plant-export-controls">
          <label className="plant-export-field">
            <span>Fecha inicio</span>
            <input
              type="date"
              value={exportFromDate}
              onChange={(event) => {
                setExportFromDate(event.target.value);
                setSelectedDatePreset("custom");
              }}
            />
          </label>

          <label className="plant-export-field">
            <span>Fecha fin</span>
            <input
              type="date"
              value={exportToDate}
              onChange={(event) => {
                setExportToDate(event.target.value);
                setSelectedDatePreset("custom");
              }}
            />
          </label>

          <label className="plant-export-field">
            <span>Agrupacion</span>
            <select
              value={exportBucket}
              onChange={(event) => setExportBucket(event.target.value)}
            >
              <option value="auto">Automatico</option>
              <option value="hour">Por hora</option>
              <option value="day">Por dia</option>
            </select>
          </label>

          <label className="plant-export-field">
            <span>Formato</span>
            <select
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value)}
            >
              {exportFormatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="plant-export-field">
            <span>Orden temporal</span>
            <select
              value={exportSortDirection}
              onChange={(event) => setExportSortDirection(event.target.value)}
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </label>

          <label className="plant-export-field">
            <span>Destino</span>
            <select
              value={exportDeliveryMode}
              onChange={(event) => setExportDeliveryMode(event.target.value)}
            >
              <option value="download">Descarga local</option>
              <option value="email">Correo</option>
              <option value="both">Descarga + correo</option>
            </select>
          </label>
        </div>

        {(exportDeliveryMode === "email" || exportDeliveryMode === "both") ? (
          <>
            <label className="plant-export-field plant-export-field-wide">
              <span>Destinatarios (separados por coma)</span>
              <input
                type="text"
                value={exportRecipientEmails}
                onChange={(event) => setExportRecipientEmails(event.target.value)}
                placeholder="ejemplo@empresa.com, equipo@empresa.com"
              />
            </label>

            <div className="plant-export-email-template-panel">
              <div className="plant-export-email-template-head">
                <h4>Plantilla de correo</h4>
                <button
                  type="button"
                  className="plant-export-inline-button"
                  onClick={applySelectedTemplateToDraft}
                >
                  Aplicar plantilla
                </button>
              </div>

              <label className="plant-export-field">
                <span>Plantilla</span>
                <select
                  value={selectedEmailTemplateId}
                  onChange={(event) => setSelectedEmailTemplateId(event.target.value)}
                >
                  {REPORT_EMAIL_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="plant-export-field">
                <span>Asunto (opcional)</span>
                <input
                  type="text"
                  value={exportEmailSubject}
                  onChange={(event) => setExportEmailSubject(event.target.value)}
                  placeholder="Si lo dejas vacio se usa la plantilla"
                />
              </label>

              <label className="plant-export-field">
                <span>Mensaje (opcional)</span>
                <textarea
                  value={exportEmailMessage}
                  onChange={(event) => setExportEmailMessage(event.target.value)}
                  rows={5}
                  placeholder="Si lo dejas vacio se usa el cuerpo de la plantilla"
                />
              </label>

              <p className="plant-export-filter-help">
                Variables disponibles: &#123;&#123;fromDate&#125;&#125;, &#123;&#123;toDate&#125;&#125;, &#123;&#123;bucket&#125;&#125;, &#123;&#123;format&#125;&#125;, &#123;&#123;sensorCount&#125;&#125;, &#123;&#123;rowCount&#125;&#125;, &#123;&#123;generatedAt&#125;&#125;, &#123;&#123;requestedBy&#125;&#125;.
              </p>
            </div>
          </>
        ) : null}

        <div className="plant-export-filters">
          <section className="plant-export-filter-block">
            <h4>Filtrar parametros</h4>
            <div className="plant-export-chip-list">
              {Array.from(waterQualitySensorTypes).map((sensorType) => {
                const checked = selectedSensorTypes.includes(sensorType);
                return (
                  <label
                    key={sensorType}
                    className={`plant-export-filter-chip ${checked ? "plant-export-filter-chip-active" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSensorTypeFilter(sensorType)}
                    />
                    <span>{sensorTypeLabelByKey[sensorType] || sensorType}</span>
                  </label>
                );
              })}
            </div>
            <div className="plant-export-filter-actions">
              <button
                type="button"
                className="plant-export-inline-button"
                onClick={() => setSelectedSensorTypes(Array.from(waterQualitySensorTypes))}
              >
                Seleccionar todos
              </button>
              <button
                type="button"
                className="plant-export-inline-button"
                onClick={() => setSelectedSensorTypes([])}
              >
                Limpiar
              </button>
            </div>
            <p className="plant-export-filter-help">Si no seleccionas ninguno, se exportan todos.</p>
          </section>

          <section className="plant-export-filter-block">
            <h4>Filtrar piscinas</h4>
            <div className="plant-export-chip-list">
              {waterQualityPondOptions.map((option) => {
                const checked = selectedPondIds.includes(option.pondId);
                return (
                  <label
                    key={option.pondId}
                    className={`plant-export-filter-chip ${checked ? "plant-export-filter-chip-active" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePondFilter(option.pondId)}
                    />
                    <span>{option.pondName}</span>
                  </label>
                );
              })}
            </div>
            <div className="plant-export-filter-actions">
              <button
                type="button"
                className="plant-export-inline-button"
                onClick={() => setSelectedPondIds(waterQualityPondOptions.map((option) => option.pondId))}
              >
                Seleccionar todas
              </button>
              <button
                type="button"
                className="plant-export-inline-button"
                onClick={() => setSelectedPondIds([])}
              >
                Limpiar
              </button>
            </div>
            <p className="plant-export-filter-help">Si no seleccionas ninguna, se incluyen todas.</p>
          </section>
        </div>

        <div className="plant-export-toggles">
          <label className="plant-export-scheduler-toggle">
            <input
              type="checkbox"
              checked={includeSummarySheet}
              onChange={(event) => setIncludeSummarySheet(event.target.checked)}
            />
            <span>Incluir resumen contextual (XLSX)</span>
          </label>
        </div>

        <div className="plant-export-scheduler">
          <label className="plant-export-scheduler-toggle">
            <input
              type="checkbox"
              checked={exportScheduleEnabled}
              onChange={(event) => setExportScheduleEnabled(event.target.checked)}
            />
            <span>Programacion periodica</span>
          </label>

          <label className="plant-export-field">
            <span>Modo</span>
            <select
              value={exportScheduleMode}
              onChange={(event) => setExportScheduleMode(event.target.value)}
              disabled={!exportScheduleEnabled}
            >
              {exportScheduleModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {exportScheduleMode === "interval" ? (
            <label className="plant-export-field">
              <span>Frecuencia</span>
              <select
                value={exportScheduleIntervalMs}
                onChange={(event) => setExportScheduleIntervalMs(event.target.value)}
                disabled={!exportScheduleEnabled}
              >
                {exportScheduleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="plant-export-field plant-export-field-wide">
              <span>Horas fijas (HH:mm separadas por coma)</span>
              <input
                type="text"
                value={exportScheduleDailyTimesText}
                onChange={(event) => setExportScheduleDailyTimesText(event.target.value)}
                placeholder="08:00,15:00,20:00"
                disabled={!exportScheduleEnabled}
              />
            </label>
          )}

          <button
            type="button"
            className="plant-export-button"
            onClick={() => {
              void exportWaterQualityToExcel({ trigger: "manual" });
            }}
            disabled={
              isExportingWaterQuality
              || sensorsQuery.isLoading
              || ((exportDeliveryMode === "email" || exportDeliveryMode === "both")
                && parseRecipientEmails(exportRecipientEmails).length === 0)
            }
          >
            {isExportingWaterQuality
              ? (exportDeliveryMode === "email" || exportDeliveryMode === "both")
                ? "Procesando..."
                : "Exportando..."
              : "Ejecutar ahora"}
          </button>

          <button
            type="button"
            className="plant-export-button plant-export-button-secondary"
            onClick={() => {
              void exportWaterQualityToExcel({ trigger: "scheduled" });
            }}
            disabled={
              isExportingWaterQuality
              || ((exportDeliveryMode === "email" || exportDeliveryMode === "both")
                && parseRecipientEmails(exportRecipientEmails).length === 0)
            }
          >
            Ejecutar como programada
          </button>
        </div>

        <div className="plant-export-profiles">
          <h4>Perfiles de exportacion</h4>
          <div className="plant-export-profile-row">
            <input
              type="text"
              value={profileDraftName}
              onChange={(event) => setProfileDraftName(event.target.value)}
              placeholder="Nombre del perfil"
            />
            <button type="button" className="plant-export-button" onClick={saveCurrentProfile}>
              Guardar perfil
            </button>
          </div>
          <div className="plant-export-profile-row">
            <select
              value={selectedProfileId}
              onChange={(event) => setSelectedProfileId(event.target.value)}
            >
              <option value="">Selecciona un perfil...</option>
              {savedExportProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
            <button type="button" className="plant-export-button plant-export-button-secondary" onClick={loadSelectedProfile}>
              Cargar
            </button>
            <button type="button" className="plant-export-button plant-export-button-secondary" onClick={deleteSelectedProfile}>
              Eliminar
            </button>
          </div>
        </div>

        <p className="plant-export-status-note">
          {sensorsQuery.isLoading
            ? "Cargando sensores de calidad del agua..."
            : sensorsQuery.isError
              ? "No se pudieron cargar sensores. Intenta actualizar la pagina."
              : `Sensores disponibles: ${waterQualitySensors.length}. Sensores tras filtros: ${filteredWaterQualitySensors.length}.`}
        </p>

        <p className="plant-export-status-note">
          {exportScheduleEnabled
            ? `Programacion activa (${selectedExportScheduleMode.label.toLowerCase()}${
              exportScheduleMode === "interval"
                ? `: ${selectedExportSchedule.label.toLowerCase()}`
                : `: ${parsedDailyScheduleTimes.join(", ") || "sin horas validas"}`
            }) en modo ${
              exportDeliveryMode === "email"
                ? "correo"
                : exportDeliveryMode === "both"
                  ? "descarga + correo"
                  : "descarga local"
            }.`
            : "Programacion desactivada."}
          {lastScheduledExportAt
            ? ` Ultima ejecucion automatica: ${new Date(lastScheduledExportAt).toLocaleString("es-ES")}.`
            : ""}
        </p>

        {exportRunHistory.length > 0 ? (
          <div className="plant-export-history">
            <div className="plant-export-history-head">
              <h4>Ultimas ejecuciones</h4>
              <button
                type="button"
                className="plant-export-inline-button"
                onClick={() => setExportRunHistory([])}
              >
                Limpiar historial
              </button>
            </div>
            <ul>
              {exportRunHistory.slice(0, 8).map((entry) => (
                <li key={entry.id}>
                  <strong>{new Date(entry.at).toLocaleString("es-ES")}</strong>
                  <span>
                    {entry.trigger === "scheduled" ? "Automatica" : "Manual"} · {entry.delivery} · {entry.format}
                    · filas {entry.rows} · sensores {entry.sensors}
                    {entry.templateId ? ` · plantilla ${entry.templateId}` : ""}
                    {entry.recipients ? ` · destinatarios ${entry.recipients}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className={`plant-export-feedback plant-export-feedback-${waterQualityExportFeedback.tone}`}>
          {waterQualityExportFeedback.message}
        </p>
      </article>
      ) : null}

      {!isReportsSubsection && pondsOutsideScadaTemplate.length > 0 ? (
        <article className="panel plant-template-overflow-panel">
          <h3>Piscinas fuera de plantilla SCADA</h3>
          <p>
            Estas piscinas existen en catálogo, pero no tienen slot disponible en el plano fijo.
          </p>
          <div className="plant-template-overflow-list">
            {pondsOutsideScadaTemplate.map((pond) => (
              <span key={`outside-${pond.id}`} className="plant-template-overflow-chip">
                {pond.name}
              </span>
            ))}
          </div>
        </article>
      ) : null}

      {!isReportsSubsection ? (
      <article className="panel scada-panel">
        <header className="scada-header">
          <h3>Tabla operativa SCADA</h3>
          <div className="scada-header-meta">
            <span>Actualizado: {new Date().toLocaleString()}</span>
            <span className="legend-item legend-o2-critical">O2 crítico</span>
            <span className="legend-item legend-o2-low">O2 bajo</span>
            <span className="legend-item legend-o2-normal">O2 normal</span>
            <span className="legend-item legend-o2-high">O2 alto</span>
            <span className="legend-item legend-o2-unknown">Sin consigna/lectura</span>
            <span className="legend-item legend-alert-outline">Alarma activa en fila</span>
            <span className="legend-item legend-template">Sin vincular</span>
          </div>
        </header>

        <div className="scada-table-wrap">
          <table className="scada-table">
            <thead>
              <tr>
                <th>Zona</th>
                <th>Piscina</th>
                <th>Estado</th>
                <th>Actualizacion</th>
                <th>Temp</th>
                <th>O2</th>
                <th>Saturacion</th>
                <th>Turbidez</th>
                <th>Conductividad</th>
                <th>pH</th>
              </tr>
            </thead>
            <tbody>
              {scadaTableRows.map((tile) => (
                <tr
                  key={tile.key}
                  className={`scada-row scada-row-${tile.status} scada-row-o2-${tile.oxygenState || "unknown"}`}
                >
                  <td>{tile.zoneName}</td>
                  <td>{tile.name}</td>
                  <td>
                    <span className={`scada-status-chip scada-status-${tile.status}`}>{tile.statusLabel}</span>
                  </td>
                  <td>
                    <span title={tile.updatedAt ? new Date(tile.updatedAt).toLocaleString() : "Sin datos"}>
                      {relativeTimeLabel(tile.updatedAt)}
                    </span>
                  </td>
                  <td>{renderMetricWithTrend("temperature", tile.metrics.temperature, tile.trends.temperature, { includeUnit: true })}</td>
                  <td>{renderMetricWithTrend("oxygen", tile.metrics.oxygen, tile.trends.oxygen, { includeUnit: true })}</td>
                  <td>{renderMetricWithTrend("saturation", tile.saturationMetric, tile.trends.saturation, { includeUnit: true })}</td>
                  <td>
                    {renderMetricWithTrend("turbidity", tile.metrics.turbidity, tile.trends.turbidity, {
                      includeUnit: true
                    })}
                  </td>
                  <td title={tile.isConductivityEstimated ? "Estimado desde salinidad (aprox.)" : "Lectura directa"}>
                    {renderMetricWithTrend("conductivity", tile.conductivityMetric, tile.trends.conductivity, {
                      includeUnit: true,
                      valuePrefix: tile.isConductivityEstimated ? "~ " : ""
                    })}
                  </td>
                  <td>{renderMetricWithTrend("ph", tile.metrics.ph, tile.trends.ph, { includeUnit: false })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      ) : null}
    </section>
  );
}
