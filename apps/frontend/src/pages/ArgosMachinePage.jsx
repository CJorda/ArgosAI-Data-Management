import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { BlockMath } from "react-katex";
import { flushSync } from "react-dom";
import { useParams } from "react-router-dom";
import { cameraInferenceRequest, cameraSessionsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "katex/dist/katex.min.css";
import "./ArgosMachinePage.css";

const machineProfiles = {
  "growth-nano": {
    key: "growth-nano",
    name: "ArgosAI Growth Nano",
    machineType: "ArgosAI Growth Nano",
    throughput: "Hasta 60 peces/min",
    cameraSpec: "Camara compacta USB3",
    species: "Rodaballo",
    durationMinutes: 12,
    description:
      "Equipo compacto para conteo y biomasa en lineas de bajo caudal, ideal para validacion de lotes y muestreo diario.",
    instances: [
      {
        machineId: "ARG-NANO-CAM-01",
        label: "Growth Nano 1",
        startTank: "Tanque 1",
        endTank: "Tanque A"
      },
      {
        machineId: "ARG-NANO-CAM-02",
        label: "Growth Nano 2",
        startTank: "Tanque 2",
        endTank: "Tanque B"
      }
    ]
  },
  "growth-s": {
    key: "growth-s",
    name: "ArgosAI Growth S",
    machineType: "ArgosAI Growth S",
    throughput: "Hasta 120 peces/min",
    cameraSpec: "Camara industrial FLIR",
    species: "Rodaballo",
    durationMinutes: 16,
    description:
      "Version estandar para operacion continua en granja, con seguimiento de conteo por tanda y biomasa estimada por paso.",
    instances: [
      {
        machineId: "ARG-S-CAM-02",
        label: "Growth S 1",
        startTank: "Tanque 3",
        endTank: "Tanque C"
      }
    ]
  },
  "growth-l": {
    key: "growth-l",
    name: "ArgosAI Growth L",
    machineType: "ArgosAI Growth L",
    throughput: "Hasta 220 peces/min",
    cameraSpec: "Camara industrial dual",
    species: "Rodaballo",
    durationMinutes: 20,
    description:
      "Version de alto caudal pensada para lotes grandes, con mayor cobertura de paso y consolidacion por ciclo.",
    instances: [
      {
        machineId: "ARG-L-CAM-03",
        label: "Growth L 1",
        startTank: "Tanque 4",
        endTank: "Tanque D"
      }
    ]
  },
  grader: {
    key: "grader",
    name: "ArgosAI Grader",
    machineType: "ArgosAI Grader",
    throughput: "Clasificacion multicanal",
    cameraSpec: "Camara alta velocidad",
    species: "Trucha",
    durationMinutes: 18,
    description:
      "Modulo de clasificacion visual para segmentar tallas, contar individuos y aportar estimacion de biomasa por fraccion.",
    instances: [
      {
        machineId: "ARG-GRADER-CAM-01",
        label: "Grader 1",
        startTank: "Canal de entrada",
        endTank: "Canal de salida"
      }
    ]
  }
};

const inferenceRangePresets = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "custom", label: "Custom" }
];

const demoInferenceSeriesByMachine = {
  "growth-nano": [
    { totalCount: 552, meanMassG: 42.7, stdDeviationG: 6.5 },
    { totalCount: 578, meanMassG: 43.4, stdDeviationG: 6.6 },
    { totalCount: 603, meanMassG: 44.1, stdDeviationG: 6.7 },
    { totalCount: 629, meanMassG: 45.0, stdDeviationG: 6.9 },
    { totalCount: 614, meanMassG: 44.6, stdDeviationG: 6.8 },
    { totalCount: 589, meanMassG: 43.8, stdDeviationG: 6.7 },
    { totalCount: 561, meanMassG: 43.0, stdDeviationG: 6.6 },
    { totalCount: 538, meanMassG: 42.4, stdDeviationG: 6.5 },
    { totalCount: 546, meanMassG: 42.6, stdDeviationG: 6.5 },
    { totalCount: 569, meanMassG: 43.3, stdDeviationG: 6.6 },
    { totalCount: 594, meanMassG: 44.0, stdDeviationG: 6.8 },
    { totalCount: 621, meanMassG: 44.8, stdDeviationG: 6.9 },
    { totalCount: 637, meanMassG: 45.3, stdDeviationG: 7.0 },
    { totalCount: 612, meanMassG: 44.5, stdDeviationG: 6.8 }
  ],
  "growth-s": [
    { totalCount: 1028, meanMassG: 67.9, stdDeviationG: 8.4 },
    { totalCount: 1064, meanMassG: 68.6, stdDeviationG: 8.5 },
    { totalCount: 1107, meanMassG: 69.5, stdDeviationG: 8.7 },
    { totalCount: 1148, meanMassG: 70.6, stdDeviationG: 8.9 },
    { totalCount: 1124, meanMassG: 70.0, stdDeviationG: 8.8 },
    { totalCount: 1083, meanMassG: 69.1, stdDeviationG: 8.6 },
    { totalCount: 1039, meanMassG: 68.2, stdDeviationG: 8.5 },
    { totalCount: 996, meanMassG: 67.4, stdDeviationG: 8.4 },
    { totalCount: 1012, meanMassG: 67.8, stdDeviationG: 8.4 },
    { totalCount: 1057, meanMassG: 68.7, stdDeviationG: 8.6 },
    { totalCount: 1102, meanMassG: 69.6, stdDeviationG: 8.8 },
    { totalCount: 1143, meanMassG: 70.5, stdDeviationG: 8.9 },
    { totalCount: 1180, meanMassG: 71.4, stdDeviationG: 9.1 },
    { totalCount: 1136, meanMassG: 70.4, stdDeviationG: 8.9 }
  ],
  "growth-l": [
    { totalCount: 1658, meanMassG: 113.4, stdDeviationG: 11.8 },
    { totalCount: 1715, meanMassG: 115.0, stdDeviationG: 12.0 },
    { totalCount: 1782, meanMassG: 116.8, stdDeviationG: 12.2 },
    { totalCount: 1846, meanMassG: 118.5, stdDeviationG: 12.5 },
    { totalCount: 1804, meanMassG: 117.4, stdDeviationG: 12.3 },
    { totalCount: 1741, meanMassG: 115.8, stdDeviationG: 12.1 },
    { totalCount: 1674, meanMassG: 114.0, stdDeviationG: 11.9 },
    { totalCount: 1616, meanMassG: 112.6, stdDeviationG: 11.7 },
    { totalCount: 1639, meanMassG: 113.1, stdDeviationG: 11.8 },
    { totalCount: 1702, meanMassG: 114.7, stdDeviationG: 12.0 },
    { totalCount: 1768, meanMassG: 116.4, stdDeviationG: 12.2 },
    { totalCount: 1832, meanMassG: 118.0, stdDeviationG: 12.4 },
    { totalCount: 1894, meanMassG: 119.6, stdDeviationG: 12.7 },
    { totalCount: 1826, meanMassG: 117.8, stdDeviationG: 12.4 }
  ],
  grader: [
    { totalCount: 748, meanMassG: 56.4, stdDeviationG: 8.2 },
    { totalCount: 782, meanMassG: 57.2, stdDeviationG: 8.3 },
    { totalCount: 816, meanMassG: 58.0, stdDeviationG: 8.4 },
    { totalCount: 853, meanMassG: 58.9, stdDeviationG: 8.6 },
    { totalCount: 834, meanMassG: 58.4, stdDeviationG: 8.5 },
    { totalCount: 798, meanMassG: 57.5, stdDeviationG: 8.3 },
    { totalCount: 764, meanMassG: 56.7, stdDeviationG: 8.2 },
    { totalCount: 731, meanMassG: 56.0, stdDeviationG: 8.1 },
    { totalCount: 742, meanMassG: 56.2, stdDeviationG: 8.1 },
    { totalCount: 777, meanMassG: 57.0, stdDeviationG: 8.2 },
    { totalCount: 811, meanMassG: 57.8, stdDeviationG: 8.4 },
    { totalCount: 846, meanMassG: 58.7, stdDeviationG: 8.5 },
    { totalCount: 879, meanMassG: 59.4, stdDeviationG: 8.6 },
    { totalCount: 838, meanMassG: 58.5, stdDeviationG: 8.4 }
  ]
};

function resolveDemoSeriesPoint(series, sampleIndex, sampleCount) {
  if (!Array.isArray(series) || series.length === 0) {
    return {
      totalCount: 600,
      meanMassG: 64,
      stdDeviationG: 8
    };
  }

  if (series.length === 1 || sampleCount <= 1) {
    return series[0];
  }

  const ratio = sampleIndex / (sampleCount - 1);
  const sourcePosition = ratio * (series.length - 1);
  const lowerIndex = Math.floor(sourcePosition);
  const upperIndex = Math.min(series.length - 1, lowerIndex + 1);
  const blend = sourcePosition - lowerIndex;
  const lowerPoint = series[lowerIndex];
  const upperPoint = series[upperIndex];

  return {
    totalCount: Math.round(lowerPoint.totalCount + (upperPoint.totalCount - lowerPoint.totalCount) * blend),
    meanMassG: Number((lowerPoint.meanMassG + (upperPoint.meanMassG - lowerPoint.meanMassG) * blend).toFixed(2)),
    stdDeviationG: Number((lowerPoint.stdDeviationG + (upperPoint.stdDeviationG - lowerPoint.stdDeviationG) * blend).toFixed(2))
  };
}

function parseHistogramLabelRange(label) {
  const text = String(label ?? "").trim();
  const match = text.match(/^(-?\d+(?:[.,]\d+)?)\s*-\s*(-?\d+(?:[.,]\d+)?)$/);

  if (!match) {
    return null;
  }

  const start = Number(match[1].replace(",", "."));
  const end = Number(match[2].replace(",", "."));

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  return {
    start,
    end
  };
}

function formatGaussianValue(value, decimals) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  return numericValue.toFixed(decimals);
}

function toCalendarDateKey(value) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildSurvivalFunnelStages(initialCount, soldCount) {
  const stageNames = ["Alevines", "Juveniles", "Pre-engorde", "Engorde", "Venta"];
  const palette = ["#d9ebff", "#bad8fb", "#94c2ee", "#669fd8", "#2f73b7"];

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

function toDateTimeLocalInput(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const pad = (numeric) => String(numeric).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function resolveInferenceWindow(rangePreset, customFromInput, customToInput) {
  const now = new Date();
  let fromDate = null;
  let toDate = new Date(now);

  if (rangePreset === "24h") {
    fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (rangePreset === "7d") {
    fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (rangePreset === "30d") {
    fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    const parsedFrom = customFromInput ? new Date(customFromInput) : null;
    const parsedTo = customToInput ? new Date(customToInput) : null;

    fromDate = parsedFrom && Number.isFinite(parsedFrom.getTime()) ? parsedFrom : null;
    toDate = parsedTo && Number.isFinite(parsedTo.getTime()) ? parsedTo : now;
  }

  if (!fromDate) {
    fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000);
  }

  if (fromDate.getTime() > toDate.getTime()) {
    const swap = fromDate;
    fromDate = toDate;
    toDate = swap;
  }

  return {
    fromDate,
    toDate,
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString()
  };
}

function buildDemoMassHistogram(meanMassG, stdDeviationG, totalCount) {
  const safeTotalCount = Math.max(1, Math.round(totalCount));
  const safeStdDeviation = Math.max(2, Number(stdDeviationG) || 6);
  const xMin = Math.max(5, meanMassG - safeStdDeviation * 3.2);
  const xMax = meanMassG + safeStdDeviation * 3.2;
  const binCount = 16;
  const binWidth = (xMax - xMin) / binCount;

  const weights = Array.from({ length: binCount }, (_value, index) => {
    const center = xMin + binWidth * (index + 0.5);
    const zScore = (center - meanMassG) / safeStdDeviation;
    return Math.exp(-0.5 * zScore * zScore);
  });

  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const bins = weights.map((value) => Math.floor((value / totalWeight) * safeTotalCount));

  let assigned = bins.reduce((sum, value) => sum + value, 0);
  let pointer = Math.floor(binCount / 2);
  while (assigned < safeTotalCount) {
    bins[pointer % binCount] += 1;
    assigned += 1;
    pointer += 1;
  }

  const labels = bins.map((_value, index) => {
    const start = xMin + index * binWidth;
    const end = start + binWidth;
    return `${start.toFixed(1)}-${end.toFixed(1)}`;
  });

  return {
    xMin: Number(xMin.toFixed(3)),
    xMax: Number(xMax.toFixed(3)),
    binWidth: Number(binWidth.toFixed(3)),
    bins,
    labels,
    totalSamples: safeTotalCount
  };
}

function buildDemoInferenceRows({ machineKey, machineIds, fromDate, toDate, rangePreset }) {
  const profileSeries =
    demoInferenceSeriesByMachine[machineKey] || demoInferenceSeriesByMachine["growth-s"];
  const spanMs = Math.max(60 * 60 * 1000, toDate.getTime() - fromDate.getTime());

  let samplesPerMachine = 12;
  if (rangePreset === "24h") {
    samplesPerMachine = 8;
  } else if (rangePreset === "7d") {
    samplesPerMachine = 14;
  } else if (rangePreset === "30d") {
    samplesPerMachine = 22;
  } else {
    const days = spanMs / (24 * 60 * 60 * 1000);
    samplesPerMachine = clamp(Math.round(days * 2), 6, 24);
  }

  const effectiveMachineIds = Array.isArray(machineIds) && machineIds.length > 0 ? machineIds : ["MACHINE-001"];
  const stepMs = samplesPerMachine > 1 ? spanMs / (samplesPerMachine - 1) : spanMs;
  const rows = [];

  effectiveMachineIds.forEach((machineId, machineIndex) => {
    const machineCountFactor = 1 + machineIndex * 0.035;
    const machineMassFactor = 1 + machineIndex * 0.012;

    for (let index = 0; index < samplesPerMachine; index += 1) {
      const eventAtMs = fromDate.getTime() + index * stepMs + machineIndex * 60000;
      const demoPoint = resolveDemoSeriesPoint(profileSeries, index, samplesPerMachine);

      const totalCount = Math.max(50, Math.round(demoPoint.totalCount * machineCountFactor));
      const meanMassG = Math.max(12, Number((demoPoint.meanMassG * machineMassFactor).toFixed(2)));
      const stdDeviationG = Number((demoPoint.stdDeviationG * machineMassFactor).toFixed(2));

      const totalMassKg = Number(((totalCount * meanMassG) / 1000).toFixed(3));
      const histogram = buildDemoMassHistogram(meanMassG, stdDeviationG, totalCount);

      rows.push({
        idInference: machineIndex * 100000 + index + 1,
        machineId,
        createdAt: new Date(eventAtMs - 60000).toISOString(),
        startTimestamp: new Date(eventAtMs - 45000).toISOString(),
        endTimestamp: new Date(eventAtMs).toISOString(),
        eventAt: new Date(eventAtMs).toISOString(),
        totalCount,
        totalMassKg,
        meanMassG,
        stdDeviationG,
        massHistRaw: null,
        histogram
      });
    }
  });

  return rows.sort((left, right) => toTimestamp(right.eventAt) - toTimestamp(left.eventAt));
}

function formatClockTime(value) {
  if (!value) {
    return "--:--:--";
  }

  return new Date(value).toLocaleTimeString("es-ES", { hour12: false });
}

function toTimestamp(value) {
  const numeric = new Date(value).getTime();
  return Number.isFinite(numeric) ? numeric : 0;
}

function pseudoRandom(seed) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildFishFrameDataUri(machineKey, frameIndex, fishCount, biomassKg) {
  const renderFishCount = clamp(Math.round(fishCount), 0, 120);
  const laneCount = 4;
  const lanes = Array.from({ length: laneCount }, (_, laneIndex) => {
    const y = 60 + laneIndex * 95;
    return `<line x1="16" y1="${y}" x2="1264" y2="${y}" stroke="rgba(140,199,255,0.22)" stroke-width="2" stroke-dasharray="8 8" />`;
  }).join("");

  const fishShapes = Array.from({ length: renderFishCount }, (_, fishIndex) => {
    const laneIndex = fishIndex % laneCount;
    const laneY = 60 + laneIndex * 95;
    const width = 18 + Math.round(pseudoRandom((frameIndex + 1) * (fishIndex + 3)) * 18);
    const height = Math.max(8, Math.round(width * 0.45));
    const x =
      28 +
      Math.round(
        ((fishIndex + 2) * 44 + (frameIndex + 1) * 26 + pseudoRandom(fishIndex * 17 + frameIndex) * 120) %
          1180
      );
    const y = laneY + Math.round((pseudoRandom(fishIndex * 9 + frameIndex * 5) - 0.5) * 18);
    const hueShift = machineKey === "grader" ? 18 : machineKey === "growth-l" ? 8 : 0;
    const fill = `hsl(${196 + hueShift}, ${52 + (fishIndex % 18)}%, ${58 + (fishIndex % 14)}%)`;

    return `
      <g transform="translate(${x} ${y})">
        <ellipse cx="0" cy="0" rx="${width}" ry="${height}" fill="${fill}" opacity="0.9" />
        <polygon points="-${width + 12},0 -${width - 4},-${Math.round(height * 0.8)} -${width - 4},${Math.round(
          height * 0.8
        )}" fill="${fill}" opacity="0.9" />
        <circle cx="${Math.round(width * 0.45)}" cy="-${Math.max(1, Math.round(height * 0.15))}" r="2" fill="#0b304f" opacity="0.85" />
      </g>
    `;
  }).join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 420">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0f3150" />
          <stop offset="50%" stop-color="#17486f" />
          <stop offset="100%" stop-color="#1f5e89" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1280" height="420" fill="url(#bg)" />
      <rect x="18" y="18" width="1244" height="384" rx="18" fill="rgba(8,20,35,0.22)" stroke="rgba(190,222,255,0.3)" stroke-width="2" />
      ${lanes}
      ${fishShapes}
      <text x="34" y="44" fill="#d9edff" font-size="23" font-family="Open Sans, sans-serif" font-weight="700">Secuencia de paso de peces - Frame ${frameIndex + 1}</text>
      <text x="34" y="396" fill="#c8e4ff" font-size="20" font-family="Open Sans, sans-serif">Conteo detectado: ${fishCount} peces | Biomasa estimada: ${biomassKg.toFixed(2)} kg</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildFishFrames(machineKey) {
  const baseCount =
    machineKey === "grader" ? 42 : machineKey === "growth-l" ? 34 : machineKey === "growth-s" ? 26 : 18;

  return Array.from({ length: 12 }, (_, index) => {
    const fishCount = baseCount + ((index * 7) % 14);
    const biomassKg = fishCount * (0.07 + (index % 5) * 0.01 + (machineKey === "growth-l" ? 0.04 : 0));

    return {
      id: `${machineKey}-frame-${index + 1}`,
      fishCount,
      biomassKg: Number(biomassKg.toFixed(2)),
      capturedAt: new Date(Date.now() - (11 - index) * 45 * 1000),
      imageUrl: buildFishFrameDataUri(machineKey, index, fishCount, biomassKg)
    };
  });
}

function buildEstimatedFishLengthsMm(machineKey, frames) {
  const machineOffset = {
    "growth-nano": 0,
    "growth-s": 7,
    "growth-l": 12,
    grader: 18
  }[machineKey] ?? 0;

  return frames.flatMap((frame, frameIndex) => {
    if (!frame.fishCount) {
      return [];
    }

    const avgWeightG = (frame.biomassKg * 1000) / frame.fishCount;
    const sampleCount = Math.min(frame.fishCount, 160);

    return Array.from({ length: sampleCount }, (_, fishIndex) => {
      const jitter = (pseudoRandom((frameIndex + 1) * 991 + (fishIndex + 1) * 47) - 0.5) * 44;
      const lengthMm = 86 + Math.sqrt(Math.max(avgWeightG, 1)) * 16 + machineOffset + jitter;
      return Math.round(clamp(lengthMm, 110, 520));
    });
  });
}

function buildLengthHistogram(lengths, bucketSizeMm = 20) {
  if (!lengths.length) {
    return {
      labels: [],
      counts: [],
      bucketSizeMm
    };
  }

  const minLength = Math.floor(Math.min(...lengths) / bucketSizeMm) * bucketSizeMm;
  const maxLength = Math.ceil(Math.max(...lengths) / bucketSizeMm) * bucketSizeMm;
  const bucketCount = Math.max(1, Math.ceil((maxLength - minLength) / bucketSizeMm));

  const counts = Array.from({ length: bucketCount }, () => 0);

  lengths.forEach((lengthMm) => {
    const index = Math.min(
      bucketCount - 1,
      Math.floor((lengthMm - minLength) / bucketSizeMm)
    );
    counts[index] += 1;
  });

  const labels = counts.map((_value, index) => {
    const start = minLength + index * bucketSizeMm;
    const end = start + bucketSizeMm;
    return `${start}-${end}`;
  });

  return {
    labels,
    counts,
    bucketSizeMm
  };
}

function buildInferenceFrames(machineKey, inferenceRows) {
  if (!Array.isArray(inferenceRows) || inferenceRows.length === 0) {
    return [];
  }

  return inferenceRows
    .slice()
    .sort((left, right) => toTimestamp(left.eventAt) - toTimestamp(right.eventAt))
    .map((row, index) => {
      const fishCount = Math.max(0, Number(row.totalCount) || 0);
      const biomassKg = Math.max(0, Number(row.totalMassKg) || 0);
      const capturedAt = new Date(row.eventAt || row.endTimestamp || row.createdAt || Date.now());

      return {
        id: `${machineKey}-inference-${row.idInference || index}-${capturedAt.getTime()}`,
        fishCount,
        biomassKg,
        capturedAt,
        imageUrl: buildFishFrameDataUri(machineKey, index, fishCount, biomassKg)
      };
    });
}

export function ArgosMachinePage() {
  const { accessToken } = useAuth();
  const { machineKey = "growth-nano" } = useParams();
  const profile = machineProfiles[machineKey] || machineProfiles["growth-nano"];
  const guiScreenRef = useRef(null);

  const [showFrames, setShowFrames] = useState(true);
  const [selectedFrameId, setSelectedFrameId] = useState(null);
  const [showGui, setShowGui] = useState(false);
  const [showGuiStats, setShowGuiStats] = useState(false);
  const [isInferenceRunning, setIsInferenceRunning] = useState(true);
  const [isGuiFullscreen, setIsGuiFullscreen] = useState(false);
  const [guiNow, setGuiNow] = useState(() => new Date());
  const [manualPartialCounter, setManualPartialCounter] = useState(null);
  const [manualTotalCounter, setManualTotalCounter] = useState(null);
  const [selectedRangePreset, setSelectedRangePreset] = useState("7d");
  const [customRangeFrom, setCustomRangeFrom] = useState(() => {
    const now = new Date();
    return toDateTimeLocalInput(new Date(now.getTime() - 48 * 60 * 60 * 1000));
  });
  const [customRangeTo, setCustomRangeTo] = useState(() => toDateTimeLocalInput(new Date()));
  const [forceDemoData, setForceDemoData] = useState(true);
  const [showGaussianCurve, setShowGaussianCurve] = useState(true);
  const [gaussianDecimals, setGaussianDecimals] = useState(3);
  const [survivalScope, setSurvivalScope] = useState("total");
  const [selectedSurvivalPool, setSelectedSurvivalPool] = useState("");
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  const machineInstances = useMemo(
    () =>
      profile.instances?.length
        ? profile.instances
        : [
            {
              machineId: "MACHINE-001",
              label: "Equipo 1",
              startTank: "Tanque 1",
              endTank: "Tanque A"
            }
          ],
    [profile]
  );

  const [selectedMachineId, setSelectedMachineId] = useState(
    machineInstances[0]?.machineId || ""
  );

  const sessionsQuery = useQuery({
    queryKey: ["cameraSessions", "maquina-argos"],
    queryFn: () => cameraSessionsRequest(accessToken),
    enabled: Boolean(accessToken)
  });

  const inferenceWindow = useMemo(
    () => resolveInferenceWindow(selectedRangePreset, customRangeFrom, customRangeTo),
    [selectedRangePreset, customRangeFrom, customRangeTo]
  );

  const inferenceQueryParams = useMemo(() => {
    const limit = selectedRangePreset === "30d" ? 1000 : selectedRangePreset === "7d" ? 500 : 320;

    return {
      from: inferenceWindow.fromIso,
      to: inferenceWindow.toIso,
      limit
    };
  }, [inferenceWindow.fromIso, inferenceWindow.toIso, selectedRangePreset]);

  const inferenceQuery = useQuery({
    queryKey: [
      "cameraInference",
      "maquina-argos",
      profile.key,
      inferenceQueryParams.from,
      inferenceQueryParams.to,
      inferenceQueryParams.limit
    ],
    queryFn: () => cameraInferenceRequest(accessToken, inferenceQueryParams),
    enabled: Boolean(accessToken)
  });

  const inferredMachineInstances = useMemo(() => {
    const byMachine = inferenceQuery.data?.summary?.byMachine || [];

    return byMachine
      .filter(
        (item) =>
          item.machineId &&
          !machineInstances.some((instance) => instance.machineId === item.machineId)
      )
      .map((item, index) => ({
        machineId: item.machineId,
        label: `Machine ${index + 1} (${item.machineId})`,
        startTank: "Tanque variable",
        endTank: "Linea principal"
      }));
  }, [inferenceQuery.data, machineInstances]);

  const machineInstanceOptions = useMemo(
    () => [...machineInstances, ...inferredMachineInstances],
    [machineInstances, inferredMachineInstances]
  );

  const poolLabelByMachineId = useMemo(() => {
    const byMachine = new Map();

    machineInstanceOptions.forEach((instance) => {
      if (!instance.machineId) {
        return;
      }

      const poolLabel = String(
        instance.startTank || instance.label || instance.machineId
      ).trim();

      byMachine.set(instance.machineId, poolLabel || instance.machineId);
    });

    return byMachine;
  }, [machineInstanceOptions]);

  const activeInstance =
    machineInstanceOptions.find((instance) => instance.machineId === selectedMachineId) ||
    machineInstanceOptions[0] ||
    null;

  const machineSessions = useMemo(() => {
    const list = sessionsQuery.data || [];

    if (!activeInstance) {
      return [];
    }

    return list.filter(
      (item) =>
        item.machine_id === activeInstance.machineId && item.machine_type === profile.machineType
    );
  }, [sessionsQuery.data, activeInstance, profile.machineType]);

  const activeSession = useMemo(() => {
    const now = Date.now();
    return (
      machineSessions.find((item) => new Date(item.expires_at).getTime() > now) ||
      machineSessions[0] ||
      null
    );
  }, [machineSessions]);

  const apiInferenceRows = useMemo(() => inferenceQuery.data?.rows || [], [inferenceQuery.data]);

  const demoInferenceRows = useMemo(
    () =>
      buildDemoInferenceRows({
        machineKey: profile.key,
        machineIds: machineInstances.map((instance) => instance.machineId),
        fromDate: inferenceWindow.fromDate,
        toDate: inferenceWindow.toDate,
        rangePreset: selectedRangePreset
      }),
    [
      profile.key,
      machineInstances,
      inferenceWindow.fromDate,
      inferenceWindow.toDate,
      selectedRangePreset
    ]
  );

  const isShowingDemoData = forceDemoData || apiInferenceRows.length === 0;
  const inferenceRows = isShowingDemoData ? demoInferenceRows : apiInferenceRows;

  const selectedMachineInferenceRows = useMemo(() => {
    if (!selectedMachineId) {
      return [];
    }

    return inferenceRows.filter((item) => item.machineId === selectedMachineId);
  }, [inferenceRows, selectedMachineId]);

  const fallbackMachineId = useMemo(() => {
    if (selectedMachineInferenceRows.length > 0) {
      return selectedMachineId;
    }

    return inferenceRows[0]?.machineId || "";
  }, [selectedMachineInferenceRows, selectedMachineId, inferenceRows]);

  const effectiveInferenceRows = useMemo(() => {
    if (selectedMachineInferenceRows.length > 0) {
      return selectedMachineInferenceRows;
    }

    if (!fallbackMachineId) {
      return [];
    }

    return inferenceRows.filter((item) => item.machineId === fallbackMachineId);
  }, [selectedMachineInferenceRows, fallbackMachineId, inferenceRows]);

  const isUsingFallbackMachine = Boolean(
    selectedMachineId && effectiveInferenceRows.length > 0 && selectedMachineInferenceRows.length === 0
  );

  const survivalStatsByPool = useMemo(() => {
    const sortedRows = (inferenceRows || [])
      .slice()
      .sort((left, right) => toTimestamp(left.eventAt) - toTimestamp(right.eventAt));

    const groupedCounts = new Map();

    sortedRows.forEach((row) => {
      const machineId = row.machineId || "SIN-MAQUINA";
      const poolLabel = poolLabelByMachineId.get(machineId) || machineId;
      const fishCount = Math.max(0, Math.round(Number(row.totalCount) || 0));

      if (!groupedCounts.has(poolLabel)) {
        groupedCounts.set(poolLabel, []);
      }

      groupedCounts.get(poolLabel).push(fishCount);
    });

    return Array.from(groupedCounts.entries())
      .map(([poolLabel, counts]) => {
        const validCounts = counts.filter((value) => Number.isFinite(value) && value >= 0);

        if (validCounts.length === 0) {
          return null;
        }

        const sortedDesc = validCounts.slice().sort((left, right) => right - left);
        const topCounts = sortedDesc.slice(0, Math.min(3, sortedDesc.length));
        const estimatedInitialCount = Math.max(
          1,
          Math.round(topCounts.reduce((sum, value) => sum + value, 0) / topCounts.length)
        );
        const latestCount = validCounts[validCounts.length - 1];
        const estimatedSoldCount =
          validCounts.length > 1
            ? Math.max(0, Math.min(estimatedInitialCount, latestCount))
            : Math.max(0, Math.round(estimatedInitialCount * 0.86));

        return {
          poolLabel,
          initialCount: estimatedInitialCount,
          soldCount: estimatedSoldCount,
          samples: validCounts.length
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.poolLabel.localeCompare(right.poolLabel));
  }, [inferenceRows, poolLabelByMachineId]);

  const survivalPoolOptions = useMemo(
    () => survivalStatsByPool.map((item) => item.poolLabel),
    [survivalStatsByPool]
  );

  const totalSurvivalStats = useMemo(() => {
    if (survivalStatsByPool.length === 0) {
      return null;
    }

    const initialCount = survivalStatsByPool.reduce((sum, item) => sum + item.initialCount, 0);
    const soldCountRaw = survivalStatsByPool.reduce((sum, item) => sum + item.soldCount, 0);
    const soldCount = Math.max(0, Math.min(initialCount, soldCountRaw));

    return {
      poolLabel: "Total",
      initialCount: Math.max(1, initialCount),
      soldCount,
      samples: survivalStatsByPool.reduce((sum, item) => sum + item.samples, 0)
    };
  }, [survivalStatsByPool]);

  const activeSurvivalStats = useMemo(() => {
    if (survivalScope === "pool") {
      if (survivalStatsByPool.length === 0) {
        return null;
      }

      return (
        survivalStatsByPool.find((item) => item.poolLabel === selectedSurvivalPool) ||
        survivalStatsByPool[0]
      );
    }

    return totalSurvivalStats;
  }, [selectedSurvivalPool, survivalScope, survivalStatsByPool, totalSurvivalStats]);

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

  const syntheticFishFrames = useMemo(() => buildFishFrames(profile.key), [profile.key]);

  const inferenceFishFrames = useMemo(
    () => buildInferenceFrames(profile.key, effectiveInferenceRows),
    [profile.key, effectiveInferenceRows]
  );

  const fishFrames = inferenceFishFrames.length > 0 ? inferenceFishFrames : syntheticFishFrames;

  const latestInference = effectiveInferenceRows[0] || null;
  const isHistogramFromInference = Boolean(latestInference?.histogram?.bins?.length);

  const estimatedFishLengthsMm = useMemo(
    () => buildEstimatedFishLengthsMm(profile.key, fishFrames),
    [profile.key, fishFrames]
  );

  const fallbackLengthHistogram = useMemo(
    () => buildLengthHistogram(estimatedFishLengthsMm, 20),
    [estimatedFishLengthsMm]
  );

  const activeHistogram = useMemo(() => {
    if (isHistogramFromInference) {
      return {
        labels: latestInference.histogram.labels,
        counts: latestInference.histogram.bins
      };
    }

    return {
      labels: fallbackLengthHistogram.labels,
      counts: fallbackLengthHistogram.counts
    };
  }, [isHistogramFromInference, latestInference, fallbackLengthHistogram]);

  const histogramXAxisName = isHistogramFromInference ? "Masa (g)" : "Talla (mm)";
  const histogramTooltipSuffix = isHistogramFromInference ? "g" : "mm";

  const histogramLabelInterval = useMemo(() => {
    const labelCount = activeHistogram.labels.length;

    if (labelCount <= 12) {
      return 0;
    }

    return Math.ceil(labelCount / 12) - 1;
  }, [activeHistogram.labels.length]);

  const histogramBinGeometry = useMemo(() => {
    const parsedRanges = activeHistogram.labels.map((label) => parseHistogramLabelRange(label));
    const centers = parsedRanges.map((range, index) =>
      range ? (range.start + range.end) / 2 : index + 0.5
    );
    const explicitWidths = parsedRanges.map((range) => (range ? range.end - range.start : null));

    const widthCandidates = explicitWidths.filter(
      (value) => Number.isFinite(value) && value > 0
    );

    const centerDiffCandidates = centers
      .slice(1)
      .map((center, index) => Math.abs(center - centers[index]))
      .filter((value) => Number.isFinite(value) && value > 0);

    const fallbackWidth = widthCandidates.length
      ? widthCandidates.reduce((sum, value) => sum + value, 0) / widthCandidates.length
      : centerDiffCandidates.length
        ? centerDiffCandidates.reduce((sum, value) => sum + value, 0) / centerDiffCandidates.length
        : 1;

    const widths = explicitWidths.map((value) =>
      Number.isFinite(value) && value > 0 ? value : fallbackWidth
    );

    return {
      centers,
      widths
    };
  }, [activeHistogram.labels]);

  const gaussianReferenceData = useMemo(() => {
    if (!showGaussianCurve) {
      return [];
    }

    const histogramCounts = activeHistogram.counts.map((value) => Math.max(0, Number(value) || 0));
    const totalSamples = histogramCounts.reduce((sum, value) => sum + value, 0);

    if (totalSamples <= 0 || histogramBinGeometry.centers.length === 0) {
      return [];
    }

    let meanMass = latestInference?.meanMassG ?? inferenceQuery.data?.summary?.meanMassG ?? null;
    let stdDeviation =
      latestInference?.stdDeviationG ?? inferenceQuery.data?.summary?.stdDeviationG ?? null;

    if (!Number.isFinite(meanMass) || !Number.isFinite(stdDeviation) || stdDeviation <= 0) {
      const weightedMean =
        histogramBinGeometry.centers.reduce(
          (sum, center, index) => sum + center * histogramCounts[index],
          0
        ) / totalSamples;

      const weightedVariance =
        histogramBinGeometry.centers.reduce(
          (sum, center, index) =>
            sum + (center - weightedMean) * (center - weightedMean) * histogramCounts[index],
          0
        ) / totalSamples;

      meanMass = weightedMean;
      stdDeviation = Math.sqrt(Math.max(weightedVariance, 0.0001));
    }

    const sigma = Math.max(0.0001, Number(stdDeviation));
    const gaussianAsCounts = histogramBinGeometry.centers.map((center, index) => {
      const zScore = (center - meanMass) / sigma;
      const density = Math.exp(-0.5 * zScore * zScore) / (sigma * Math.sqrt(2 * Math.PI));
      return density * histogramBinGeometry.widths[index] * totalSamples;
    });

    const rawSum = gaussianAsCounts.reduce((sum, value) => sum + value, 0);
    const normalizationFactor = rawSum > 0 ? totalSamples / rawSum : 1;

    return gaussianAsCounts.map((value) => Number((value * normalizationFactor).toFixed(2)));
  }, [
    showGaussianCurve,
    activeHistogram.counts,
    histogramBinGeometry.centers,
    histogramBinGeometry.widths,
    latestInference,
    inferenceQuery.data
  ]);

  const gaussianCoefficients = useMemo(() => {
    if (!showGaussianCurve) {
      return null;
    }

    const histogramCounts = activeHistogram.counts.map((value) => Math.max(0, Number(value) || 0));
    const totalSamples = histogramCounts.reduce((sum, value) => sum + value, 0);

    if (totalSamples <= 0 || histogramBinGeometry.centers.length === 0) {
      return null;
    }

    let meanMass = latestInference?.meanMassG ?? inferenceQuery.data?.summary?.meanMassG ?? null;
    let stdDeviation =
      latestInference?.stdDeviationG ?? inferenceQuery.data?.summary?.stdDeviationG ?? null;

    if (!Number.isFinite(meanMass) || !Number.isFinite(stdDeviation) || stdDeviation <= 0) {
      const weightedMean =
        histogramBinGeometry.centers.reduce(
          (sum, center, index) => sum + center * histogramCounts[index],
          0
        ) / totalSamples;

      const weightedVariance =
        histogramBinGeometry.centers.reduce(
          (sum, center, index) =>
            sum + (center - weightedMean) * (center - weightedMean) * histogramCounts[index],
          0
        ) / totalSamples;

      meanMass = weightedMean;
      stdDeviation = Math.sqrt(Math.max(weightedVariance, 0.0001));
    }

    const sigma = Math.max(0.0001, Number(stdDeviation));
    const gaussianAsCounts = histogramBinGeometry.centers.map((center, index) => {
      const zScore = (center - meanMass) / sigma;
      const density = Math.exp(-0.5 * zScore * zScore) / (sigma * Math.sqrt(2 * Math.PI));
      return density * histogramBinGeometry.widths[index] * totalSamples;
    });

    const rawSum = gaussianAsCounts.reduce((sum, value) => sum + value, 0);
    const normalizationFactor = rawSum > 0 ? totalSamples / rawSum : 1;

    const averageBinWidth =
      histogramBinGeometry.widths.reduce((sum, value) => sum + value, 0) /
      Math.max(histogramBinGeometry.widths.length, 1);

    const amplitude =
      normalizationFactor *
      ((totalSamples * averageBinWidth) / (sigma * Math.sqrt(2 * Math.PI)));

    return {
      amplitude,
      meanMass: Number(meanMass),
      sigma
    };
  }, [
    showGaussianCurve,
    activeHistogram.counts,
    histogramBinGeometry.centers,
    histogramBinGeometry.widths,
    latestInference,
    inferenceQuery.data
  ]);

  const hasGaussianEquation = Boolean(showGaussianCurve && gaussianCoefficients);

  const gaussianAmplitudeText = gaussianCoefficients
    ? formatGaussianValue(gaussianCoefficients.amplitude, gaussianDecimals)
    : "";

  const gaussianMeanMassText = gaussianCoefficients
    ? formatGaussianValue(gaussianCoefficients.meanMass, gaussianDecimals)
    : "";

  const gaussianSigmaText = gaussianCoefficients
    ? formatGaussianValue(gaussianCoefficients.sigma, gaussianDecimals)
    : "";

  const gaussianEquationLatex = gaussianCoefficients
    ? `\\hat{y}(x)=${gaussianAmplitudeText}\\,e^{\\displaystyle\\left(-\\dfrac{(x-${gaussianMeanMassText})^2}{2(${gaussianSigmaText})^2}\\right)}`
    : "";

  const histogramYAxisMax = useMemo(() => {
    const barMax = Math.max(0, ...activeHistogram.counts.map((value) => Number(value) || 0));
    const gaussianMax = showGaussianCurve
      ? Math.max(0, ...gaussianReferenceData.map((value) => Number(value) || 0))
      : 0;
    const maxValue = Math.max(barMax, gaussianMax);

    if (maxValue <= 0) {
      return 1;
    }

    return Math.ceil(maxValue * 1.12);
  }, [activeHistogram.counts, showGaussianCurve, gaussianReferenceData]);

  const fishLengthHistogramOption = useMemo(
    () => ({
      animation: false,
      grid: {
        top: hasGaussianEquation ? 126 : showGaussianCurve ? 58 : 36,
        right: 20,
        bottom: 40,
        left: 56
      },
      legend: showGaussianCurve
        ? {
            top: 10,
            right: 10,
            textStyle: {
              color: "#324f72"
            }
          }
        : undefined,
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow"
        },
        backgroundColor: "rgba(255,255,255,0.98)",
        borderColor: "#b7c7da",
        borderWidth: 1,
        textStyle: {
          color: "#1f3653"
        },
        formatter: (params) => {
          const rows = Array.isArray(params) ? params : [params];
          const row = rows[0];

          if (!row) {
            return "";
          }

          const lines = rows.map((item) => {
            const numericValue = Number(item.value);
            const formattedValue = Number.isFinite(numericValue)
              ? item.seriesType === "line"
                ? numericValue.toFixed(1)
                : Math.round(numericValue)
              : item.value;

            return `${item.marker}${item.seriesName}: ${formattedValue} peces`;
          });

          return `${row.axisValue} ${histogramTooltipSuffix}<br/>${lines.join("<br/>")}`;
        }
      },
      xAxis: {
        type: "category",
        name: histogramXAxisName,
        nameLocation: "middle",
        nameGap: 30,
        data: activeHistogram.labels,
        axisLabel: {
          interval: histogramLabelInterval,
          color: "#324f72",
          fontSize: 11
        },
        axisLine: {
          lineStyle: {
            color: "#96aec9"
          }
        }
      },
      yAxis: {
        type: "value",
        name: "Peces",
        minInterval: 1,
        max: histogramYAxisMax,
        nameTextStyle: {
          color: "#324f72"
        },
        axisLabel: {
          color: "#324f72"
        },
        splitLine: {
          lineStyle: {
            color: "rgba(132, 161, 194, 0.24)"
          }
        }
      },
      series: [
        {
          name: "Peces",
          type: "bar",
          barMaxWidth: 26,
          data: activeHistogram.counts,
          itemStyle: {
            color: "#2f88dd",
            borderRadius: [4, 4, 0, 0]
          }
        },
        ...(showGaussianCurve
          ? [
              {
                name: "Curva gaussiana",
                type: "line",
                smooth: true,
                symbol: "none",
                data: gaussianReferenceData,
                lineStyle: {
                  color: "#d95f02",
                  width: 2,
                  type: "dashed"
                },
                itemStyle: {
                  color: "#d95f02"
                },
                z: 3
              }
            ]
          : [])
      ]
    }),
    [
      activeHistogram.counts,
      activeHistogram.labels,
      gaussianReferenceData,
      histogramYAxisMax,
      histogramLabelInterval,
      histogramTooltipSuffix,
      histogramXAxisName,
      showGaussianCurve
    ]
  );

  const calendarYear = useMemo(() => {
    const target = inferenceWindow?.toDate ? new Date(inferenceWindow.toDate) : new Date();

    if (!Number.isFinite(target.getTime())) {
      return new Date().getFullYear();
    }

    return target.getFullYear();
  }, [inferenceWindow?.toDate]);

  const calendarFishCountByDay = useMemo(() => {
    const rows = effectiveInferenceRows || [];
    const byDay = new Map();

    rows.forEach((row) => {
      const key = toCalendarDateKey(row.eventAt);

      if (!key) {
        return;
      }

      if (!key.startsWith(`${calendarYear}-`)) {
        return;
      }

      const nextValue = (byDay.get(key) || 0) + Math.max(0, Number(row.totalCount) || 0);
      byDay.set(key, Math.round(nextValue));
    });

    return byDay;
  }, [effectiveInferenceRows, calendarYear]);

  const calendarHeatmapData = useMemo(() => {
    const start = new Date(calendarYear, 0, 1);
    const end = new Date(calendarYear, 11, 31);
    const values = [];

    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const key = toCalendarDateKey(cursor);

      if (!key) {
        continue;
      }

      values.push([key, calendarFishCountByDay.get(key) || 0]);
    }

    return values;
  }, [calendarYear, calendarFishCountByDay]);

  const calendarHeatmapMax = useMemo(() => {
    const maxValue = Math.max(0, ...calendarHeatmapData.map((item) => Number(item?.[1]) || 0));
    return Math.max(1, Math.round(maxValue));
  }, [calendarHeatmapData]);

  const fishCountCalendarOption = useMemo(
    () => ({
      animation: false,
      tooltip: {
        position: "top",
        backgroundColor: "rgba(255,255,255,0.98)",
        borderColor: "#b7c7da",
        borderWidth: 1,
        textStyle: {
          color: "#1f3653"
        },
        formatter: (params) => {
          const dateLabel = params?.data?.[0] || "--";
          const fishCount = Math.round(Number(params?.data?.[1]) || 0);
          return `${dateLabel}<br/>${fishCount} peces`;
        }
      },
      visualMap: {
        min: 0,
        max: calendarHeatmapMax,
        orient: "horizontal",
        left: "center",
        bottom: 6,
        itemWidth: 14,
        itemHeight: 420,
        textGap: 12,
        calculable: true,
        text: [`${calendarHeatmapMax} peces`, "0 peces"],
        textStyle: {
          color: "#324f72"
        },
        inRange: {
          color: ["#eef5ff", "#c9def9", "#8fbceb", "#4d95dd", "#2169b1"]
        }
      },
      calendar: {
        top: 54,
        left: 52,
        right: 24,
        bottom: 60,
        range: String(calendarYear),
        cellSize: ["auto", 17],
        splitLine: {
          show: true,
          lineStyle: {
            color: "#d5e2f0",
            width: 1
          }
        },
        itemStyle: {
          borderWidth: 1,
          borderColor: "#d5e2f0",
          color: "#f6f9fc"
        },
        yearLabel: {
          show: false
        },
        dayLabel: {
          firstDay: 1,
          nameMap: ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"],
          color: "#5f7594"
        },
        monthLabel: {
          nameMap: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
          color: "#2e4563",
          margin: 10
        }
      },
      series: [
        {
          name: "Peces contados",
          type: "heatmap",
          coordinateSystem: "calendar",
          data: calendarHeatmapData
        }
      ]
    }),
    [calendarHeatmapData, calendarHeatmapMax, calendarYear]
  );

  const trendRows = useMemo(
    () =>
      effectiveInferenceRows
        .slice()
        .sort((left, right) => toTimestamp(left.eventAt) - toTimestamp(right.eventAt)),
    [effectiveInferenceRows]
  );

  const trendLabelInterval = useMemo(() => {
    if (trendRows.length <= 10) {
      return 0;
    }

    return Math.ceil(trendRows.length / 10) - 1;
  }, [trendRows.length]);

  const trendXAxisLabels = useMemo(
    () =>
      trendRows.map((row) =>
        new Date(row.eventAt).toLocaleString("es-ES", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        })
      ),
    [trendRows]
  );

  const trendCountData = useMemo(
    () => trendRows.map((row) => Math.max(0, Number(row.totalCount) || 0)),
    [trendRows]
  );

  const trendMassData = useMemo(
    () => trendRows.map((row) => Math.max(0, Number(row.totalMassKg) || 0)),
    [trendRows]
  );

  const trendCountAxisRange = useMemo(() => {
    const minData = Math.min(...trendCountData);
    const maxData = Math.max(...trendCountData);

    if (!Number.isFinite(minData) || !Number.isFinite(maxData)) {
      return { min: 0, max: 10 };
    }

    if (minData === maxData) {
      const padding = Math.max(4, Math.ceil(maxData * 0.12));
      return {
        min: Math.max(0, minData - padding),
        max: maxData + padding
      };
    }

    const spread = maxData - minData;
    const padding = Math.max(4, Math.ceil(spread * 0.22));

    return {
      min: Math.max(0, minData - padding),
      max: maxData + padding
    };
  }, [trendCountData]);

  const trendMassAxisRange = useMemo(() => {
    const minData = Math.min(...trendMassData);
    const maxData = Math.max(...trendMassData);

    if (!Number.isFinite(minData) || !Number.isFinite(maxData)) {
      return { min: 0, max: 1 };
    }

    if (minData === maxData) {
      const padding = Number(Math.max(0.2, maxData * 0.12).toFixed(3));
      return {
        min: Math.max(0, Number((minData - padding).toFixed(3))),
        max: Number((maxData + padding).toFixed(3))
      };
    }

    const spread = maxData - minData;
    const padding = Number(Math.max(0.2, spread * 0.22).toFixed(3));

    return {
      min: Math.max(0, Number((minData - padding).toFixed(3))),
      max: Number((maxData + padding).toFixed(3))
    };
  }, [trendMassData]);

  const inferenceTrendOption = useMemo(
    () => ({
      animation: false,
      grid: {
        top: 48,
        right: 44,
        bottom: 50,
        left: 56
      },
      legend: {
        top: 10,
        textStyle: {
          color: "#2e4563"
        }
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line"
        },
        backgroundColor: "rgba(255,255,255,0.98)",
        borderColor: "#b7c7da",
        borderWidth: 1,
        textStyle: {
          color: "#1f3653"
        }
      },
      xAxis: {
        type: "category",
        data: trendXAxisLabels,
        axisLabel: {
          interval: trendLabelInterval,
          color: "#324f72",
          fontSize: 11
        },
        axisLine: {
          lineStyle: {
            color: "#96aec9"
          }
        }
      },
      yAxis: [
        {
          type: "value",
          name: "Peces",
          minInterval: 1,
          min: trendCountAxisRange.min,
          max: trendCountAxisRange.max,
          nameTextStyle: {
            color: "#324f72"
          },
          axisLabel: {
            color: "#324f72"
          },
          splitLine: {
            lineStyle: {
              color: "rgba(132, 161, 194, 0.24)"
            }
          }
        },
        {
          type: "value",
          name: "Biomasa (kg)",
          min: trendMassAxisRange.min,
          max: trendMassAxisRange.max,
          nameTextStyle: {
            color: "#324f72"
          },
          axisLabel: {
            color: "#324f72"
          },
          splitLine: {
            show: false
          }
        }
      ],
      series: [
        {
          name: "Conteo",
          type: "line",
          smooth: true,
          symbolSize: 6,
          lineStyle: {
            color: "#2575c5",
            width: 2
          },
          itemStyle: {
            color: "#2575c5"
          },
          data: trendCountData
        },
        {
          name: "Biomasa",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 6,
          lineStyle: {
            color: "#1e9f74",
            width: 2
          },
          itemStyle: {
            color: "#1e9f74"
          },
          data: trendMassData
        }
      ]
    }),
    [
      trendCountAxisRange.max,
      trendCountAxisRange.min,
      trendCountData,
      trendLabelInterval,
      trendMassAxisRange.max,
      trendMassAxisRange.min,
      trendMassData,
      trendXAxisLabels
    ]
  );

  const inferenceTotalCount = useMemo(
    () => effectiveInferenceRows.reduce((sum, row) => sum + (Number(row.totalCount) || 0), 0),
    [effectiveInferenceRows]
  );

  const inferenceTotalMassKg = useMemo(
    () =>
      Number(
        effectiveInferenceRows
          .reduce((sum, row) => sum + (Number(row.totalMassKg) || 0), 0)
          .toFixed(3)
      ),
    [effectiveInferenceRows]
  );

  const latestMeanMassG =
    latestInference?.meanMassG ?? inferenceQuery.data?.summary?.meanMassG ?? null;

  const latestStdDeviationG =
    latestInference?.stdDeviationG ?? inferenceQuery.data?.summary?.stdDeviationG ?? null;

  const latestInferenceAt = latestInference?.eventAt || null;
  const demoDataNotice = forceDemoData
    ? "Modo demo activado. Mostrando valores fijos de la captura."
    : apiInferenceRows.length === 0
      ? "Sin datos reales para este rango. Mostrando datos de ejemplo."
      : null;

  const galleryColumnCount = viewportWidth <= 680 ? 1 : viewportWidth <= 1180 ? 3 : 4;
  const galleryLimit = galleryColumnCount * 3;
  const galleryFrames = useMemo(() => fishFrames.slice(-galleryLimit), [fishFrames, galleryLimit]);

  const totalFishCount = useMemo(
    () => fishFrames.reduce((sum, frame) => sum + frame.fishCount, 0),
    [fishFrames]
  );

  const totalBiomassKg = useMemo(
    () => Number(fishFrames.reduce((sum, frame) => sum + frame.biomassKg, 0).toFixed(2)),
    [fishFrames]
  );

  useEffect(() => {
    setSelectedMachineId(machineInstances[0]?.machineId || "");
    setSelectedFrameId(null);
    setShowFrames(true);
    setShowGui(false);
    setShowGuiStats(false);
    setIsInferenceRunning(true);
    setManualPartialCounter(null);
    setManualTotalCounter(null);
  }, [profile.key, machineInstances]);

  useEffect(() => {
    setManualPartialCounter(null);
    setManualTotalCounter(null);
    setShowGuiStats(false);
  }, [selectedMachineId]);

  useEffect(() => {
    if (selectedMachineId) {
      return;
    }

    if (machineInstanceOptions[0]?.machineId) {
      setSelectedMachineId(machineInstanceOptions[0].machineId);
    }
  }, [selectedMachineId, machineInstanceOptions]);

  useEffect(() => {
    if (survivalPoolOptions.length === 0) {
      if (selectedSurvivalPool !== "") {
        setSelectedSurvivalPool("");
      }

      return;
    }

    if (!survivalPoolOptions.includes(selectedSurvivalPool)) {
      setSelectedSurvivalPool(survivalPoolOptions[0]);
    }
  }, [selectedSurvivalPool, survivalPoolOptions]);

  useEffect(() => {
    if (!showGui) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setGuiNow(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [showGui]);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      const fullscreenCurrentGui = document.fullscreenElement === guiScreenRef.current;
      setIsGuiFullscreen(fullscreenCurrentGui);

      if (!fullscreenCurrentGui && showGui) {
        setShowGui(false);
        setShowGuiStats(false);
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [showGui]);

  const selectedFrame =
    fishFrames.find((frame) => frame.id === selectedFrameId) || fishFrames[fishFrames.length - 1] || null;

  const framePartialFishCount = selectedFrame?.fishCount ?? 0;
  const partialFishCount = manualPartialCounter ?? framePartialFishCount;
  const effectiveTotalFishCount = manualTotalCounter ?? totalFishCount;
  const partialBiomassKg = selectedFrame?.biomassKg ?? 0;
  const partialAvgWeightG =
    partialFishCount > 0 ? Number(((partialBiomassKg * 1000) / partialFishCount).toFixed(1)) : 0;
  const totalAvgWeightG =
    effectiveTotalFishCount > 0
      ? Number(((totalBiomassKg * 1000) / effectiveTotalFishCount).toFixed(1))
      : 0;

  const runRateFishPerMinute = useMemo(() => {
    if (fishFrames.length < 2) {
      return 0;
    }

    const first = fishFrames[0].capturedAt.getTime();
    const last = fishFrames[fishFrames.length - 1].capturedAt.getTime();
    const minutes = Math.max((last - first) / 60000, 1);
    return Number((effectiveTotalFishCount / minutes).toFixed(1));
  }, [fishFrames, effectiveTotalFishCount]);

  const sessionStartTime = activeSession?.created_at || fishFrames[0]?.capturedAt;
  const sessionEndTime = activeSession?.expires_at || fishFrames[fishFrames.length - 1]?.capturedAt;

  const sessionStatus = activeSession
    ? new Date(activeSession.expires_at).getTime() > Date.now()
      ? "Sesion activa"
      : "Sesion vencida"
    : "Sin sesion";

  async function requestGuiFullscreen() {
    if (!guiScreenRef.current) {
      return false;
    }

    try {
      if (document.fullscreenElement === guiScreenRef.current) {
        return true;
      }

      await guiScreenRef.current.requestFullscreen();
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function handleOpenGuiFullscreen() {
    if (!showGui) {
      flushSync(() => {
        setShowGui(true);
      });
    }

    const opened = await requestGuiFullscreen();

    if (!opened) {
      setShowGui(false);
      setShowGuiStats(false);
    }
  }

  async function handleToggleGuiFullscreen() {
    if (!guiScreenRef.current) {
      return;
    }

    try {
      if (document.fullscreenElement === guiScreenRef.current) {
        await document.exitFullscreen();
        return;
      }

      await guiScreenRef.current.requestFullscreen();
    } catch (_error) {
      // Ignore fullscreen errors and keep the panel interactive.
    }
  }

  return (
    <section className="machine-argos-page">
      <article className="panel machine-argos-header-panel">
        <h3>Maquina ArgosAI</h3>
        <p className="machine-argos-intro">{profile.description}</p>

        <div className="machine-argos-summary-grid">
          <div className="machine-argos-stat">
            <span>Modelo</span>
            <strong>{profile.name}</strong>
          </div>
          <div className="machine-argos-stat">
            <span>Rendimiento</span>
            <strong>{profile.throughput}</strong>
          </div>
          <div className="machine-argos-stat">
            <span>Camara</span>
            <strong>{profile.cameraSpec}</strong>
          </div>
          <div className="machine-argos-stat">
            <span>Estado</span>
            <strong>{sessionStatus}</strong>
          </div>
        </div>
      </article>

      <article className="panel machine-argos-camera-panel">
        <header className="machine-argos-camera-header">
          <div>
            <h3>Camara y conteo de peces</h3>
            <p>
              Gestion de sesion por equipo. La vista de camara se muestra en Interfaz GUI.
            </p>

            {machineInstanceOptions.length > 1 ? (
              <div className="machine-argos-instance-selector">
                {machineInstanceOptions.map((instance) => (
                  <button
                    key={instance.machineId}
                    type="button"
                    className={`machine-argos-instance-chip ${
                      activeInstance?.machineId === instance.machineId
                        ? "machine-argos-instance-chip-active"
                        : ""
                    }`.trim()}
                    onClick={() => setSelectedMachineId(instance.machineId)}
                  >
                    {instance.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="machine-argos-camera-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowFrames((current) => !current)}
            >
              {showFrames ? "Ocultar galeria" : "Ver imagenes de peces pasar"}
            </button>
            <button
              type="button"
              className={`secondary-button ${showGui ? "secondary-button-active" : ""}`.trim()}
              onClick={handleOpenGuiFullscreen}
            >
              Interfaz GUI
            </button>
          </div>
        </header>

        {activeSession ? (
          <div className="machine-argos-session-meta">
            <p>
              <strong>Unidad:</strong> {activeInstance?.label || "--"}
            </p>
            <p>
              <strong>Equipo:</strong> {activeSession.machine_type}
            </p>
            <p>
              <strong>ID camara:</strong> {activeSession.machine_id}
            </p>
            <p>
              <strong>Protocolo:</strong> {activeSession.stream_protocol}
            </p>
            <p>
              <strong>Expira:</strong> {new Date(activeSession.expires_at).toLocaleString()}
            </p>
          </div>
        ) : (
          <p className="empty-text">
            No hay sesion activa para {activeInstance?.label || "este equipo"}.
          </p>
        )}
      </article>

      <article className="panel machine-argos-inference-panel">
        <header className="machine-argos-inference-header">
          <h3>Analitica de inferencias</h3>
          <p>
            Datos de tabla inference por maquina, incluyendo total_count, total_mass_kg, mean_mass_g,
            std_deviation y mass_hist.
          </p>

          <div className="machine-argos-inference-toolbar">
            <div className="machine-argos-range-chip-row">
              {inferenceRangePresets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={`machine-argos-range-chip ${
                    selectedRangePreset === preset.key ? "machine-argos-range-chip-active" : ""
                  }`.trim()}
                  onClick={() => setSelectedRangePreset(preset.key)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="machine-argos-inference-toggle-group">
              <label className="machine-argos-inference-toggle">
                <input
                  type="checkbox"
                  checked={forceDemoData}
                  onChange={(event) => setForceDemoData(event.target.checked)}
                />
                Forzar datos de ejemplo
              </label>

              <label className="machine-argos-inference-toggle">
                <input
                  type="checkbox"
                  checked={showGaussianCurve}
                  onChange={(event) => setShowGaussianCurve(event.target.checked)}
                />
                Mostrar curva gaussiana
              </label>

              <label className="machine-argos-inference-toggle machine-argos-inference-precision-control">
                Decimales
                <select
                  value={gaussianDecimals}
                  onChange={(event) => setGaussianDecimals(Number(event.target.value))}
                  disabled={!showGaussianCurve}
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </label>
            </div>
          </div>

          {selectedRangePreset === "custom" ? (
            <div className="machine-argos-inference-custom-range">
              <label className="machine-argos-inference-custom-field">
                <span>Desde</span>
                <input
                  type="datetime-local"
                  value={customRangeFrom}
                  onChange={(event) => setCustomRangeFrom(event.target.value)}
                />
              </label>
              <label className="machine-argos-inference-custom-field">
                <span>Hasta</span>
                <input
                  type="datetime-local"
                  value={customRangeTo}
                  onChange={(event) => setCustomRangeTo(event.target.value)}
                />
              </label>
            </div>
          ) : null}
        </header>

        {!isShowingDemoData && inferenceQuery.isLoading ? (
          <p className="empty-text">Cargando inferencias...</p>
        ) : null}

        {demoDataNotice ? (
          <p className="machine-argos-inference-note machine-argos-inference-note-info">{demoDataNotice}</p>
        ) : null}

        {!isShowingDemoData && !inferenceQuery.isLoading && effectiveInferenceRows.length === 0 ? (
          <p className="empty-text">
            No hay registros de inferencia para esta maquina en el periodo consultado.
          </p>
        ) : null}

        {effectiveInferenceRows.length > 0 ? (
          <>
            {isUsingFallbackMachine ? (
              <p className="machine-argos-inference-note">
                No hay datos para {selectedMachineId}. Se muestra la maquina con datos mas recientes:
                {" "}
                <strong>{fallbackMachineId}</strong>.
              </p>
            ) : null}

            <div className="machine-argos-inference-kpi-grid">
              <div className="machine-argos-inference-kpi">
                <span>Maquina activa</span>
                <strong>{fallbackMachineId || selectedMachineId || "--"}</strong>
              </div>
              <div className="machine-argos-inference-kpi">
                <span>Inferencias</span>
                <strong>{effectiveInferenceRows.length}</strong>
              </div>
              <div className="machine-argos-inference-kpi">
                <span>Peces detectados</span>
                <strong>{inferenceTotalCount}</strong>
              </div>
              <div className="machine-argos-inference-kpi">
                <span>Biomasa total</span>
                <strong>{inferenceTotalMassKg.toFixed(2)} kg</strong>
              </div>
              <div className="machine-argos-inference-kpi">
                <span>Peso medio</span>
                <strong>{latestMeanMassG === null ? "--" : `${latestMeanMassG.toFixed(2)} g`}</strong>
              </div>
              <div className="machine-argos-inference-kpi">
                <span>Desviacion estandar</span>
                <strong>
                  {latestStdDeviationG === null ? "--" : `${latestStdDeviationG.toFixed(2)} g`}
                </strong>
              </div>
              <div className="machine-argos-inference-kpi">
                <span>Ultima medicion</span>
                <strong>{latestInferenceAt ? new Date(latestInferenceAt).toLocaleString() : "--"}</strong>
              </div>
            </div>

            <div className="machine-argos-inference-chart-grid">
              <div className="machine-argos-inference-chart-card">
                <h4>Tendencia de conteo y biomasa</h4>
                <div className="machine-argos-inference-chart">
                  {trendRows.length > 1 ? (
                    <ReactECharts
                      option={inferenceTrendOption}
                      style={{ height: "100%", width: "100%" }}
                      notMerge
                      lazyUpdate
                    />
                  ) : (
                    <p className="empty-text">Se requieren al menos 2 inferencias para tendencia.</p>
                  )}
                </div>
              </div>

              <div className="machine-argos-inference-chart-card">
                <h4>
                  {isHistogramFromInference
                    ? "Histograma de masa (mass_hist)"
                    : "Histograma estimado de talla"}
                </h4>
                <div
                  className={`machine-argos-inference-chart ${
                    hasGaussianEquation ? "machine-argos-inference-chart-with-equation" : ""
                  }`.trim()}
                >
                  {hasGaussianEquation ? (
                    <div className="machine-argos-gaussian-equation-overlay" aria-hidden="true">
                      <BlockMath math={gaussianEquationLatex} />
                    </div>
                  ) : null}
                  <ReactECharts
                    option={fishLengthHistogramOption}
                    style={{ height: "100%", width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
              </div>

              <div className="machine-argos-inference-chart-card machine-argos-inference-chart-card-wide">
                <h4>Calendario anual de peces contados ({calendarYear})</h4>
                <div className="machine-argos-inference-chart machine-argos-inference-chart-calendar">
                  <ReactECharts
                    option={fishCountCalendarOption}
                    style={{ height: "100%", width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
              </div>
            </div>
          </>
        ) : null}
      </article>

      {showGui ? (
        <article className="panel machine-argos-gui-panel">
          <header className="machine-argos-gui-header">
            <h3>Interfaz GUI de maquina</h3>
            <p>Replica de la pantalla local con metricas de ejecucion, control de inferencia y estado.</p>
          </header>

          <section ref={guiScreenRef} className="machine-gui-screen">
            <header className="machine-gui-topbar">
              <div className="machine-gui-brand">
                <span className="machine-gui-brand-dot" aria-hidden="true" />
                <strong>ARGOS AI</strong>
              </div>

              <div className="machine-gui-pill-row">
                <span>{activeInstance?.startTank || "Tanque 1"}</span>
                <span>{activeInstance?.endTank || "Tanque A"}</span>
                <span>Espanol</span>
                <span>Videos</span>
              </div>

              <div className="machine-gui-clock-grid">
                <p>
                  <strong>Hora inicial:</strong> {formatClockTime(sessionStartTime)}
                </p>
                <p>
                  <strong>Hora final:</strong> {formatClockTime(sessionEndTime)}
                </p>
                <p>
                  <strong>Hora actual:</strong> {formatClockTime(guiNow)}
                </p>
              </div>
            </header>

            <div className="machine-gui-main">
              <div className="machine-gui-table-wrap">
                <table className="machine-gui-table">
                  <thead>
                    <tr>
                      <th>Metrica</th>
                      <th>Parcial</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Tipo de pez</th>
                      <td>{profile.species}</td>
                      <td>{profile.species}</td>
                    </tr>
                    <tr>
                      <th>Contador</th>
                      <td>{partialFishCount}</td>
                      <td>{effectiveTotalFishCount}</td>
                    </tr>
                    <tr>
                      <th>Biomasa</th>
                      <td>{partialBiomassKg.toFixed(2)} kg</td>
                      <td>{totalBiomassKg.toFixed(2)} kg</td>
                    </tr>
                    <tr>
                      <th>Peso medio</th>
                      <td>{partialAvgWeightG.toFixed(1)} g</td>
                      <td>{totalAvgWeightG.toFixed(1)} g</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <aside className="machine-gui-preview-panel">
                {showGuiStats ? (
                  <div className="machine-gui-histogram-preview">
                    <h4>
                      {isHistogramFromInference
                        ? "Histograma de masa por inferencia"
                        : "Histograma de tamano estimado de peces"}
                    </h4>
                    <div className="machine-gui-histogram-chart">
                      <ReactECharts
                        option={fishLengthHistogramOption}
                        style={{ height: "100%", width: "100%" }}
                        notMerge
                        lazyUpdate
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <img
                      src={activeSession?.fallback_url || selectedFrame?.imageUrl}
                      alt={`Vista de camara GUI ${profile.name}`}
                    />
                    <span
                      className={`machine-gui-preview-chip ${isInferenceRunning ? "machine-gui-preview-chip-ok" : "machine-gui-preview-chip-stop"}`.trim()}
                    >
                      {isInferenceRunning ? "Fish good" : "Inferencia parada"}
                    </span>
                  </>
                )}
              </aside>
            </div>

            <p className="machine-gui-rate-text">
              {isInferenceRunning ? `${runRateFishPerMinute.toFixed(1)} peces/min` : "Inferencia detenida"}
            </p>

            <div className="machine-gui-controls">
              <button
                type="button"
                className={`machine-gui-control machine-gui-control-run ${isInferenceRunning ? "machine-gui-control-run-active" : ""}`.trim()}
                onClick={() => setIsInferenceRunning(true)}
              >
                Ejecutando
              </button>
              <button
                type="button"
                className="machine-gui-control"
                onClick={handleToggleGuiFullscreen}
              >
                {isGuiFullscreen ? "Salir completa" : "Pantalla completa"}
              </button>
              <button
                type="button"
                className="machine-gui-control machine-gui-control-stop"
                onClick={() => setIsInferenceRunning((current) => !current)}
              >
                {isInferenceRunning ? "Parar inferencia" : "Reanudar inferencia"}
              </button>
              <button
                type="button"
                className={`machine-gui-control machine-gui-control-stats ${showGuiStats ? "machine-gui-control-stats-active" : ""}`.trim()}
                onClick={() => setShowGuiStats((current) => !current)}
              >
                Estadisticas
              </button>
              <button
                type="button"
                className="machine-gui-control machine-gui-control-reset"
                onClick={() => {
                  setManualPartialCounter(0);
                  setManualTotalCounter(0);
                }}
              >
                Reset total
              </button>
            </div>
          </section>
        </article>
      ) : null}

      {showFrames ? (
        <article className="panel machine-argos-gallery-panel">
          <h3>Imagenes de peces en paso</h3>
          <p>
            Secuencia visual para revisar deteccion de individuos durante el paso por camara y validar
            conteo/biomasa estimada.
          </p>

          <div className="machine-argos-gallery-grid">
            {galleryFrames.map((frame) => (
              <button
                key={frame.id}
                type="button"
                className={`machine-argos-thumb ${selectedFrame?.id === frame.id ? "machine-argos-thumb-active" : ""}`.trim()}
                onClick={() => setSelectedFrameId(frame.id)}
              >
                <img src={frame.imageUrl} alt={`Frame de peces ${frame.id}`} />
                <span>{frame.capturedAt.toLocaleTimeString()}</span>
                <small>{frame.fishCount} peces</small>
              </button>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
