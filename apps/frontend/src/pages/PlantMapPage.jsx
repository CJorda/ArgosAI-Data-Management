import { useMemo, useState } from "react";
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

const scadaGeometry = {
  fColumn: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"],
  eColumn: ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10", "E11", "E12"],
  dColumn: ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12"],
  aRow: ["A4", "A3", "A2", "A1"],
  bRow: ["B4", "B3", "B2", "B1"],
  cPairs: [["C7", "C6"], ["C5", "C4"], ["C3", "C2"], ["C1"]]
};

const sensorLabels = {
  temperature: "Temp",
  oxygen: "O2 disuelto",
  saturation: "Saturacion",
  ph: "pH",
  turbidity: "Turbidez"
};

const displayedSensors = ["temperature", "oxygen", "saturation", "turbidity", "ph"];

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

function relativeTimeLabel(timestamp) {
  if (!timestamp) return "Sin datos";

  const elapsedMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.round(elapsedMs / 60000);

  if (minutes <= 0) return "Ahora";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  return `${hours} h`;
}

export function PlantMapPage() {
  const { accessToken } = useAuth();
  const [selectedTileKey, setSelectedTileKey] = useState(null);

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
          updatedAt: reading.recorded_at
        });
      }

      const current = map.get(pondId);

      if (!current.metrics[reading.sensor_type]) {
        current.metrics[reading.sensor_type] = {
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
      const candidates = extractSlotCandidates(pond.name);
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
      const pondMetrics = pond ? metricsByPond.get(pond.id) || { metrics: {}, updatedAt: null } : null;
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

  const tileByCode = useMemo(
    () => new Map(pondTiles.map((tile) => [tile.shortCode, tile])),
    [pondTiles]
  );

  const activeKey = selectedTileKey || pondTiles[0]?.key || null;
  const activeTile = pondTiles.find((item) => item.key === activeKey) || null;

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

  const renderTile = (tile, options = {}) => {
    const {
      orientation = "horizontal",
      showAlerts = orientation === "horizontal",
      compact = false
    } = options;
    const saturationMetric = buildSaturationMetric(tile.metrics);
    const tileMetrics = [
      {
        label: "Temp",
        value: formatMetric(tile.metrics.temperature, { includeUnit: true }),
        indicatorClass: `temp-indicator-${tile.temperatureState || "unknown"}`
      },
      {
        label: "O2",
        value: formatMetric(tile.metrics.oxygen, { includeUnit: true })
      },
      {
        label: "Sat",
        value: formatMetric(saturationMetric, { includeUnit: true })
      },
      {
        label: "Turb",
        value: formatMetric(tile.metrics.turbidity, { includeUnit: true })
      },
      {
        label: "pH",
        value: formatMetric(tile.metrics.ph, { includeUnit: false })
      }
    ];

    const className = [
      "pond-tile",
      orientation === "horizontal" ? "slot-horizontal" : "slot-vertical",
      compact ? "slot-compact" : "",
      tile.dataSource !== "none" ? `pond-oxygen-${tile.oxygenState || "unknown"}` : "",
      `pond-${tile.status}`,
      activeKey === tile.key ? "pond-active" : ""
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        key={tile.key}
        type="button"
        className={className}
        onClick={() => setSelectedTileKey(tile.key)}
      >
        <div className="pond-title-row">
          <span className="pond-age">{relativeTimeLabel(tile.updatedAt)}</span>
        </div>

        <div className="pond-metrics">
          {tileMetrics.map((metric) => (
            <p key={`${tile.key}-${metric.label}`}>
              <span>{metric.label}:</span>
              <strong>
                {metric.indicatorClass ? (
                  <span className={`temp-indicator ${metric.indicatorClass}`.trim()} aria-hidden="true" />
                ) : null}
                {metric.value}
              </strong>
            </p>
          ))}
        </div>

        {showAlerts ? (
          <p className="pond-alert-count">
            Alertas: <strong>{tile.alerts.length}</strong>
          </p>
        ) : null}

        <span className="pond-code">{tile.shortCode}</span>
      </button>
    );
  };

  return (
    <section className="plant-page">
      <article className="panel plant-summary-panel">
        <h3>Plano de planta SCADA</h3>
        <p className="plant-summary-text">
          Representación visual de la planta con estado por piscina, alertas activas y últimas
          lecturas de sensores. Plantilla SCADA completa para reflejar todas las piscinas.
        </p>
        {scadaDataState.isDemoFallback ? (
          <p className="plant-demo-note">
            No se detectan lecturas en tiempo real. Se muestran datos demo por piscina y el fondo
            se calcula con las consignas PLC de oxígeno configuradas.
          </p>
        ) : null}

        <div className="plant-summary-grid">
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
      </article>

      <article className="panel scada-panel">
        <header className="scada-header">
          <h3>Mapa operativo</h3>
          <div className="scada-header-meta">
            <span>Actualizado: {new Date().toLocaleString()}</span>
            <span className="legend-item legend-o2-critical">O2 crítico</span>
            <span className="legend-item legend-o2-low">O2 bajo</span>
            <span className="legend-item legend-o2-normal">O2 normal</span>
            <span className="legend-item legend-o2-high">O2 alto</span>
            <span className="legend-item legend-o2-unknown">Sin consigna/lectura</span>
            <span className="legend-item legend-alert-outline">Borde rojo = alerta activa</span>
            <span className="legend-item legend-template">Sin vincular</span>
          </div>
        </header>

        <div className="scada-geometry">
          <section className="geom-block geom-f">
            <div className="scada-column-frame">
              <div className="slot-column">
                {scadaGeometry.fColumn.map((slotCode) => {
                  const tile = tileByCode.get(slotCode);
                  return renderTile(tile);
                })}
              </div>
            </div>
            <div className="zone-tag">Z4 - F</div>
          </section>

          <section className="geom-block geom-ed">
            <div className="ed-frame">
              <div className="ed-columns">
                <div className="slot-column">
                  {scadaGeometry.eColumn.map((slotCode) => {
                    const tile = tileByCode.get(slotCode);
                    return renderTile(tile);
                  })}
                </div>

                <div className="slot-column">
                  {scadaGeometry.dColumn.map((slotCode) => {
                    const tile = tileByCode.get(slotCode);
                    return renderTile(tile);
                  })}
                </div>
              </div>
            </div>

            <div className="zone-tags-inline">
              <div className="zone-tag">Z3 - E</div>
              <div className="zone-tag">Z2 - D</div>
            </div>
          </section>

          <section className="geom-block geom-abc">
            <div className="abc-frame">
              <div className="slot-row row-four">
                {scadaGeometry.aRow.map((slotCode) => {
                  const tile = tileByCode.get(slotCode);
                  return renderTile(tile, { orientation: "vertical", showAlerts: false });
                })}
              </div>

              <div className="slot-row row-four">
                {scadaGeometry.bRow.map((slotCode) => {
                  const tile = tileByCode.get(slotCode);
                  return renderTile(tile, { orientation: "vertical", showAlerts: false });
                })}
              </div>

              <div className="slot-row row-c-pairs">
                {scadaGeometry.cPairs.map((pair) => {
                  const pairClassName = `c-pair ${pair.length === 1 ? "c-pair-single" : ""}`.trim();

                  return (
                    <div key={pair.join("-")} className={pairClassName}>
                      {pair.map((slotCode) => {
                        const tile = tileByCode.get(slotCode);
                        return renderTile(tile, {
                          orientation: "vertical",
                          showAlerts: false,
                          compact: true
                        });
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="zone-tag">Z1 - A/B/C</div>
          </section>
        </div>
      </article>

      <article className="panel plant-detail-panel">
        <h3>Detalle de piscina</h3>
        {activeTile ? (
          <>
            <p className="plant-detail-title">
              <strong>{activeTile.name}</strong> - {activeTile.species}
            </p>

            {!activeTile.configured ? (
              <p className="plant-detail-note">
                Esta piscina es parte del plano SCADA pero aún no está vinculada a una piscina real del
                sistema. Puedes crearla en datos/operaciones y usar código como {activeTile.shortCode}.
              </p>
            ) : null}

            <div className="plant-detail-metrics">
              {displayedSensors.map((sensorType) => {
                const metric =
                  sensorType === "saturation"
                    ? buildSaturationMetric(activeTile.metrics)
                    : activeTile.metrics[sensorType];

                return (
                <div key={sensorType} className="detail-chip">
                  <span>{sensorLabels[sensorType]}</span>
                  <strong>{formatMetric(metric)}</strong>
                </div>
                );
              })}
            </div>

            <h4>Alertas activas</h4>
            {activeTile.alerts.length ? (
              <ul className="plant-alert-list">
                {activeTile.alerts.slice(0, 5).map((alert) => (
                  <li key={alert.id}>
                    <strong>{alert.severity}</strong>
                    <span>{alert.message}</span>
                    <small>{new Date(alert.created_at).toLocaleString()}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-text">Sin alertas activas en esta piscina.</p>
            )}
          </>
        ) : (
          <p className="empty-text">No hay piscinas para mostrar.</p>
        )}
      </article>
    </section>
  );
}
