import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  alertsRequest,
  latestReadingsRequest,
  oxygenColorSetpointsRequest,
  pondsRequest,
  temperatureColorSetpointsRequest
} from "../api/services";
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

export function PlantMapPage() {
  const { accessToken } = useAuth();

  const pondsQuery = useQuery({
    queryKey: ["ponds", "plant-map"],
    queryFn: () => pondsRequest(accessToken)
  });

  const latestQuery = useQuery({
    queryKey: ["latest", "plant-map"],
    queryFn: () => latestReadingsRequest(accessToken, 400),
    refetchInterval: 15000
  });

  const alertsQuery = useQuery({
    queryKey: ["alerts", "open", "plant-map"],
    queryFn: () => alertsRequest(accessToken, "open"),
    refetchInterval: 15000
  });

  const oxygenColorSetpointsQuery = useQuery({
    queryKey: ["oxygen-color-setpoints", "plant-map"],
    queryFn: () => oxygenColorSetpointsRequest(accessToken),
    refetchInterval: 15000
  });

  const temperatureColorSetpointsQuery = useQuery({
    queryKey: ["temperature-color-setpoints", "plant-map"],
    queryFn: () => temperatureColorSetpointsRequest(accessToken),
    refetchInterval: 15000
  });

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

  return (
    <section className="plant-page">
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

      {pondsOutsideScadaTemplate.length > 0 ? (
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
    </section>
  );
}
