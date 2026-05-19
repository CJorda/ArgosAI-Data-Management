import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { useParams } from "react-router-dom";
import { biomassRequest, pondsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./BiomassPage.css";

function buildDemoBiomassRows(ponds) {
  const pondList =
    (ponds || []).length > 0
      ? ponds.map((pond) => ({
          id: pond.id,
          name: pond.name,
          species: pond.species || null
        }))
      : [
          { id: "demo-pond-1", name: "Piscina A1", species: "Dorada" },
          { id: "demo-pond-2", name: "Piscina B1", species: "Lubina" },
          { id: "demo-pond-3", name: "Piscina C1", species: "Tilapia" },
          { id: "demo-pond-4", name: "Piscina D1", species: "Dorada" },
          { id: "demo-pond-5", name: "Piscina E1", species: "Lubina" }
        ];
  const speciesList = ["Dorada", "Lubina", "Tilapia"]; 
  const now = Date.now();

  return Array.from({ length: 12 }, (_, index) => {
    const rowIndex = 11 - index;
    const pond = pondList[rowIndex % pondList.length];
    const pondName = pond.name;
    const species = pond.species || speciesList[rowIndex % speciesList.length];
    const fishCount = 3600 + rowIndex * 135;
    const avgWeightG = 118 + rowIndex * 8.4;
    const feedKg = 52 + rowIndex * 3.9;
    const biomassKg = (fishCount * avgWeightG) / 1000;
    const fcr = biomassKg > 0 ? feedKg / biomassKg : null;
    const vaccinationCoverage = Math.min(99.5, 84 + rowIndex * 1.2);
    const withdrawalDays = rowIndex < 5 ? 18 - rowIndex * 2 : null;
    const mortalityPct = Number((0.95 + (rowIndex % 6) * 0.37).toFixed(2));

    return {
      id: `demo-biomass-${index + 1}`,
      pond_id: pond.id,
      captured_at: new Date(now - rowIndex * 8 * 3600 * 1000).toISOString(),
      pond_name: pondName,
      species_variant: species,
      lot_code: `LOT-${String(210 + rowIndex).padStart(3, "0")}`,
      fish_count: fishCount,
      avg_weight_g: Number(avgWeightG.toFixed(1)),
      mortality_pct: mortalityPct,
      feed_kg: Number(feedKg.toFixed(2)),
      vaccination_coverage_pct: Number(vaccinationCoverage.toFixed(1)),
      withdrawal_days_remaining: withdrawalDays,
      fcr: fcr === null ? null : Number(fcr.toFixed(2)),
      isDemo: true
    };
  });
}

function formatNumberCell(value, decimals = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return numeric.toFixed(decimals);
}

const projectPondCodes = [
  ...Array.from({ length: 10 }, (_, index) => `F${index + 1}`),
  ...Array.from({ length: 12 }, (_, index) => `E${index + 1}`),
  ...Array.from({ length: 12 }, (_, index) => `D${index + 1}`),
  "A4",
  "A3",
  "A2",
  "A1",
  "B4",
  "B3",
  "B2",
  "B1",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7"
];

const projectPondOrder = new Map(projectPondCodes.map((code, index) => [code, index]));
const biomassSections = new Set(["resumen", "historial", "densidad-peces"]);
const HISTORY_PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const PROJECTION_TARGET_DAYS = 30;
const DENSITY_CHART_MODE_DEFAULT = "heatmap";
const densityLinePalette = [
  "#215fa8",
  "#2f7dd3",
  "#49a3d9",
  "#1f8c8d",
  "#41a67f",
  "#8ab446",
  "#d38f35",
  "#d45e4f",
  "#8a6fd1",
  "#5c7fa3"
];
const densityHeatmapPalette = ["#e9f2ff", "#c7def9", "#93bff0", "#5f9ddd", "#2f75be", "#1e4f86"];
const defaultPondVolumeByPrefix = {
  A: 650,
  B: 700,
  C: 760,
  D: 980,
  E: 1100,
  F: 900
};
const defaultFcrThresholds = {
  goodMax: 1.4,
  warningMax: 1.7
};
const fcrThresholdsBySpecies = {
  dorada: { goodMax: 1.3, warningMax: 1.55 },
  lubina: { goodMax: 1.35, warningMax: 1.6 },
  trucha: { goodMax: 1.2, warningMax: 1.45 },
  tilapia: { goodMax: 1.45, warningMax: 1.75 }
};

function toFixedNumber(value, decimals = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Number(numeric.toFixed(decimals));
}

function parseIsoDate(value) {
  const epoch = new Date(value).getTime();
  return Number.isFinite(epoch) ? epoch : null;
}

function toPositiveNumber(value, decimals = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Number(numeric.toFixed(decimals));
}

function toUtcDateKey(dateValue) {
  const epoch = parseIsoDate(dateValue);
  if (!Number.isFinite(epoch)) {
    return null;
  }

  const date = new Date(epoch);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateKeyLabel(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-");
  if (!year || !month || !day) {
    return String(dateKey || "");
  }

  return `${day}/${month}`;
}

function estimatePondVolumeM3FromCode(pondCode) {
  const normalizedCode = String(pondCode || "").toUpperCase();
  const prefix = normalizedCode.charAt(0);
  const index = Number(normalizedCode.slice(1));
  const base = defaultPondVolumeByPrefix[prefix];

  if (!Number.isFinite(base)) {
    return null;
  }

  const safeIndex = Number.isFinite(index) && index > 0 ? index : 1;
  return Number((base + safeIndex * 6).toFixed(1));
}

function resolvePondVolumeInfo(pondVolumeIndex, { pondId, pondCode, pondName }) {
  if (!(pondVolumeIndex instanceof Map)) {
    return {
      volumeM3: null,
      isEstimated: false
    };
  }

  const candidateKeys = [];
  if (pondId !== null && pondId !== undefined) {
    candidateKeys.push(`id:${String(pondId)}`);
  }

  if (pondCode) {
    candidateKeys.push(`code:${String(pondCode).toUpperCase()}`);
  }

  const normalizedName = String(pondName || "").trim().toLowerCase();
  if (normalizedName) {
    candidateKeys.push(`name:${normalizedName}`);
  }

  for (const key of candidateKeys) {
    if (pondVolumeIndex.has(key)) {
      return pondVolumeIndex.get(key);
    }
  }

  const estimatedVolume = estimatePondVolumeM3FromCode(pondCode || extractPondCode(pondName));
  return {
    volumeM3: estimatedVolume,
    isEstimated: Number.isFinite(estimatedVolume)
  };
}

function densityHeatmapOption({ xAxisLabels, yAxisLabels, points, minDensity, maxDensity }) {
  return {
    tooltip: {
      position: "top",
      formatter: (params) => {
        const value = Number(params.data?.value?.[2]);
        return `${params.seriesName}<br/>${params.marker}${params.data?.pondName || "Piscina"}<br/>Densidad: <strong>${formatNumberCell(value, 2)} kg/m³</strong>`;
      }
    },
    grid: {
      top: 56,
      right: 22,
      bottom: 78,
      left: 78,
      containLabel: true
    },
    xAxis: {
      type: "category",
      data: xAxisLabels,
      splitArea: {
        show: true
      },
      axisLabel: {
        interval: 0,
        rotate: xAxisLabels.length > 12 ? 35 : 0,
        fontSize: 11
      }
    },
    yAxis: {
      type: "category",
      data: yAxisLabels,
      splitArea: {
        show: true
      },
      axisLabel: {
        fontSize: 11
      }
    },
    visualMap: {
      min: minDensity,
      max: maxDensity,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 12,
      precision: 2,
      formatter: (value) => `${formatNumberCell(value, 2)} kg/m³`,
      inRange: {
        color: densityHeatmapPalette
      }
    },
    series: [
      {
        name: "Densidad",
        type: "heatmap",
        data: points,
        label: {
          show: false
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 12,
            shadowColor: "rgba(16, 38, 62, 0.35)"
          }
        }
      }
    ]
  };
}

function densityLineOption({ xAxisLabels, series, maxDensity }) {
  const yMax = Number.isFinite(maxDensity) ? Number((maxDensity * 1.15).toFixed(2)) : null;

  return {
    color: densityLinePalette,
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => (Number.isFinite(Number(value)) ? `${formatNumberCell(value, 2)} kg/m³` : "-")
    },
    legend: {
      type: "scroll",
      top: 6,
      left: 8,
      right: 8
    },
    grid: {
      top: 56,
      right: 24,
      bottom: 36,
      left: 24,
      containLabel: true
    },
    xAxis: {
      type: "category",
      data: xAxisLabels,
      axisLabel: {
        interval: 0,
        rotate: xAxisLabels.length > 12 ? 35 : 0,
        fontSize: 11
      }
    },
    yAxis: {
      type: "value",
      name: "kg/m³",
      min: 0,
      max: yMax,
      axisLabel: {
        formatter: (value) => formatNumberCell(value, 2)
      },
      splitLine: {
        lineStyle: {
          type: "dashed"
        }
      }
    },
    series
  };
}

function calculateDaysDifference(newerDate, olderDate) {
  const newerEpoch = parseIsoDate(newerDate);
  const olderEpoch = parseIsoDate(olderDate);

  if (!Number.isFinite(newerEpoch) || !Number.isFinite(olderEpoch) || newerEpoch <= olderEpoch) {
    return null;
  }

  return (newerEpoch - olderEpoch) / DAY_MS;
}

function calculateDaysSince(dateValue) {
  const epoch = parseIsoDate(dateValue);
  if (!Number.isFinite(epoch)) {
    return null;
  }

  const diff = Date.now() - epoch;
  if (!Number.isFinite(diff) || diff < 0) {
    return null;
  }

  return diff / DAY_MS;
}

function calculateTrendState(latestBiomassKg, previousBiomassKg, thirdBiomassKg) {
  const latest = Number(latestBiomassKg);
  const previous = Number(previousBiomassKg);
  const third = Number(thirdBiomassKg);

  if (!Number.isFinite(latest) || !Number.isFinite(previous)) {
    return "Sin datos";
  }

  if (Number.isFinite(third)) {
    if (latest > previous && previous > third) {
      return "Subiendo";
    }

    if (latest < previous && previous < third) {
      return "Bajando";
    }
  }

  const delta = latest - previous;
  const tolerance = Math.max(0.5, Math.abs(previous) * 0.01);

  if (Math.abs(delta) <= tolerance) {
    return "Estable";
  }

  return delta > 0 ? "Subiendo" : "Bajando";
}

function calculateDerivedBiomassMetrics(row, context = {}) {
  const biomassKg = Number(row.biomassKgValue);
  const biomassUnits = Number(row.biomassUnitsValue);
  const mortalityKg = Number(row.mortalityKgValue);
  const mortalityUnits = Number(row.mortalityUnitsValue);
  const previousBiomassKg = Number(context.previousBiomassKgValue);
  const thirdBiomassKg = Number(context.thirdBiomassKgValue);
  const previousCapturedAt = context.previousCapturedAt;

  const netBiomassKg =
    Number.isFinite(biomassKg) && Number.isFinite(mortalityKg)
      ? Math.max(0, biomassKg - mortalityKg)
      : Number.isFinite(biomassKg)
        ? Math.max(0, biomassKg)
        : null;

  const deltaBiomassKg =
    Number.isFinite(biomassKg) && Number.isFinite(previousBiomassKg)
      ? biomassKg - previousBiomassKg
      : null;

  const deltaBiomassPercent =
    Number.isFinite(deltaBiomassKg) && Number.isFinite(previousBiomassKg) && previousBiomassKg > 0
      ? (deltaBiomassKg / previousBiomassKg) * 100
      : null;

  const daysBetweenReadings = calculateDaysDifference(row.lastCapturedAt, previousCapturedAt);
  const growthDailyKg =
    Number.isFinite(deltaBiomassKg) && Number.isFinite(daysBetweenReadings) && daysBetweenReadings > 0
      ? deltaBiomassKg / daysBetweenReadings
      : null;

  const growthPerFishGPerDay =
    Number.isFinite(growthDailyKg) && Number.isFinite(biomassUnits) && biomassUnits > 0
      ? (growthDailyKg * 1000) / biomassUnits
      : null;

  let totalMortalityUnits = Number(context.totalMortalityUnitsValue);
  const latestMortalityUnitsOriginal = Number(context.latestMortalityUnitsOriginalValue);

  if (
    Number.isFinite(totalMortalityUnits) &&
    Number.isFinite(latestMortalityUnitsOriginal) &&
    Number.isFinite(mortalityUnits)
  ) {
    totalMortalityUnits = totalMortalityUnits - latestMortalityUnitsOriginal + mortalityUnits;
  }

  const referenceBiomassUnits = Number(context.referenceBiomassUnitsValue);
  const cumulativeMortalityPercent =
    Number.isFinite(totalMortalityUnits) && Number.isFinite(referenceBiomassUnits) && referenceBiomassUnits > 0
      ? Math.min(100, Math.max(0, (totalMortalityUnits / referenceBiomassUnits) * 100))
      : null;

  const survivalPercent =
    Number.isFinite(cumulativeMortalityPercent)
      ? Math.min(100, Math.max(0, 100 - cumulativeMortalityPercent))
      : null;

  const daysSinceUpdate = calculateDaysSince(row.lastCapturedAt);

  const trendState = calculateTrendState(
    biomassKg,
    previousBiomassKg,
    Number.isFinite(thirdBiomassKg) ? thirdBiomassKg : null
  );

  const projectionTargetKg =
    Number.isFinite(biomassKg) && Number.isFinite(growthDailyKg)
      ? Math.max(0, biomassKg + growthDailyKg * PROJECTION_TARGET_DAYS)
      : null;

  return {
    netBiomassKgValue: toFixedNumber(netBiomassKg, 2),
    deltaBiomassKgValue: toFixedNumber(deltaBiomassKg, 2),
    deltaBiomassPercentValue: toFixedNumber(deltaBiomassPercent, 2),
    growthDailyKgValue: toFixedNumber(growthDailyKg, 2),
    growthPerFishGPerDayValue: toFixedNumber(growthPerFishGPerDay, 2),
    cumulativeMortalityPercentValue: toFixedNumber(cumulativeMortalityPercent, 2),
    survivalPercentValue: toFixedNumber(survivalPercent, 2),
    daysSinceUpdateValue: toFixedNumber(daysSinceUpdate, 1),
    trendStateValue: trendState,
    projectionTargetKgValue: toFixedNumber(projectionTargetKg, 2)
  };
}

function buildSurvivalFunnelStages(initialCount, soldCount) {
  const stageNames = ["Alevines", "Juveniles", "Pre-engorde", "Engorde", "Venta"];
  const palette = ["#d7ebff", "#b8d8fa", "#95c1ec", "#679fd8", "#2f73b7"];

  const safeInitial = Math.max(1, Math.round(Number(initialCount) || 0));
  const boundedSold = Math.max(0, Math.min(safeInitial, Math.round(Number(soldCount) || 0)));
  const soldRatio = Math.min(0.98, Math.max(0.05, boundedSold / safeInitial));
  const progression = [0, 0.25, 0.5, 0.75, 1];

  const values = progression.map((step) =>
    Math.round(safeInitial * (1 - (1 - soldRatio) * Math.pow(step, 1.15)))
  );

  values[0] = safeInitial;
  values[values.length - 1] = boundedSold;

  for (let index = 1; index < values.length; index += 1) {
    values[index] = Math.min(values[index], values[index - 1]);
  }

  return stageNames.map((name, index) => ({
    name,
    value: values[index],
    survivalPct: Number(((values[index] / safeInitial) * 100).toFixed(1)),
    itemStyle: {
      color: palette[index]
    }
  }));
}

function extractPondCode(nameOrCode) {
  const match = String(nameOrCode || "").toUpperCase().match(/\b([A-F]\d{1,2})\b/);
  return match ? match[1] : null;
}

function calculateAverageWeightFromRow(row) {
  const biomassKg = Number(row.biomassKgValue);
  const biomassUnits = Number(row.biomassUnitsValue);

  if (Number.isFinite(biomassKg) && biomassKg >= 0 && Number.isFinite(biomassUnits) && biomassUnits > 0) {
    return Number(((biomassKg * 1000) / biomassUnits).toFixed(2));
  }

  return null;
}

function calculateMortalityPercentFromRow(row) {
  const biomassUnits = Number(row.biomassUnitsValue);
  const mortalityUnits = Number(row.mortalityUnitsValue);

  if (
    Number.isFinite(biomassUnits) &&
    biomassUnits > 0 &&
    Number.isFinite(mortalityUnits) &&
    mortalityUnits >= 0
  ) {
    const percentage = (mortalityUnits / biomassUnits) * 100;
    return Number(Math.min(100, Math.max(0, percentage)).toFixed(2));
  }

  const biomassKg = Number(row.biomassKgValue);
  const mortalityKg = Number(row.mortalityKgValue);

  if (Number.isFinite(biomassKg) && biomassKg > 0 && Number.isFinite(mortalityKg) && mortalityKg >= 0) {
    const percentage = (mortalityKg / biomassKg) * 100;
    return Number(Math.min(100, Math.max(0, percentage)).toFixed(2));
  }

  return null;
}

function calculateFcrValueFromEntry(entry, biomassKgValue) {
  const directFcr = Number(entry?.fcr);
  if (Number.isFinite(directFcr) && directFcr >= 0) {
    return Number(directFcr.toFixed(2));
  }

  const feedKg = Number(entry?.feed_kg);
  const biomassKg = Number(biomassKgValue);

  if (Number.isFinite(feedKg) && feedKg >= 0 && Number.isFinite(biomassKg) && biomassKg > 0) {
    return Number((feedKg / biomassKg).toFixed(2));
  }

  return null;
}

function normalizeSpeciesName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveFcrThresholds(speciesVariant) {
  const normalizedSpecies = normalizeSpeciesName(speciesVariant);
  return fcrThresholdsBySpecies[normalizedSpecies] || defaultFcrThresholds;
}

function classifyFcrSeverity(fcrValue, speciesVariant) {
  const fcr = Number(fcrValue);
  if (!Number.isFinite(fcr) || fcr <= 0) {
    return "unknown";
  }

  const { goodMax, warningMax } = resolveFcrThresholds(speciesVariant);
  if (fcr <= goodMax) {
    return "good";
  }

  if (fcr <= warningMax) {
    return "warning";
  }

  return "critical";
}

function buildFcrThresholdTooltip(speciesVariant) {
  const { goodMax, warningMax } = resolveFcrThresholds(speciesVariant);
  const speciesLabel = speciesVariant || "general";
  return `FCR (${speciesLabel}): verde <= ${goodMax.toFixed(2)}, amarillo <= ${warningMax.toFixed(2)}, rojo > ${warningMax.toFixed(2)}`;
}

function buildHistoryEntryFromSummaryRow(row, capturedAt) {
  const timestamp = capturedAt || new Date().toISOString();

  return {
    id: `manual-${row.rowKey}-${timestamp}`,
    pond_id: row.pondId ?? null,
    pond_code: row.pondCode ?? null,
    pond_name: row.pondName,
    species_variant: row.speciesVariant || null,
    biomassKgValue: Number.isFinite(Number(row.biomassKgValue))
      ? Number(row.biomassKgValue)
      : null,
    biomassUnitsValue: Number.isFinite(Number(row.biomassUnitsValue))
      ? Number(row.biomassUnitsValue)
      : null,
    averageWeightGValue: Number.isFinite(Number(row.averageWeightGValue))
      ? Number(row.averageWeightGValue)
      : null,
    mortalityKgValue: Number.isFinite(Number(row.mortalityKgValue))
      ? Number(row.mortalityKgValue)
      : null,
    mortalityUnitsValue: Number.isFinite(Number(row.mortalityUnitsValue))
      ? Number(row.mortalityUnitsValue)
      : null,
    mortalityPercentValue: Number.isFinite(Number(row.mortalityPercentValue))
      ? Number(row.mortalityPercentValue)
      : null,
    fcrValue: Number.isFinite(Number(row.fcrValue))
      ? Number(row.fcrValue)
      : null,
    lastCapturedAt: timestamp,
    source: "manual"
  };
}

export function BiomassPage() {
  const { accessToken } = useAuth();
  const { section = "resumen" } = useParams();
  const normalizedSection = String(section || "resumen").toLowerCase();
  const activeSection = biomassSections.has(normalizedSection) ? normalizedSection : "resumen";
  const showSummarySection = activeSection === "resumen";
  const showHistorySection = activeSection === "historial";
  const showDensitySection = activeSection === "densidad-peces";

  const pondsQuery = useQuery({
    queryKey: ["ponds", "biomass"],
    queryFn: () => pondsRequest(accessToken)
  });

  const biomassQuery = useQuery({
    queryKey: ["biomass"],
    queryFn: () => biomassRequest(accessToken)
  });

  const orderedPonds = useMemo(() => {
    const rows = pondsQuery.data || [];

    return [...rows].sort((left, right) => {
      const leftCode = extractPondCode(left.name);
      const rightCode = extractPondCode(right.name);
      const leftOrder =
        leftCode && projectPondOrder.has(leftCode)
          ? projectPondOrder.get(leftCode)
          : Number.POSITIVE_INFINITY;
      const rightOrder =
        rightCode && projectPondOrder.has(rightCode)
          ? projectPondOrder.get(rightCode)
          : Number.POSITIVE_INFINITY;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return String(left.name || "").localeCompare(String(right.name || ""));
    });
  }, [pondsQuery.data]);

  const pondVolumeIndex = useMemo(() => {
    const index = new Map();

    for (const pond of orderedPonds) {
      const pondCode = extractPondCode(pond.name);
      const storedVolume = toPositiveNumber(pond.volume_m3, 1);
      const estimatedVolume = estimatePondVolumeM3FromCode(pondCode);
      const resolvedVolume = Number.isFinite(storedVolume) ? storedVolume : estimatedVolume;

      if (!Number.isFinite(resolvedVolume)) {
        continue;
      }

      const volumeInfo = {
        volumeM3: resolvedVolume,
        isEstimated: !Number.isFinite(storedVolume)
      };

      if (pond.id !== null && pond.id !== undefined) {
        index.set(`id:${String(pond.id)}`, volumeInfo);
      }

      if (pondCode) {
        index.set(`code:${pondCode}`, volumeInfo);
      }

      const normalizedName = String(pond.name || "").trim().toLowerCase();
      if (normalizedName) {
        index.set(`name:${normalizedName}`, volumeInfo);
      }
    }

    return index;
  }, [orderedPonds]);

  const biomassTableState = useMemo(() => {
    if (biomassQuery.isLoading) {
      return {
        rows: [],
        isDemo: false,
        isLoading: true
      };
    }

    const rows = biomassQuery.data || [];
    if (rows.length > 0) {
      return {
        rows,
        isDemo: false,
        isLoading: false
      };
    }

    return {
      rows: buildDemoBiomassRows(orderedPonds),
      isDemo: true,
      isLoading: false
    };
  }, [biomassQuery.isLoading, biomassQuery.data, orderedPonds]);

  const biomassByPondRows = useMemo(() => {
    if (biomassTableState.isLoading) {
      return [];
    }

    const summaryByPond = new Map();

    const pondById = new Map();
    const pondByCode = new Map();

    for (const pond of orderedPonds) {
      pondById.set(String(pond.id), pond);
      const pondCode = extractPondCode(pond.name);
      if (pondCode) {
        pondByCode.set(pondCode, pond);
      }
    }

    for (const pondCode of projectPondCodes) {
      const pond = pondByCode.get(pondCode);
      summaryByPond.set(`code:${pondCode}`, {
        pondCode,
        pondId: pond?.id ?? null,
        pondName: pond?.name || `Piscina ${pondCode}`,
        speciesVariant: pond?.species || null,
        latestBiomassKg: null,
        latestBiomassUnits: null,
        latestMortalityKg: null,
        latestMortalityUnits: null,
        latestMortalityPct: null,
        latestFcr: null,
        lastCapturedAt: null,
        totalMortalityUnits: 0,
        maxBiomassUnits: null,
        measurements: []
      });
    }

    for (const pond of orderedPonds) {
      const pondCode = extractPondCode(pond.name);
      if (pondCode && projectPondOrder.has(pondCode)) {
        continue;
      }

      summaryByPond.set(`id:${pond.id}`, {
        pondCode,
        pondId: pond.id,
        pondName: pond.name,
        speciesVariant: pond.species || null,
        latestBiomassKg: null,
        latestBiomassUnits: null,
        latestMortalityKg: null,
        latestMortalityUnits: null,
        latestMortalityPct: null,
        latestFcr: null,
        lastCapturedAt: null,
        totalMortalityUnits: 0,
        maxBiomassUnits: null,
        measurements: []
      });
    }

    const ensureSummary = (entry) => {
      const entryPondId =
        entry.pond_id !== null && entry.pond_id !== undefined ? String(entry.pond_id) : null;
      const pondFromId = entryPondId ? pondById.get(entryPondId) : null;
      const pondCode = extractPondCode(pondFromId?.name) || extractPondCode(entry.pond_name);
      const key =
        pondCode && projectPondOrder.has(pondCode)
          ? `code:${pondCode}`
          : entryPondId
            ? `id:${entryPondId}`
            : `name:${entry.pond_name || "sin-piscina"}`;

      if (!summaryByPond.has(key)) {
        summaryByPond.set(key, {
          pondCode,
          pondId: entry.pond_id ?? null,
          pondName: entry.pond_name || "Piscina sin nombre",
          speciesVariant: entry.species_variant || null,
          latestBiomassKg: null,
          latestBiomassUnits: null,
          latestMortalityKg: null,
          latestMortalityUnits: null,
          latestMortalityPct: null,
          latestFcr: null,
          lastCapturedAt: null,
          totalMortalityUnits: 0,
          maxBiomassUnits: null,
          measurements: []
        });
      }

      const summary = summaryByPond.get(key);

      if (pondFromId) {
        summary.pondId = pondFromId.id;
        summary.pondName = pondFromId.name;
        summary.speciesVariant = pondFromId.species || summary.speciesVariant;
      }

      if (entry.species_variant) {
        summary.speciesVariant = entry.species_variant;
      }

      return summary;
    };

    for (const entry of biomassTableState.rows) {
      const summary = ensureSummary(entry);

      const fishCount = Number(entry.fish_count);
      const avgWeightG = Number(entry.avg_weight_g);
      const biomassKg =
        Number.isFinite(fishCount) && Number.isFinite(avgWeightG)
          ? (fishCount * avgWeightG) / 1000
          : null;

      const mortalityPctRaw = Number(entry.mortality_pct);
      const mortalityPct = Number.isFinite(mortalityPctRaw)
        ? Math.min(100, Math.max(0, mortalityPctRaw))
        : null;
      const mortalityUnits =
        Number.isFinite(fishCount) && Number.isFinite(mortalityPct)
          ? (fishCount * mortalityPct) / 100
          : null;
      const mortalityKg =
        Number.isFinite(mortalityUnits) && Number.isFinite(avgWeightG)
          ? (mortalityUnits * avgWeightG) / 1000
          : null;
      const fcrValue = calculateFcrValueFromEntry(entry, biomassKg);

      if (Number.isFinite(mortalityUnits)) {
        summary.totalMortalityUnits += mortalityUnits;
      }

      if (Number.isFinite(fishCount)) {
        summary.maxBiomassUnits = Number.isFinite(summary.maxBiomassUnits)
          ? Math.max(summary.maxBiomassUnits, fishCount)
          : fishCount;
      }

      summary.measurements.push({
        capturedAt: entry.captured_at,
        biomassKg,
        biomassUnits: fishCount,
        mortalityKg,
        mortalityUnits,
        fcrValue
      });

      const capturedAt = new Date(entry.captured_at).getTime();
      if (Number.isFinite(capturedAt)) {
        const previousCapturedAt = summary.lastCapturedAt
          ? new Date(summary.lastCapturedAt).getTime()
          : Number.NEGATIVE_INFINITY;

        if (capturedAt >= previousCapturedAt) {
          summary.lastCapturedAt = entry.captured_at;
          summary.latestBiomassKg = Number.isFinite(biomassKg) ? biomassKg : null;
          summary.latestBiomassUnits = Number.isFinite(fishCount) ? fishCount : null;
          summary.latestMortalityKg = Number.isFinite(mortalityKg) ? mortalityKg : null;
          summary.latestMortalityUnits = Number.isFinite(mortalityUnits) ? mortalityUnits : null;
          summary.latestMortalityPct = Number.isFinite(mortalityPct) ? mortalityPct : null;
          summary.latestFcr = Number.isFinite(fcrValue) ? fcrValue : null;
        }
      }
    }

    return Array.from(summaryByPond.values())
      .map((summary) => {
        const orderedMeasurements = [...summary.measurements].sort((left, right) => {
          const leftEpoch = parseIsoDate(left.capturedAt) || Number.NEGATIVE_INFINITY;
          const rightEpoch = parseIsoDate(right.capturedAt) || Number.NEGATIVE_INFINITY;
          return rightEpoch - leftEpoch;
        });

        const latestMeasurement = orderedMeasurements[0] || null;
        const previousMeasurement = orderedMeasurements[1] || null;
        const thirdMeasurement = orderedMeasurements[2] || null;

        const baseRow = {
          rowKey: `pond-summary-${summary.pondCode || summary.pondId || summary.pondName}`,
          ...summary,
          biomassKgValue: Number.isFinite(summary.latestBiomassKg)
            ? Number(summary.latestBiomassKg.toFixed(2))
            : null,
          biomassUnitsValue: Number.isFinite(summary.latestBiomassUnits)
            ? Math.max(0, Math.round(summary.latestBiomassUnits))
            : null,
          mortalityKgValue: Number.isFinite(summary.latestMortalityKg)
            ? Number(summary.latestMortalityKg.toFixed(2))
            : null,
          mortalityUnitsValue: Number.isFinite(summary.latestMortalityUnits)
            ? Math.max(0, Math.round(summary.latestMortalityUnits))
            : null,
          mortalityPercentValue: Number.isFinite(summary.latestMortalityPct)
            ? Number(summary.latestMortalityPct.toFixed(2))
              : null,
          fcrValue: Number.isFinite(summary.latestFcr)
            ? Number(summary.latestFcr.toFixed(2))
            : null,
          averageWeightGValue: calculateAverageWeightFromRow({
            biomassKgValue: summary.latestBiomassKg,
            biomassUnitsValue: summary.latestBiomassUnits
          }),
          previousBiomassKgValue:
            previousMeasurement && Number.isFinite(previousMeasurement.biomassKg)
              ? Number(previousMeasurement.biomassKg.toFixed(2))
              : null,
          previousCapturedAt: previousMeasurement?.capturedAt || null,
          thirdBiomassKgValue:
            thirdMeasurement && Number.isFinite(thirdMeasurement.biomassKg)
              ? Number(thirdMeasurement.biomassKg.toFixed(2))
              : null,
          totalMortalityUnitsValue: Number.isFinite(summary.totalMortalityUnits)
            ? Number(summary.totalMortalityUnits.toFixed(2))
            : null,
          referenceBiomassUnitsValue: Number.isFinite(summary.maxBiomassUnits)
            ? Math.max(0, Math.round(summary.maxBiomassUnits))
            : null,
          latestMortalityUnitsOriginalValue:
            latestMeasurement && Number.isFinite(latestMeasurement.mortalityUnits)
              ? Number(latestMeasurement.mortalityUnits.toFixed(2))
              : null
        };

        return {
          ...baseRow,
          ...calculateDerivedBiomassMetrics(baseRow, {
            previousBiomassKgValue: baseRow.previousBiomassKgValue,
            previousCapturedAt: baseRow.previousCapturedAt,
            thirdBiomassKgValue: baseRow.thirdBiomassKgValue,
            totalMortalityUnitsValue: baseRow.totalMortalityUnitsValue,
            referenceBiomassUnitsValue: baseRow.referenceBiomassUnitsValue,
            latestMortalityUnitsOriginalValue: baseRow.latestMortalityUnitsOriginalValue
          })
        };
      })
      .sort((left, right) => {
        const leftOrder =
          left.pondCode && projectPondOrder.has(left.pondCode)
            ? projectPondOrder.get(left.pondCode)
            : Number.POSITIVE_INFINITY;
        const rightOrder =
          right.pondCode && projectPondOrder.has(right.pondCode)
            ? projectPondOrder.get(right.pondCode)
            : Number.POSITIVE_INFINITY;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.pondName.localeCompare(right.pondName);
      });
  }, [biomassTableState.isLoading, biomassTableState.rows, orderedPonds]);

  const [editableSummaryRows, setEditableSummaryRows] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [manualHistoryRows, setManualHistoryRows] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [densityChartMode, setDensityChartMode] = useState(DENSITY_CHART_MODE_DEFAULT);
  const [survivalScope, setSurvivalScope] = useState("total");
  const [selectedSurvivalPond, setSelectedSurvivalPond] = useState("");

  const historyRows = useMemo(() => {
    const serverRows = biomassTableState.rows.map((entry) => {
      const fishCount = Number(entry.fish_count);
      const avgWeightG = Number(entry.avg_weight_g);
      const mortalityPctRaw = Number(entry.mortality_pct);
      const mortalityPct = Number.isFinite(mortalityPctRaw)
        ? Math.min(100, Math.max(0, mortalityPctRaw))
        : null;

      const biomassKg =
        Number.isFinite(fishCount) && Number.isFinite(avgWeightG)
          ? (fishCount * avgWeightG) / 1000
          : null;
      const mortalityUnits =
        Number.isFinite(fishCount) && Number.isFinite(mortalityPct)
          ? (fishCount * mortalityPct) / 100
          : null;
      const mortalityKg =
        Number.isFinite(mortalityUnits) && Number.isFinite(avgWeightG)
          ? (mortalityUnits * avgWeightG) / 1000
          : null;
      const fcrValue = calculateFcrValueFromEntry(entry, biomassKg);

      return {
        ...entry,
        rowKey: `server-${entry.id}`,
        biomassKgValue: Number.isFinite(biomassKg) ? Number(biomassKg.toFixed(2)) : null,
        biomassUnitsValue: Number.isFinite(fishCount) ? Math.max(0, Math.round(fishCount)) : null,
        averageWeightGValue:
          Number.isFinite(biomassKg) && Number.isFinite(fishCount) && fishCount > 0
            ? Number(((biomassKg * 1000) / fishCount).toFixed(2))
            : Number.isFinite(avgWeightG)
              ? Number(avgWeightG.toFixed(2))
              : null,
        mortalityKgValue: Number.isFinite(mortalityKg) ? Number(mortalityKg.toFixed(2)) : null,
        mortalityUnitsValue: Number.isFinite(mortalityUnits)
          ? Math.max(0, Math.round(mortalityUnits))
          : null,
        mortalityPercentValue: Number.isFinite(mortalityPct)
          ? Number(mortalityPct.toFixed(2))
          : null,
        fcrValue: Number.isFinite(fcrValue)
          ? Number(fcrValue.toFixed(2))
          : null,
        lastCapturedAt: entry.captured_at,
        source: "server"
      };
    });

    const allRows = [...manualHistoryRows, ...serverRows].map((row, index) => ({
      ...row,
      rowKey: row.rowKey || `${row.source || "history"}-${row.id || index}-${index}`
    }));

    const rowsByPond = new Map();

    for (const row of allRows) {
      const pondKey = String(row.pond_name || "Sin piscina");
      if (!rowsByPond.has(pondKey)) {
        rowsByPond.set(pondKey, []);
      }

      rowsByPond.get(pondKey).push(row);
    }

    const enrichedRows = [];

    for (const pondRows of rowsByPond.values()) {
      const orderedRows = [...pondRows].sort((left, right) => {
        const leftEpoch = parseIsoDate(left.lastCapturedAt) || Number.NEGATIVE_INFINITY;
        const rightEpoch = parseIsoDate(right.lastCapturedAt) || Number.NEGATIVE_INFINITY;
        return rightEpoch - leftEpoch;
      });

      const totalMortalityUnitsForPond = orderedRows.reduce((sum, row) => {
        const value = Number(row.mortalityUnitsValue);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);

      const referenceBiomassUnitsForPond = orderedRows.reduce((maxValue, row) => {
        const value = Number(row.biomassUnitsValue);
        if (!Number.isFinite(value)) {
          return maxValue;
        }

        return Math.max(maxValue, value);
      }, 0);

      orderedRows.forEach((row, index) => {
        const previousRow = orderedRows[index + 1] || null;
        const thirdRow = orderedRows[index + 2] || null;

        const derived = calculateDerivedBiomassMetrics(row, {
          previousBiomassKgValue: previousRow?.biomassKgValue ?? null,
          previousCapturedAt: previousRow?.lastCapturedAt ?? null,
          thirdBiomassKgValue: thirdRow?.biomassKgValue ?? null,
          totalMortalityUnitsValue: totalMortalityUnitsForPond,
          referenceBiomassUnitsValue: referenceBiomassUnitsForPond,
          latestMortalityUnitsOriginalValue: row.mortalityUnitsValue
        });

        enrichedRows.push({
          ...row,
          ...derived
        });
      });
    }

    return enrichedRows.sort((left, right) => {
      const leftEpoch = parseIsoDate(left.lastCapturedAt) || Number.NEGATIVE_INFINITY;
      const rightEpoch = parseIsoDate(right.lastCapturedAt) || Number.NEGATIVE_INFINITY;
      return rightEpoch - leftEpoch;
    });
  }, [biomassTableState.rows, manualHistoryRows]);

  const densityTableRows = useMemo(() => {
    const sourceRows = editableSummaryRows.length > 0 ? editableSummaryRows : biomassByPondRows;

    return sourceRows.map((row) => {
      const volumeInfo = resolvePondVolumeInfo(pondVolumeIndex, {
        pondId: row.pondId,
        pondCode: row.pondCode,
        pondName: row.pondName
      });
      const volumeM3 = toPositiveNumber(volumeInfo.volumeM3, 1);
      const biomassKg = Number(row.biomassKgValue);
      const normalizedBiomassKg = Number.isFinite(biomassKg) && biomassKg >= 0
        ? Number(biomassKg.toFixed(2))
        : null;
      const densityKgM3 =
        Number.isFinite(normalizedBiomassKg) && Number.isFinite(volumeM3)
          ? Number((normalizedBiomassKg / volumeM3).toFixed(2))
          : null;

      return {
        rowKey: row.rowKey,
        pondName: row.pondName,
        pondCode: row.pondCode,
        volumeM3,
        biomassKg: normalizedBiomassKg,
        densityKgM3,
        isEstimatedVolume: Boolean(volumeInfo.isEstimated),
        lastCapturedAt: row.lastCapturedAt || null
      };
    });
  }, [editableSummaryRows, biomassByPondRows, pondVolumeIndex]);

  const survivalSourceRows = useMemo(
    () => (editableSummaryRows.length > 0 ? editableSummaryRows : biomassByPondRows),
    [editableSummaryRows, biomassByPondRows]
  );

  const survivalStatsByPond = useMemo(() => {
    return survivalSourceRows
      .map((row) => {
        const aliveCount = Math.max(0, Math.round(Number(row.biomassUnitsValue) || 0));
        const mortalityUnits = Math.max(0, Math.round(Number(row.mortalityUnitsValue) || 0));
        const survivalPercent = Number(row.survivalPercentValue);

        let initialCount;
        if (Number.isFinite(survivalPercent) && survivalPercent > 0) {
          initialCount = Math.round((aliveCount * 100) / survivalPercent);
        } else if (Number.isFinite(mortalityUnits)) {
          initialCount = aliveCount + mortalityUnits;
        } else {
          initialCount = aliveCount;
        }

        if (!Number.isFinite(initialCount) || initialCount <= 0) {
          return null;
        }

        const boundedSoldCount = Math.max(0, Math.min(initialCount, aliveCount));
        const pondCode = String(row.pondCode || "").toUpperCase().trim();
        const pondLabel = row.pondName || (pondCode ? `Piscina ${pondCode}` : "Piscina");

        return {
          pondCode: pondCode || null,
          pondLabel,
          initialCount: Math.max(1, Math.round(initialCount)),
          soldCount: Math.round(boundedSoldCount),
          samples: Array.isArray(row.measurements) ? row.measurements.length : 1
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const leftOrder =
          left.pondCode && projectPondOrder.has(left.pondCode)
            ? projectPondOrder.get(left.pondCode)
            : Number.POSITIVE_INFINITY;
        const rightOrder =
          right.pondCode && projectPondOrder.has(right.pondCode)
            ? projectPondOrder.get(right.pondCode)
            : Number.POSITIVE_INFINITY;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.pondLabel.localeCompare(right.pondLabel);
      });
  }, [survivalSourceRows]);

  const survivalPondOptions = useMemo(
    () => survivalStatsByPond.map((item) => item.pondLabel),
    [survivalStatsByPond]
  );

  const totalSurvivalStats = useMemo(() => {
    if (survivalStatsByPond.length === 0) {
      return null;
    }

    const initialCount = survivalStatsByPond.reduce((sum, item) => sum + item.initialCount, 0);
    const soldCount = Math.max(
      0,
      Math.min(initialCount, survivalStatsByPond.reduce((sum, item) => sum + item.soldCount, 0))
    );

    return {
      pondLabel: "Total",
      initialCount: Math.max(1, initialCount),
      soldCount,
      samples: survivalStatsByPond.reduce((sum, item) => sum + item.samples, 0)
    };
  }, [survivalStatsByPond]);

  const activeSurvivalStats = useMemo(() => {
    if (survivalScope === "pond") {
      if (survivalStatsByPond.length === 0) {
        return null;
      }

      return (
        survivalStatsByPond.find((item) => item.pondLabel === selectedSurvivalPond) ||
        survivalStatsByPond[0]
      );
    }

    return totalSurvivalStats;
  }, [selectedSurvivalPond, survivalScope, survivalStatsByPond, totalSurvivalStats]);

  const activeSurvivalRate = useMemo(() => {
    if (!activeSurvivalStats) {
      return null;
    }

    return Number(
      ((activeSurvivalStats.soldCount / Math.max(1, activeSurvivalStats.initialCount)) * 100).toFixed(1)
    );
  }, [activeSurvivalStats]);

  const survivalFunnelData = useMemo(() => {
    if (!activeSurvivalStats) {
      return [];
    }

    return buildSurvivalFunnelStages(activeSurvivalStats.initialCount, activeSurvivalStats.soldCount);
  }, [activeSurvivalStats]);

  const survivalFunnelMax = Math.max(1, activeSurvivalStats?.initialCount || 1);

  const survivalFunnelOption = useMemo(
    () => ({
      animation: false,
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(255,255,255,0.98)",
        borderColor: "#b7c7da",
        borderWidth: 1,
        textStyle: {
          color: "#1f3653"
        },
        formatter: (params) => {
          const stageLabel = params?.name || "--";
          const fishCount = Math.round(Number(params?.value) || 0);
          const survivalPct = Number(params?.data?.survivalPct);
          const survivalText = Number.isFinite(survivalPct) ? ` (${survivalPct}% supervivencia)` : "";

          return `${stageLabel}<br/>${fishCount} peces${survivalText}`;
        }
      },
      series: [
        {
          name: "Supervivencia",
          type: "funnel",
          left: "8%",
          top: 16,
          bottom: 12,
          width: "84%",
          min: 0,
          max: survivalFunnelMax,
          minSize: "18%",
          maxSize: "100%",
          sort: "descending",
          gap: 2,
          label: {
            show: true,
            position: "inside",
            color: "#1f3858",
            fontWeight: 700,
            formatter: ({ name, value }) => `${name}\n${Math.round(Number(value) || 0)} peces`
          },
          labelLine: {
            show: false
          },
          itemStyle: {
            borderColor: "#ffffff",
            borderWidth: 1
          },
          emphasis: {
            label: {
              fontSize: 13
            }
          },
          data: survivalFunnelData
        }
      ]
    }),
    [survivalFunnelData, survivalFunnelMax]
  );

  const survivalDataSourceText =
    "Estimación basada en Biomasa (uds), Mortalidad (uds) y Supervivencia (%) del resumen por piscina.";

  const densityCoverage = useMemo(() => {
    return densityTableRows.reduce(
      (acc, row) => {
        if (Number.isFinite(row.volumeM3)) {
          if (row.isEstimatedVolume) {
            acc.estimatedVolumeCount += 1;
          } else {
            acc.realVolumeCount += 1;
          }
        } else {
          acc.missingVolumeCount += 1;
        }

        return acc;
      },
      {
        realVolumeCount: 0,
        estimatedVolumeCount: 0,
        missingVolumeCount: 0
      }
    );
  }, [densityTableRows]);

  const densityChartState = useMemo(() => {
    const pointsByPond = new Map();
    const pondCodeByName = new Map();

    for (const row of historyRows) {
      const pondName = String(row.pond_name || "Sin piscina");
      const pondCode = row.pond_code || extractPondCode(pondName);
      const volumeInfo = resolvePondVolumeInfo(pondVolumeIndex, {
        pondId: row.pond_id,
        pondCode,
        pondName
      });
      const volumeM3 = toPositiveNumber(volumeInfo.volumeM3, 1);
      const biomassKg = Number(row.biomassKgValue);
      const capturedAt = row.lastCapturedAt || row.captured_at;
      const dateKey = toUtcDateKey(capturedAt);
      const capturedEpoch = parseIsoDate(capturedAt);

      if (
        !Number.isFinite(volumeM3) ||
        !Number.isFinite(biomassKg) ||
        biomassKg < 0 ||
        !dateKey ||
        !Number.isFinite(capturedEpoch)
      ) {
        continue;
      }

      const densityValue = Number((biomassKg / volumeM3).toFixed(3));

      if (!pointsByPond.has(pondName)) {
        pointsByPond.set(pondName, new Map());
      }

      const pointsByDay = pointsByPond.get(pondName);
      const existingPoint = pointsByDay.get(dateKey);

      if (!existingPoint || capturedEpoch >= existingPoint.epoch) {
        pointsByDay.set(dateKey, {
          densityValue,
          epoch: capturedEpoch
        });
      }

      if (pondCode) {
        pondCodeByName.set(pondName, pondCode);
      }
    }

    const xDateKeys = Array.from(
      new Set(
        Array.from(pointsByPond.values()).flatMap((pointsByDay) => Array.from(pointsByDay.keys()))
      )
    ).sort((left, right) => left.localeCompare(right));

    const yPondNames = Array.from(pointsByPond.keys()).sort((left, right) => {
      const leftCode = pondCodeByName.get(left) || extractPondCode(left);
      const rightCode = pondCodeByName.get(right) || extractPondCode(right);
      const leftOrder =
        leftCode && projectPondOrder.has(leftCode)
          ? projectPondOrder.get(leftCode)
          : Number.POSITIVE_INFINITY;
      const rightOrder =
        rightCode && projectPondOrder.has(rightCode)
          ? projectPondOrder.get(rightCode)
          : Number.POSITIVE_INFINITY;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.localeCompare(right);
    });

    const xAxisLabels = xDateKeys.map((dateKey) => formatDateKeyLabel(dateKey));
    const heatmapPoints = [];
    const lineSeries = [];
    let minDensity = Number.POSITIVE_INFINITY;
    let maxDensity = Number.NEGATIVE_INFINITY;

    yPondNames.forEach((pondName, yIndex) => {
      const pointsByDay = pointsByPond.get(pondName);
      const lineData = xDateKeys.map((dateKey, xIndex) => {
        const point = pointsByDay.get(dateKey);

        if (!point) {
          return null;
        }

        const value = point.densityValue;
        minDensity = Math.min(minDensity, value);
        maxDensity = Math.max(maxDensity, value);

        heatmapPoints.push({
          value: [xIndex, yIndex, value],
          pondName
        });

        return value;
      });

      lineSeries.push({
        name: pondName,
        type: "line",
        smooth: false,
        showSymbol: false,
        sampling: "lttb",
        data: lineData,
        emphasis: {
          focus: "series"
        }
      });
    });

    if (!Number.isFinite(minDensity) || !Number.isFinite(maxDensity)) {
      minDensity = 0;
      maxDensity = 1;
    }

    if (maxDensity === minDensity) {
      maxDensity = Number((maxDensity + 1).toFixed(2));
    }

    return {
      hasData: heatmapPoints.length > 0,
      xAxisLabels,
      yPondNames,
      heatmapPoints,
      lineSeries,
      minDensity,
      maxDensity
    };
  }, [historyRows, pondVolumeIndex]);

  const densityChartOption = useMemo(() => {
    if (!densityChartState.hasData) {
      return null;
    }

    if (densityChartMode === "line") {
      return densityLineOption({
        xAxisLabels: densityChartState.xAxisLabels,
        series: densityChartState.lineSeries,
        maxDensity: densityChartState.maxDensity
      });
    }

    return densityHeatmapOption({
      xAxisLabels: densityChartState.xAxisLabels,
      yAxisLabels: densityChartState.yPondNames,
      points: densityChartState.heatmapPoints,
      minDensity: densityChartState.minDensity,
      maxDensity: densityChartState.maxDensity
    });
  }, [densityChartMode, densityChartState]);

  const totalHistoryPages = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE));

  const pagedHistoryRows = useMemo(() => {
    const startIndex = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return historyRows.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);
  }, [historyRows, historyPage]);

  useEffect(() => {
    setEditableSummaryRows(biomassByPondRows);
  }, [biomassByPondRows]);

  useEffect(() => {
    setHistoryPage((currentPage) => {
      if (currentPage < 1) {
        return 1;
      }

      if (currentPage > totalHistoryPages) {
        return totalHistoryPages;
      }

      return currentPage;
    });
  }, [totalHistoryPages]);

  useEffect(() => {
    if (survivalPondOptions.length === 0) {
      if (selectedSurvivalPond !== "") {
        setSelectedSurvivalPond("");
      }

      return;
    }

    if (!survivalPondOptions.includes(selectedSurvivalPond)) {
      setSelectedSurvivalPond(survivalPondOptions[0]);
    }
  }, [selectedSurvivalPond, survivalPondOptions]);

  const beginCellEdit = (rowKey, field, value) => {
    setEditingCell({ rowKey, field });
    setEditingValue(value === null || value === undefined ? "" : String(value));
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setEditingValue("");
  };

  const normalizeEditableRow = (row) => {
    const normalizeNumericValue = (value, options = {}) => {
      const { integer = false } = options;

      if (value === null || value === undefined || value === "") {
        return null;
      }

      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return null;
      }

      const nonNegativeValue = Math.max(0, numericValue);
      if (integer) {
        return Math.round(nonNegativeValue);
      }

      return Number(nonNegativeValue.toFixed(2));
    };

    const normalized = {
      ...row,
      biomassKgValue: normalizeNumericValue(row.biomassKgValue),
      biomassUnitsValue: normalizeNumericValue(row.biomassUnitsValue, { integer: true }),
      mortalityKgValue: normalizeNumericValue(row.mortalityKgValue),
      mortalityUnitsValue: normalizeNumericValue(row.mortalityUnitsValue, { integer: true })
    };

    if (Number.isFinite(normalized.biomassKgValue) && Number.isFinite(normalized.mortalityKgValue)) {
      normalized.mortalityKgValue = Number(
        Math.min(normalized.mortalityKgValue, normalized.biomassKgValue).toFixed(2)
      );
    }

    if (
      Number.isFinite(normalized.biomassUnitsValue) &&
      Number.isFinite(normalized.mortalityUnitsValue)
    ) {
      normalized.mortalityUnitsValue = Math.min(
        normalized.mortalityUnitsValue,
        normalized.biomassUnitsValue
      );
    }

    normalized.averageWeightGValue = calculateAverageWeightFromRow(normalized);
    normalized.mortalityPercentValue = calculateMortalityPercentFromRow(normalized);

    const derived = calculateDerivedBiomassMetrics(normalized, {
      previousBiomassKgValue: row.previousBiomassKgValue,
      previousCapturedAt: row.previousCapturedAt,
      thirdBiomassKgValue: row.thirdBiomassKgValue,
      totalMortalityUnitsValue: row.totalMortalityUnitsValue,
      referenceBiomassUnitsValue: row.referenceBiomassUnitsValue,
      latestMortalityUnitsOriginalValue: row.latestMortalityUnitsOriginalValue
    });

    Object.assign(normalized, derived);

    return normalized;
  };

  const commitCellEdit = () => {
    if (!editingCell) {
      return;
    }

    const numericFields = new Set([
      "biomassKgValue",
      "biomassUnitsValue",
      "mortalityKgValue",
      "mortalityUnitsValue"
    ]);
    const integerFields = new Set(["biomassUnitsValue", "mortalityUnitsValue"]);
    const mortalityInputs = new Set([
      "biomassKgValue",
      "biomassUnitsValue",
      "mortalityKgValue",
      "mortalityUnitsValue"
    ]);
    const field = editingCell.field;
    const rawValue = editingValue.trim();
    const editTimestamp = new Date().toISOString();
    const targetRow = editableSummaryRows.find((row) => row.rowKey === editingCell.rowKey);

    if (!targetRow) {
      setEditingCell(null);
      setEditingValue("");
      return;
    }

    let updatedRow = targetRow;

    if (numericFields.has(field)) {
      if (rawValue === "") {
        updatedRow = {
          ...targetRow,
          [field]: null
        };
      } else {
        const parsed = Number(rawValue.replace(",", "."));
        if (!Number.isFinite(parsed)) {
          setEditingCell(null);
          setEditingValue("");
          return;
        }

        updatedRow = {
          ...targetRow,
          [field]: integerFields.has(field)
            ? Math.max(0, Math.round(parsed))
            : Number(parsed.toFixed(2))
        };
      }

      if (mortalityInputs.has(field)) {
        updatedRow = normalizeEditableRow(updatedRow);
      }
    } else {
      if (rawValue === "") {
        setEditingCell(null);
        setEditingValue("");
        return;
      }

      updatedRow = {
        ...targetRow,
        [field]: rawValue
      };
    }

    const updatedRowWithTimestamp = {
      ...updatedRow,
      lastCapturedAt: editTimestamp
    };

    const historyEntryToAppend = buildHistoryEntryFromSummaryRow(
      updatedRowWithTimestamp,
      editTimestamp
    );

    setEditableSummaryRows((currentRows) =>
      currentRows.map((row) =>
        row.rowKey === editingCell.rowKey ? updatedRowWithTimestamp : row
      )
    );

    setManualHistoryRows((currentRows) => [historyEntryToAppend, ...currentRows].slice(0, 500));

    setEditingCell(null);
    setEditingValue("");
  };

  const renderEditableCell = (row, field, options = {}) => {
    const { decimals = 2, text = false } = options;
    const isEditing = editingCell?.rowKey === row.rowKey && editingCell?.field === field;
    const rawValue = row[field];
    const displayValue = text ? rawValue || "-" : formatNumberCell(rawValue, decimals);

    if (isEditing) {
      return (
        <input
          className="biomass-cell-input"
          value={editingValue}
          autoFocus
          onChange={(event) => setEditingValue(event.target.value)}
          onBlur={commitCellEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitCellEdit();
            } else if (event.key === "Escape") {
              cancelCellEdit();
            }
          }}
        />
      );
    }

    return (
      <button
        type="button"
        className="biomass-editable-cell"
        onClick={() => beginCellEdit(row.rowKey, field, rawValue)}
      >
        {displayValue}
      </button>
    );
  };

  const renderFcrCell = (fcrValue, speciesVariant) => {
    const severity = classifyFcrSeverity(fcrValue, speciesVariant);
    const displayValue = formatNumberCell(fcrValue, 2);

    return (
      <span
        className={`biomass-fcr-chip biomass-fcr-chip-${severity}`}
        title={buildFcrThresholdTooltip(speciesVariant)}
      >
        {displayValue}
      </span>
    );
  };

  return (
    <section className="biomass-page">
      {showSummarySection ? (
        <article className="panel biomass-summary-panel">
          <h3>Resumen por piscina</h3>
          {biomassTableState.isDemo ? (
            <p className="biomass-demo-note">
              No hay registros reales todavía. Se muestran datos demo para visualizar la sección.
            </p>
          ) : null}

          <div className="biomass-survival-block">
            <div className="biomass-survival-head">
              <div>
                <h4>Embudo de supervivencia (estimado)</h4>
                <p>
                  Evolución estimada desde alevines hasta venta, usando biomasa y mortalidad por
                  piscina.
                </p>
              </div>

              <div
                className="biomass-survival-toolbar"
                role="group"
                aria-label="Configuracion del embudo de supervivencia"
              >
                <label className="biomass-survival-control">
                  Vista
                  <select value={survivalScope} onChange={(event) => setSurvivalScope(event.target.value)}>
                    <option value="total">Total</option>
                    <option value="pond">Por piscina</option>
                  </select>
                </label>

                {survivalScope === "pond" ? (
                  <label className="biomass-survival-control">
                    Piscina
                    <select
                      value={selectedSurvivalPond}
                      onChange={(event) => setSelectedSurvivalPond(event.target.value)}
                      disabled={survivalPondOptions.length === 0}
                    >
                      {survivalPondOptions.map((pondLabel) => (
                        <option key={pondLabel} value={pondLabel}>
                          {pondLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </div>

            <p className="biomass-survival-note">{survivalDataSourceText}</p>

            {activeSurvivalStats ? (
              <>
                <p className="biomass-survival-meta">
                  Supervivencia estimada: <strong>{formatNumberCell(activeSurvivalRate, 1)}%</strong>
                  ({activeSurvivalStats.soldCount} de {activeSurvivalStats.initialCount} peces)
                  {survivalScope === "pond"
                    ? ` en ${activeSurvivalStats.pondLabel}.`
                    : " en total del resumen actual."}
                </p>

                <div className="biomass-survival-chart">
                  <ReactECharts
                    option={survivalFunnelOption}
                    style={{ height: "100%", width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
              </>
            ) : (
              <p className="biomass-density-help">No hay datos suficientes para estimar supervivencia.</p>
            )}
          </div>

          <p className="biomass-edit-hint">
            Haz clic en una celda para editar su valor. Peso medio y Mortalidad (%) se calculan
            automáticamente con límites válidos. La proyección se estima a {PROJECTION_TARGET_DAYS} días.
          </p>
          <div className="table-wrap">
            <table className="biomass-summary-table">
              <thead>
                <tr>
                  <th>Piscina</th>
                  <th>Biomasa (kg)</th>
                  <th>Biomasa (uds)</th>
                  <th>Peso medio (g)</th>
                  <th>Mortalidad (kg)</th>
                  <th>Mortalidad (uds)</th>
                  <th>Mortalidad (%)</th>
                  <th>Biomasa neta viva (kg)</th>
                  <th>Delta biomasa (kg)</th>
                  <th>Delta biomasa (%)</th>
                  <th>Crecimiento (kg/día)</th>
                  <th>Crecimiento pez (g/pez/día)</th>
                  <th>FCR</th>
                  <th>Mortalidad acumulada (%)</th>
                  <th>Supervivencia (%)</th>
                  <th>Días desde actualización</th>
                  <th>Estado tendencia</th>
                  <th>Proyección 30 días (kg)</th>
                  <th>Última lectura</th>
                </tr>
              </thead>
              <tbody>
                {biomassTableState.isLoading ? (
                  <tr>
                    <td colSpan={19} className="biomass-table-empty">Cargando resumen...</td>
                  </tr>
                ) : editableSummaryRows.length > 0 ? (
                  editableSummaryRows.map((row) => (
                    <tr key={row.rowKey}>
                      <td>{row.pondName}</td>
                      <td>{renderEditableCell(row, "biomassKgValue", { decimals: 2 })}</td>
                      <td>{renderEditableCell(row, "biomassUnitsValue", { decimals: 0 })}</td>
                      <td>
                        <span className="biomass-computed-cell">
                          {formatNumberCell(row.averageWeightGValue, 2)}
                        </span>
                      </td>
                      <td>{renderEditableCell(row, "mortalityKgValue", { decimals: 2 })}</td>
                      <td>{renderEditableCell(row, "mortalityUnitsValue", { decimals: 0 })}</td>
                      <td>
                        <span className="biomass-computed-cell">
                          {formatNumberCell(row.mortalityPercentValue, 2)}
                        </span>
                      </td>
                      <td>{formatNumberCell(row.netBiomassKgValue, 2)}</td>
                      <td>{formatNumberCell(row.deltaBiomassKgValue, 2)}</td>
                      <td>{formatNumberCell(row.deltaBiomassPercentValue, 2)}</td>
                      <td>{formatNumberCell(row.growthDailyKgValue, 2)}</td>
                      <td>{formatNumberCell(row.growthPerFishGPerDayValue, 2)}</td>
                      <td>{renderFcrCell(row.fcrValue, row.speciesVariant)}</td>
                      <td>{formatNumberCell(row.cumulativeMortalityPercentValue, 2)}</td>
                      <td>{formatNumberCell(row.survivalPercentValue, 2)}</td>
                      <td>{formatNumberCell(row.daysSinceUpdateValue, 1)}</td>
                      <td>{row.trendStateValue || "Sin datos"}</td>
                      <td>{formatNumberCell(row.projectionTargetKgValue, 2)}</td>
                      <td>{row.lastCapturedAt ? new Date(row.lastCapturedAt).toLocaleString() : "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={19} className="biomass-table-empty">No hay piscinas para mostrar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {showDensitySection ? (
        <article className="panel biomass-density-panel">
          <h3>Densidad de peces</h3>
          <p className="biomass-density-note">
            La densidad se calcula como Biomasa (kg) / Volumen de piscina (m³).
          </p>
          {biomassTableState.isDemo ? (
            <p className="biomass-demo-note">
              No hay registros reales todavía. Se muestran datos demo para visualizar la sección.
            </p>
          ) : null}
          {densityCoverage.estimatedVolumeCount > 0 ? (
            <p className="biomass-density-help">
              Volumen estimado automáticamente en {densityCoverage.estimatedVolumeCount} piscina(s)
              sin configuración explícita.
            </p>
          ) : null}

          <div className="biomass-density-chart-head">
            <h4>Evolución de densidad por piscina</h4>
            <div className="biomass-density-mode" role="tablist" aria-label="Modo de gráfica densidad">
              <button
                type="button"
                role="tab"
                className={`biomass-density-mode-button${densityChartMode === "heatmap" ? " biomass-density-mode-button-active" : ""}`}
                aria-selected={densityChartMode === "heatmap"}
                onClick={() => setDensityChartMode("heatmap")}
              >
                Heatmap
              </button>
              <button
                type="button"
                role="tab"
                className={`biomass-density-mode-button${densityChartMode === "line" ? " biomass-density-mode-button-active" : ""}`}
                aria-selected={densityChartMode === "line"}
                onClick={() => setDensityChartMode("line")}
              >
                Líneas
              </button>
            </div>
          </div>

          {densityChartOption ? (
            <div className="biomass-density-chart">
              <ReactECharts option={densityChartOption} style={{ height: 420 }} notMerge lazyUpdate />
            </div>
          ) : (
            <p className="biomass-density-help">No hay datos suficientes para graficar la evolución.</p>
          )}

          <div className="table-wrap">
            <table className="biomass-density-table">
              <thead>
                <tr>
                  <th>Piscina</th>
                  <th>Volumen (m³)</th>
                  <th>Peso de peces (kg)</th>
                  <th>Densidad (kg/m³)</th>
                  <th>Fuente volumen</th>
                  <th>Última lectura</th>
                </tr>
              </thead>
              <tbody>
                {biomassTableState.isLoading ? (
                  <tr>
                    <td colSpan={6} className="biomass-table-empty">Cargando densidad por piscina...</td>
                  </tr>
                ) : densityTableRows.length > 0 ? (
                  densityTableRows.map((row) => (
                    <tr key={`density-${row.rowKey}`}>
                      <td>{row.pondName}</td>
                      <td>{formatNumberCell(row.volumeM3, 1)}</td>
                      <td>{formatNumberCell(row.biomassKg, 2)}</td>
                      <td>{formatNumberCell(row.densityKgM3, 2)}</td>
                      <td>
                        {Number.isFinite(row.volumeM3) ? (
                          <span
                            className={`biomass-volume-source${row.isEstimatedVolume ? " biomass-volume-source-estimated" : ""}`}
                          >
                            {row.isEstimatedVolume ? "Estimado" : "Configurado"}
                          </span>
                        ) : (
                          <span className="biomass-volume-source biomass-volume-source-missing">Sin volumen</span>
                        )}
                      </td>
                      <td>{row.lastCapturedAt ? new Date(row.lastCapturedAt).toLocaleString() : "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="biomass-table-empty">No hay piscinas para mostrar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {showHistorySection ? (
        <article className="panel biomass-history-panel">
          <h3>Historial Biomasa</h3>
          <div className="table-wrap biomass-history-wrap">
            <table className="biomass-history-table">
              <thead>
                <tr>
                  <th>Piscina</th>
                  <th>Biomasa (kg)</th>
                  <th>Biomasa (uds)</th>
                  <th>Peso medio (g)</th>
                  <th>Mortalidad (kg)</th>
                  <th>Mortalidad (uds)</th>
                  <th>Mortalidad (%)</th>
                  <th>Biomasa neta viva (kg)</th>
                  <th>Delta biomasa (kg)</th>
                  <th>Delta biomasa (%)</th>
                  <th>Crecimiento (kg/día)</th>
                  <th>Crecimiento pez (g/pez/día)</th>
                  <th>FCR</th>
                  <th>Mortalidad acumulada (%)</th>
                  <th>Supervivencia (%)</th>
                  <th>Días desde actualización</th>
                  <th>Estado tendencia</th>
                  <th>Proyección 30 días (kg)</th>
                  <th>Última lectura</th>
                </tr>
              </thead>
              <tbody>
                {biomassTableState.isLoading ? (
                  <tr>
                    <td colSpan={19} className="biomass-table-empty">Cargando registros...</td>
                  </tr>
                ) : pagedHistoryRows.length > 0 ? (
                  pagedHistoryRows.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.pond_name}</td>
                      <td>{formatNumberCell(entry.biomassKgValue, 2)}</td>
                      <td>{formatNumberCell(entry.biomassUnitsValue, 0)}</td>
                      <td>{formatNumberCell(entry.averageWeightGValue, 2)}</td>
                      <td>{formatNumberCell(entry.mortalityKgValue, 2)}</td>
                      <td>{formatNumberCell(entry.mortalityUnitsValue, 0)}</td>
                      <td>{formatNumberCell(entry.mortalityPercentValue, 2)}</td>
                      <td>{formatNumberCell(entry.netBiomassKgValue, 2)}</td>
                      <td>{formatNumberCell(entry.deltaBiomassKgValue, 2)}</td>
                      <td>{formatNumberCell(entry.deltaBiomassPercentValue, 2)}</td>
                      <td>{formatNumberCell(entry.growthDailyKgValue, 2)}</td>
                      <td>{formatNumberCell(entry.growthPerFishGPerDayValue, 2)}</td>
                      <td>{renderFcrCell(entry.fcrValue, entry.species_variant)}</td>
                      <td>{formatNumberCell(entry.cumulativeMortalityPercentValue, 2)}</td>
                      <td>{formatNumberCell(entry.survivalPercentValue, 2)}</td>
                      <td>{formatNumberCell(entry.daysSinceUpdateValue, 1)}</td>
                      <td>{entry.trendStateValue || "Sin datos"}</td>
                      <td>{formatNumberCell(entry.projectionTargetKgValue, 2)}</td>
                      <td>{entry.lastCapturedAt ? new Date(entry.lastCapturedAt).toLocaleString() : "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={19} className="biomass-table-empty">No hay registros para mostrar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!biomassTableState.isLoading && totalHistoryPages > 1 ? (
            <div
              className="biomass-history-pagination"
              role="navigation"
              aria-label="Paginacion historial biomasa"
            >
              {Array.from({ length: totalHistoryPages }, (_, index) => {
                const page = index + 1;
                const isActive = page === historyPage;

                return (
                  <button
                    key={`history-page-${page}`}
                    type="button"
                    className={`biomass-page-button${isActive ? " biomass-page-button-active" : ""}`}
                    onClick={() => setHistoryPage(page)}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
