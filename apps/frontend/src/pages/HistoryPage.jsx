import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { useLocation } from "react-router-dom";
import { historyReadingsRequest, sensorsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./HistoryPage.css";

const ranges = {
  "24h": { days: 1, bucket: "hour", label: "24 horas" },
  "7d": { days: 7, bucket: "hour", label: "7 días" },
  "30d": { days: 30, bucket: "day", label: "30 días" },
  "90d": { days: 90, bucket: "day", label: "90 días" },
  "1y": { days: 365, bucket: "day", label: "1 año" }
};

const sensorOrder = ["oxygen", "temperature", "ph", "salinity", "turbidity"];
const dayOfMonthLabels = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));
const hourOfDayLabels = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}:00`);
const MS_IN_DAY = 24 * 3600 * 1000;
const monthNamesEs = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];
const monthShortNamesEs = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const chartTheme = {
  text: "#2d4666",
  muted: "#5f7b9e",
  axis: "rgba(107, 133, 165, 0.52)",
  grid: "rgba(146, 169, 194, 0.34)",
  tooltipBg: "rgba(255, 255, 255, 0.96)",
  tooltipBorder: "#b8cde3"
};

function applyAxisTheme(axisConfig) {
  if (!axisConfig) {
    return axisConfig;
  }

  if (Array.isArray(axisConfig)) {
    return axisConfig.map((axis) => applyAxisTheme(axis));
  }

  const splitArea = axisConfig.splitArea?.show
    ? {
        ...axisConfig.splitArea,
        areaStyle: {
          color: ["rgba(247, 251, 255, 0.92)", "rgba(239, 246, 253, 0.92)"],
          ...(axisConfig.splitArea?.areaStyle || {})
        }
      }
    : axisConfig.splitArea;

  return {
    ...axisConfig,
    nameTextStyle: {
      color: chartTheme.text,
      ...(axisConfig.nameTextStyle || {})
    },
    axisLine: {
      show: true,
      ...(axisConfig.axisLine || {}),
      lineStyle: {
        color: chartTheme.axis,
        ...((axisConfig.axisLine && axisConfig.axisLine.lineStyle) || {})
      }
    },
    axisTick: {
      ...(axisConfig.axisTick || {}),
      lineStyle: {
        color: chartTheme.axis,
        ...((axisConfig.axisTick && axisConfig.axisTick.lineStyle) || {})
      }
    },
    axisLabel: {
      color: chartTheme.muted,
      ...(axisConfig.axisLabel || {})
    },
    splitLine: axisConfig.splitLine
      ? {
          ...axisConfig.splitLine,
          lineStyle: {
            color: chartTheme.grid,
            ...((axisConfig.splitLine && axisConfig.splitLine.lineStyle) || {})
          }
        }
      : undefined,
    splitArea
  };
}

function withDarkChartTheme(option) {
  const tooltip = option.tooltip || {};

  return {
    ...option,
    backgroundColor: "transparent",
    textStyle: {
      color: chartTheme.text,
      ...(option.textStyle || {})
    },
    tooltip: {
      ...tooltip,
      backgroundColor: chartTheme.tooltipBg,
      borderColor: chartTheme.tooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: "#1f3553",
        ...(tooltip.textStyle || {})
      }
    },
    legend: option.legend
      ? {
          ...option.legend,
          textStyle: {
            color: chartTheme.text,
            ...(option.legend.textStyle || {})
          }
        }
      : option.legend,
    visualMap: option.visualMap
      ? {
          ...option.visualMap,
          textStyle: {
            color: chartTheme.text,
            ...(option.visualMap.textStyle || {})
          }
        }
      : option.visualMap,
    xAxis: applyAxisTheme(option.xAxis),
    yAxis: applyAxisTheme(option.yAxis)
  };
}

const sensorMeta = {
  oxygen: {
    label: "Oxígeno",
    unit: "mg/L",
    color: "#38bfa2",
    idealMin: 6.5,
    idealMax: 9.5
  },
  temperature: {
    label: "Temperatura",
    unit: "C",
    color: "#ff8d5b",
    idealMin: 15,
    idealMax: 22
  },
  ph: {
    label: "pH",
    unit: "pH",
    color: "#b48df7",
    idealMin: 7.1,
    idealMax: 8.0
  },
  salinity: {
    label: "Salinidad",
    unit: "ppt",
    color: "#4b9fff",
    idealMin: 30,
    idealMax: 37
  },
  turbidity: {
    label: "Turbidez",
    unit: "NTU",
    color: "#f0c74e",
    idealMin: 0,
    idealMax: 15
  }
};

const demoProfileByType = {
  oxygen: {
    base: 7.8,
    amplitude: 0.9,
    spread: 0.45,
    minCap: 5.4,
    maxCap: 10.8,
    phase: 0.1
  },
  temperature: {
    base: 19.4,
    amplitude: 2.6,
    spread: 1.1,
    minCap: 13.5,
    maxCap: 28,
    phase: 1.1
  },
  ph: {
    base: 7.45,
    amplitude: 0.24,
    spread: 0.1,
    minCap: 6.8,
    maxCap: 8.5,
    phase: 2.2
  },
  salinity: {
    base: 33.5,
    amplitude: 2.1,
    spread: 0.7,
    minCap: 25,
    maxCap: 41,
    phase: 0.7
  },
  turbidity: {
    base: 9.2,
    amplitude: 4.8,
    spread: 1.6,
    minCap: 0,
    maxCap: 24,
    phase: 1.8
  }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wave(index, phase) {
  return Math.sin(index * 0.58 + phase) * 0.65 + Math.cos(index * 0.21 + phase * 1.7) * 0.35;
}

function buildDemoSeries(sensorType, rangeConfig) {
  const profile = demoProfileByType[sensorType] || demoProfileByType.temperature;

  let pointsCount;
  let stepMs;

  if (rangeConfig.bucket === "hour") {
    pointsCount = rangeConfig.days === 1 ? 24 : rangeConfig.days * 6;
    stepMs = rangeConfig.days === 1 ? 3600 * 1000 : 4 * 3600 * 1000;
  } else {
    pointsCount = Math.min(rangeConfig.days, 120);
    const dayStep = Math.max(1, Math.round(rangeConfig.days / pointsCount));
    stepMs = dayStep * 24 * 3600 * 1000;
  }

  const start = Date.now() - stepMs * (pointsCount - 1);

  return Array.from({ length: pointsCount }, (_, index) => {
    const avg = clamp(
      profile.base + wave(index, profile.phase) * profile.amplitude,
      profile.minCap,
      profile.maxCap
    );
    const spread = profile.spread * (1 + 0.2 * Math.sin(index * 0.8 + profile.phase));
    const min = clamp(avg - spread, profile.minCap, profile.maxCap);
    const max = clamp(avg + spread, profile.minCap, profile.maxCap);
    const samples = rangeConfig.bucket === "hour" ? 10 + ((index * 7) % 12) : 42 + ((index * 11) % 28);

    return {
      bucket_start: new Date(start + index * stepMs).toISOString(),
      avg_value: Number(avg.toFixed(3)),
      min_value: Number(min.toFixed(3)),
      max_value: Number(max.toFixed(3)),
      samples
    };
  });
}

function formatNumber(value, decimals = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return numeric.toFixed(decimals);
}

function metricStatus(current, idealMin, idealMax) {
  const numeric = Number(current);
  if (!Number.isFinite(numeric)) {
    return "Sin datos";
  }

  if (numeric < idealMin || numeric > idealMax) {
    return "Fuera de rango";
  }

  return "OK";
}

function formatBucketLabel(bucketStart, bucket) {
  const date = new Date(bucketStart);
  const datePart = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit"
  });

  if (bucket === "hour") {
    const timePart = date.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    return `${datePart}\n${timePart}`;
  }

  return datePart;
}

function normalizeBucketStart(bucketStart, bucket) {
  const date = new Date(bucketStart);

  if (bucket === "hour") {
    date.setMinutes(0, 0, 0);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date.toISOString();
}

function dateKeyFromIso(dateIso) {
  const date = new Date(dateIso);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function allMonthKeysForYear(year) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function daysInMonth(year, monthNumber) {
  return new Date(year, monthNumber, 0).getDate();
}

function daysInYear(year) {
  return new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;
}

function dayOfYearFromUtcDate(date) {
  const utcYear = date.getUTCFullYear();
  const utcStart = Date.UTC(utcYear, 0, 1);
  const utcDate = Date.UTC(utcYear, date.getUTCMonth(), date.getUTCDate());

  return Math.floor((utcDate - utcStart) / MS_IN_DAY) + 1;
}

function dateFromYearDayUtc(year, dayOfYear) {
  return new Date(Date.UTC(year, 0, dayOfYear));
}

function monthKeyFromIso(dateIso) {
  const date = new Date(dateIso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(monthKey) {
  const [, month] = monthKey.split("-").map(Number);

  return monthNamesEs[month - 1] || monthKey;
}

function buildDemoHeatmapValue(sensorType, year, monthNumber, dayNumber) {
  const profile = demoProfileByType[sensorType] || demoProfileByType.temperature;
  const dayDate = new Date(year, monthNumber - 1, dayNumber);
  const startOfYear = new Date(year, 0, 1);
  const dayIndex = Math.max(
    0,
    Math.floor((dayDate.getTime() - startOfYear.getTime()) / (24 * 3600 * 1000))
  );
  const seasonal = wave(dayIndex * 0.14, profile.phase) * profile.amplitude;
  const shortCycle = Math.sin(dayNumber * 0.49 + monthNumber * 0.35) * profile.spread * 0.8;
  const value = clamp(profile.base + seasonal + shortCycle, profile.minCap, profile.maxCap);

  return Number(value.toFixed(3));
}

function buildDemoHourlyHeatmapValue(sensorType, year, dayOfYear, hourOfDay) {
  const profile = demoProfileByType[sensorType] || demoProfileByType.temperature;
  const seasonal = wave(dayOfYear * 0.08 + year * 0.001, profile.phase) * profile.amplitude;
  const diurnal = Math.sin(((hourOfDay - 5) / 24) * Math.PI * 2) * profile.spread * 1.25;
  const microCycle = Math.cos((dayOfYear + hourOfDay) * 0.22 + profile.phase * 0.8) * profile.spread * 0.35;
  const value = clamp(profile.base + seasonal + diurnal + microCycle, profile.minCap, profile.maxCap);

  return Number(value.toFixed(3));
}

function normalizeByIdeal(rawValue, idealMin, idealMax) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const window = idealMax - idealMin;
  if (!Number.isFinite(window) || window <= 0) {
    return null;
  }

  return Number((((numeric - idealMin) / window) * 100).toFixed(2));
}

function buildAxisLabelConfig(axisLabels, bucket, maxLabelCount = bucket === "hour" ? 9 : 13) {
  const interval =
    axisLabels.length > maxLabelCount ? Math.ceil(axisLabels.length / maxLabelCount) - 1 : 0;

  return {
    rotate: 0,
    fontSize: 11,
    lineHeight: 13,
    margin: 6,
    hideOverlap: true,
    interval
  };
}

function compactAxisNumber(value, decimals = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }

  return String(Number(numeric.toFixed(decimals)));
}

function computeAxisRange(values, options = {}) {
  const { paddingRatio = 0.14, minPadding = 0.1 } = options;
  const numericValues = values.filter((value) => Number.isFinite(value));

  if (!numericValues.length) {
    return { min: 0, max: 1 };
  }

  let min = Math.min(...numericValues);
  let max = Math.max(...numericValues);
  const baseline = Math.max(Math.abs(min), Math.abs(max), 1);
  let span = max - min;

  if (span < baseline * 0.04) {
    span = Math.max(baseline * 0.12, minPadding * 2);
    min -= span / 2;
    max += span / 2;
  }

  const padding = Math.max(span * paddingRatio, baseline * 0.015, minPadding);

  return {
    min: Number((min - padding).toFixed(3)),
    max: Number((max + padding).toFixed(3))
  };
}

function pearsonCorrelation(points) {
  if (!points || points.length < 2) {
    return null;
  }

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (!Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(3));
}

function linearRegression(points) {
  if (!points || points.length < 2) {
    return null;
  }

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (!Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const correlation = pearsonCorrelation(points);

  return {
    slope: Number(slope.toFixed(5)),
    intercept: Number(intercept.toFixed(5)),
    r2: Number.isFinite(correlation) ? Number((correlation * correlation).toFixed(3)) : null
  };
}

function kMeansClusters(points, targetK = 3, maxIterations = 18) {
  if (!points || !points.length) {
    return [];
  }

  const k = Math.max(1, Math.min(targetK, points.length));
  if (k === 1) {
    const meanX = points.reduce((acc, point) => acc + point[0], 0) / points.length;
    const meanY = points.reduce((acc, point) => acc + point[1], 0) / points.length;

    return [
      {
        centroid: [Number(meanX.toFixed(3)), Number(meanY.toFixed(3))],
        points
      }
    ];
  }

  const xValues = points.map((point) => point[0]);
  const yValues = points.map((point) => point[1]);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const normalized = points.map((point) => ({
    raw: point,
    nx: (point[0] - minX) / spanX,
    ny: (point[1] - minY) / spanY
  }));

  const sorted = [...normalized].sort((a, b) => a.nx - b.nx);
  const centroids = Array.from({ length: k }, (_, index) => {
    const sortedIndex = Math.round((index * (sorted.length - 1)) / Math.max(1, k - 1));
    const selected = sorted[sortedIndex];

    return [selected.nx, selected.ny];
  });

  const assignments = new Array(normalized.length).fill(0);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false;

    normalized.forEach((item, pointIndex) => {
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      centroids.forEach((centroid, centroidIndex) => {
        const dx = item.nx - centroid[0];
        const dy = item.ny - centroid[1];
        const distance = dx * dx + dy * dy;

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = centroidIndex;
        }
      });

      if (assignments[pointIndex] !== closestIndex) {
        assignments[pointIndex] = closestIndex;
        changed = true;
      }
    });

    const accumulator = Array.from({ length: k }, () => ({ x: 0, y: 0, count: 0 }));

    normalized.forEach((item, pointIndex) => {
      const clusterIndex = assignments[pointIndex];
      accumulator[clusterIndex].x += item.nx;
      accumulator[clusterIndex].y += item.ny;
      accumulator[clusterIndex].count += 1;
    });

    centroids.forEach((centroid, centroidIndex) => {
      const bucket = accumulator[centroidIndex];
      if (bucket.count > 0) {
        centroid[0] = bucket.x / bucket.count;
        centroid[1] = bucket.y / bucket.count;
      }
    });

    if (!changed) {
      break;
    }
  }

  const clusters = Array.from({ length: k }, () => ({ points: [], sumX: 0, sumY: 0, count: 0 }));

  normalized.forEach((item, pointIndex) => {
    const clusterIndex = assignments[pointIndex];
    const target = clusters[clusterIndex];

    target.points.push(item.raw);
    target.sumX += item.raw[0];
    target.sumY += item.raw[1];
    target.count += 1;
  });

  return clusters
    .filter((cluster) => cluster.count > 0)
    .map((cluster) => ({
      centroid: [
        Number((cluster.sumX / cluster.count).toFixed(3)),
        Number((cluster.sumY / cluster.count).toFixed(3))
      ],
      points: cluster.points
    }));
}

function xyScatterOption(points, xMetricType, yMetricType, regression, clusters) {
  const xMeta = sensorMeta[xMetricType];
  const yMeta = sensorMeta[yMetricType];
  const clusterPalette = ["#3f80ff", "#26a96c", "#e0713e", "#8a6bd9", "#d34b81"];
  const xAxisRange = computeAxisRange(points.map((point) => point[0]), {
    paddingRatio: 0.1,
    minPadding: 0.08
  });
  const yAxisRange = computeAxisRange(points.map((point) => point[1]), {
    paddingRatio: 0.1,
    minPadding: 0.08
  });
  const effectiveClusters = clusters?.length ? clusters : [{ centroid: null, points }];
  const series = [];

  effectiveClusters.forEach((cluster, index) => {
    series.push({
      name:
        effectiveClusters.length > 1
          ? `Cluster ${index + 1}`
          : `${xMeta.label} vs ${yMeta.label}`,
      type: "scatter",
      symbolSize: 10,
      itemStyle: {
        color: clusterPalette[index % clusterPalette.length],
        borderColor: "#dce9ff3f",
        borderWidth: 1,
        opacity: 0.78
      },
      emphasis: {
        scale: 1.25
      },
      data: cluster.points
    });
  });

  if (effectiveClusters.length > 1) {
    series.push({
      name: "Centroides",
      type: "scatter",
      symbol: "diamond",
      symbolSize: 14,
      itemStyle: {
        color: "#cfe1fb",
        borderColor: "#0e1d2f",
        borderWidth: 1.2
      },
      data: effectiveClusters.map((cluster) => cluster.centroid)
    });
  }

  if (regression && Number.isFinite(regression.slope) && Number.isFinite(regression.intercept)) {
    const minX = Math.min(...points.map((point) => point[0]));
    const maxX = Math.max(...points.map((point) => point[0]));
    series.push({
      name: "Ajuste lineal",
      type: "line",
      showSymbol: false,
      lineStyle: {
        width: 2,
        type: "dashed",
        color: "#9fc4ff"
      },
      data: [
        [minX, regression.slope * minX + regression.intercept],
        [maxX, regression.slope * maxX + regression.intercept]
      ]
    });
  }

  const legendItems = series.map((item) => item.name);
  const gridTop = legendItems.length > 4 ? 64 : 46;

  return withDarkChartTheme({
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const rawData = params.data?.value || params.data;
        const [xValue, yValue, bucketLabel] = rawData;

        if (!Number.isFinite(Number(xValue)) || !Number.isFinite(Number(yValue))) {
          return `${params.seriesName}: ${bucketLabel || ""}`;
        }

        if (!bucketLabel) {
          return [
            `<strong>${params.seriesName}</strong>`,
            `${xMeta.label}: <strong>${formatNumber(xValue, 2)} ${xMeta.unit}</strong>`,
            `${yMeta.label}: <strong>${formatNumber(yValue, 2)} ${yMeta.unit}</strong>`
          ].join("<br/>");
        }

        return [
          `<strong>${bucketLabel}</strong>`,
          `${xMeta.label}: <strong>${formatNumber(xValue, 2)} ${xMeta.unit}</strong>`,
          `${yMeta.label}: <strong>${formatNumber(yValue, 2)} ${yMeta.unit}</strong>`
        ].join("<br/>");
      }
    },
    legend: {
      type: "scroll",
      top: 4,
      left: 8,
      right: 8,
      itemGap: 12,
      textStyle: {
        fontSize: 11
      },
      data: legendItems
    },
    grid: {
      top: gridTop,
      right: 22,
      bottom: 30,
      left: 22,
      containLabel: false
    },
    xAxis: {
      type: "value",
      name: `${xMeta.label} (${xMeta.unit})`,
      nameLocation: "middle",
      nameGap: 28,
      min: xAxisRange.min,
      max: xAxisRange.max,
      axisLabel: {
        formatter: (value) => compactAxisNumber(value, 2)
      }
    },
    yAxis: {
      type: "value",
      name: `${yMeta.label} (${yMeta.unit})`,
      nameLocation: "middle",
      nameGap: 34,
      min: yAxisRange.min,
      max: yAxisRange.max,
      axisLabel: {
        formatter: (value) => compactAxisNumber(value, 2)
      },
      splitLine: {
        lineStyle: {
          type: "dashed"
        }
      }
    },
    series
  });
}

function monthlyHeatmapOption(entries, monthLabels, metricType) {
  const meta = sensorMeta[metricType];
  const values = entries.map((entry) => Number(entry.value?.[2])).filter((value) => Number.isFinite(value));
  const minValue = values.length ? Math.min(...values) : 0;
  const rawMaxValue = values.length ? Math.max(...values) : 1;
  const maxValue = rawMaxValue === minValue ? rawMaxValue + 1 : rawMaxValue;

  return withDarkChartTheme({
    tooltip: {
      position: "top",
      formatter: (params) => {
        const value = Number(params.data?.value?.[2]);
        const dateLabel = params.data?.dateLabel || "-";
        const sourceLabel = params.data?.source === "real" ? "Real" : "Demo";

        return `${dateLabel}<br/>${meta.label}: <strong>${formatNumber(value, 2)} ${meta.unit}</strong><br/>Fuente: <strong>${sourceLabel}</strong>`;
      }
    },
    grid: {
      top: 54,
      right: 24,
      bottom: 66,
      left: 66,
      containLabel: true
    },
    xAxis: {
      type: "category",
      data: monthLabels,
      splitArea: {
        show: true
      },
      axisLabel: {
        fontSize: 11,
        interval: 0,
        rotate: monthLabels.length > 8 ? 26 : 0
      }
    },
    yAxis: {
      type: "category",
      data: dayOfMonthLabels,
      splitArea: {
        show: true
      },
      axisLabel: {
        fontSize: 11
      }
    },
    visualMap: {
      min: minValue,
      max: maxValue,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 12,
      itemWidth: 14,
      itemHeight: 320,
      precision: 2,
      formatter: (value) => formatNumber(value, 2),
      text: [`${formatNumber(maxValue, 2)} ${meta.unit}`, `${formatNumber(minValue, 2)} ${meta.unit}`],
      textGap: 8,
      inRange: {
        color: ["#0b2438", "#123a57", "#1f5575", "#2f7597", "#58a9cf"]
      }
    },
    series: [
      {
        name: meta.label,
        type: "heatmap",
        data: entries,
        label: {
          show: false
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 14,
            shadowColor: "rgba(10, 18, 28, 0.58)"
          }
        }
      }
    ]
  });
}

function yearlyHourlyHeatmapOption(entries, daysOfYear, metricType, year) {
  const meta = sensorMeta[metricType];
  const values = entries.map((entry) => Number(entry.value?.[2])).filter((value) => Number.isFinite(value));
  const minValue = values.length ? Math.min(...values) : 0;
  const rawMaxValue = values.length ? Math.max(...values) : 1;
  const maxValue = rawMaxValue === minValue ? rawMaxValue + 1 : rawMaxValue;
  const dayCategoryLabels = Array.from({ length: daysOfYear }, (_, index) => {
    const date = dateFromYearDayUtc(year, index + 1);
    const day = String(date.getUTCDate()).padStart(2, "0");
    const monthShort = monthShortNamesEs[date.getUTCMonth()];

    return `${day}/${monthShort}`;
  });
  const xAxisTickLabels = dayCategoryLabels.map((_, index) => {
    const date = dateFromYearDayUtc(year, index + 1);
    const dayOfMonth = date.getUTCDate();
    const monthShort = monthShortNamesEs[date.getUTCMonth()];

    if (dayOfMonth === 1) {
      return `${monthShort}\n01`;
    }

    if (dayOfMonth === 15) {
      return `15/${monthShort}`;
    }

    return "";
  });
  const monthStartIndexSet = new Set(
    Array.from({ length: 12 }, (_, monthIndex) => {
      const monthStart = new Date(Date.UTC(year, monthIndex, 1));
      return dayOfYearFromUtcDate(monthStart) - 1;
    }).filter((index) => index >= 0 && index < daysOfYear)
  );
  const monthSeparatorIndexes = Array.from(monthStartIndexSet)
    .filter((index) => index > 0)
    .sort((a, b) => a - b);

  return withDarkChartTheme({
    tooltip: {
      position: "top",
      formatter: (params) => {
        const value = Number(params.data?.value?.[2]);
        const dateLabel = params.data?.dateLabel || "-";
        const hourLabel = params.data?.hourLabel || "-";
        const sourceLabel = params.data?.source === "real" ? "Real" : "Demo";

        return `${dateLabel} ${hourLabel}<br/>${meta.label}: <strong>${formatNumber(value, 2)} ${meta.unit}</strong><br/>Fuente: <strong>${sourceLabel}</strong>`;
      }
    },
    grid: {
      top: 54,
      right: 24,
      bottom: 68,
      left: 76,
      containLabel: true
    },
    xAxis: {
      type: "category",
      data: dayCategoryLabels,
      name: "Fecha (día/mes)",
      nameLocation: "middle",
      nameGap: 50,
      splitArea: {
        show: true
      },
      axisTick: {
        interval: (index) => monthStartIndexSet.has(index)
      },
      axisLabel: {
        fontSize: 10,
        interval: 0,
        formatter: (_, index) => xAxisTickLabels[index] || ""
      }
    },
    yAxis: {
      type: "category",
      data: hourOfDayLabels,
      name: "Hora del día",
      nameLocation: "middle",
      nameGap: 58,
      splitArea: {
        show: true
      },
      axisLabel: {
        fontSize: 11
      }
    },
    visualMap: {
      min: minValue,
      max: maxValue,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 12,
      itemWidth: 14,
      itemHeight: 320,
      precision: 2,
      formatter: (value) => formatNumber(value, 2),
      text: [`${formatNumber(maxValue, 2)} ${meta.unit}`, `${formatNumber(minValue, 2)} ${meta.unit}`],
      textGap: 8,
      inRange: {
        color: ["#0b2438", "#123a57", "#1f5575", "#2f7597", "#58a9cf"]
      }
    },
    series: [
      {
        name: meta.label,
        type: "heatmap",
        data: entries,
        label: {
          show: false
        },
        markLine: monthSeparatorIndexes.length
          ? {
              silent: true,
              symbol: "none",
              lineStyle: {
                color: "#7e97b6",
                width: 0.8,
                type: "dashed",
                opacity: 0.55
              },
              label: {
                show: false
              },
              data: monthSeparatorIndexes.map((index) => ({ xAxis: index }))
            }
          : undefined,
        emphasis: {
          itemStyle: {
            shadowBlur: 14,
            shadowColor: "rgba(10, 18, 28, 0.58)"
          }
        }
      }
    ]
  });
}

function historyOption(card, bucket) {
  const axisLabels = card.points.map((item) => formatBucketLabel(item.bucket_start, bucket));
  const yValues = [card.idealMin, card.idealMax];

  for (const point of card.points) {
    yValues.push(Number(point.avg_value), Number(point.min_value), Number(point.max_value));
  }

  const yAxisRange = computeAxisRange(yValues, { paddingRatio: 0.12, minPadding: 0.08 });

  return withDarkChartTheme({
    tooltip: {
      trigger: "axis"
    },
    legend: {
      type: "scroll",
      top: 4,
      left: 8,
      right: 8,
      itemGap: 14,
      textStyle: {
        fontSize: 11
      },
      data: ["Prom", "Min", "Max"]
    },
    grid: {
      top: 46,
      right: 22,
      bottom: 30,
      left: 22,
      containLabel: false
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: axisLabels,
      axisLabel: buildAxisLabelConfig(axisLabels, bucket)
    },
    yAxis: {
      type: "value",
      scale: true,
      min: yAxisRange.min,
      max: yAxisRange.max,
      axisLabel: {
        formatter: (value) => compactAxisNumber(value, 1)
      }
    },
    series: [
      {
        name: "Prom",
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: {
          width: 2.4,
          color: card.color
        },
        areaStyle: {
          color: `${card.color}22`
        },
        data: card.points.map((item) => Number(item.avg_value)),
        markArea: {
          silent: true,
          itemStyle: {
            color: `${card.color}18`
          },
          data: [
            [
              {
                yAxis: card.idealMin
              },
              {
                yAxis: card.idealMax
              }
            ]
          ]
        }
      },
      {
        name: "Min",
        type: "line",
        symbol: "none",
        lineStyle: {
          type: "dashed",
          color: "#9bb6d8"
        },
        data: card.points.map((item) => Number(item.min_value))
      },
      {
        name: "Max",
        type: "line",
        symbol: "none",
        lineStyle: {
          type: "dashed",
          color: "#7fa5d6"
        },
        data: card.points.map((item) => Number(item.max_value))
      }
    ]
  });
}

function combinedHistoryOption(rows, bucket) {
  const axisLabels = rows.map((item) => formatBucketLabel(item.bucket_start, bucket));
  const normalizedValues = [];

  for (const row of rows) {
    for (const sensorType of sensorOrder) {
      const meta = sensorMeta[sensorType];
      normalizedValues.push(normalizeByIdeal(row[sensorType], meta.idealMin, meta.idealMax));
    }
  }

  const yAxisRange = computeAxisRange(normalizedValues, { paddingRatio: 0.16, minPadding: 3 });

  return withDarkChartTheme({
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => (value === null || value === undefined ? "-" : `${value}%`)
    },
    legend: {
      type: "scroll",
      top: 4,
      left: 8,
      right: 8,
      itemGap: 12,
      textStyle: {
        fontSize: 11
      },
      data: sensorOrder.map((sensorType) => sensorMeta[sensorType].label)
    },
    grid: {
      top: 50,
      right: 22,
      bottom: 34,
      left: 22,
      containLabel: false
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: axisLabels,
      axisLabel: buildAxisLabelConfig(axisLabels, bucket, bucket === "hour" ? 8 : 12)
    },
    yAxis: {
      type: "value",
      scale: true,
      min: yAxisRange.min,
      max: yAxisRange.max,
      name: "Indice (%)",
      axisLabel: {
        formatter: (value) => `${compactAxisNumber(value, 0)}%`
      },
      splitLine: {
        lineStyle: {
          type: "dashed"
        }
      }
    },
    series: sensorOrder.map((sensorType) => {
      const meta = sensorMeta[sensorType];

      return {
        name: meta.label,
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: {
          width: 2.4,
          color: meta.color
        },
        data: rows.map((row) => normalizeByIdeal(row[sensorType], meta.idealMin, meta.idealMax))
      };
    })
  });
}

export function HistoryPage() {
  const { accessToken } = useAuth();
  const location = useLocation();
  const historySection = location.pathname.endsWith("/parametros")
    ? "combined"
    : location.pathname.endsWith("/xy")
      ? "xy"
      : location.pathname.endsWith("/heatmap")
        ? "heatmap"
      : "pond";
  const [range, setRange] = useState("7d");
  const [selectedPondId, setSelectedPondId] = useState("");
  const [selectedXAxisType, setSelectedXAxisType] = useState("oxygen");
  const [selectedYAxisType, setSelectedYAxisType] = useState("temperature");
  const [selectedHeatmapType, setSelectedHeatmapType] = useState("oxygen");
  const [selectedHeatmapYear, setSelectedHeatmapYear] = useState(new Date().getFullYear());

  const sensorsQuery = useQuery({
    queryKey: ["sensors", "history"],
    queryFn: () => sensorsRequest(accessToken)
  });

  const pondOptions = useMemo(() => {
    const byPond = new Map();

    for (const sensor of sensorsQuery.data || []) {
      if (!byPond.has(sensor.pond_id)) {
        byPond.set(sensor.pond_id, {
          id: sensor.pond_id,
          name: sensor.pond_name
        });
      }
    }

    return Array.from(byPond.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sensorsQuery.data]);

  const displayPondOptions =
    pondOptions.length > 0 ? pondOptions : [{ id: "demo-pond", name: "Piscina demo A1" }];

  const activePondId = selectedPondId || String(displayPondOptions[0]?.id || "");
  const rangeConfig = ranges[range] || ranges["7d"];

  const heatmapYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, index) => currentYear - index);

    if (!years.includes(selectedHeatmapYear)) {
      years.push(selectedHeatmapYear);
    }

    return years.sort((a, b) => b - a);
  }, [selectedHeatmapYear]);

  const activeHistoryWindow = useMemo(() => {
    if (historySection === "heatmap") {
      const from = new Date(selectedHeatmapYear, 0, 1, 0, 0, 0, 0);
      const to = new Date(selectedHeatmapYear, 11, 31, 23, 59, 59, 999);

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        bucket: "day",
        token: `heatmap-${selectedHeatmapYear}`
      };
    }

    const to = new Date();
    const from = new Date(to.getTime() - rangeConfig.days * 24 * 3600 * 1000);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      bucket: rangeConfig.bucket,
      token: `range-${range}`
    };
  }, [historySection, selectedHeatmapYear, rangeConfig.days, rangeConfig.bucket, range]);

  const sensorsByType = useMemo(() => {
    if (!activePondId) {
      return new Map();
    }

    const result = new Map();

    for (const sensor of sensorsQuery.data || []) {
      if (String(sensor.pond_id) !== String(activePondId)) {
        continue;
      }

      if (!result.has(sensor.type)) {
        result.set(sensor.type, sensor);
      }
    }

    return result;
  }, [sensorsQuery.data, activePondId]);
  const heatmapSensor = sensorsByType.get(selectedHeatmapType) || null;

  const perTypeSpecs = useMemo(
    () =>
      sensorOrder.map((sensorType) => ({
        sensorType,
        sensor: sensorsByType.get(sensorType) || null
      })),
    [sensorsByType]
  );

  const historyQueries = useQueries({
    queries: perTypeSpecs.map((spec) => ({
      queryKey: [
        "history",
        spec.sensor?.id || `missing-${spec.sensorType}`,
        activePondId,
        activeHistoryWindow.token
      ],
      enabled: Boolean(spec.sensor?.id),
      queryFn: () =>
        historyReadingsRequest(accessToken, {
          sensorId: spec.sensor.id,
          from: activeHistoryWindow.from,
          to: activeHistoryWindow.to,
          bucket: activeHistoryWindow.bucket
        })
    }))
  });

  const heatmapHourlyQuery = useQuery({
    queryKey: [
      "history",
      "hourly-heatmap",
      heatmapSensor?.id || `missing-${selectedHeatmapType}`,
      activePondId,
      selectedHeatmapYear
    ],
    enabled: historySection === "heatmap" && Boolean(heatmapSensor?.id),
    queryFn: () =>
      historyReadingsRequest(accessToken, {
        sensorId: heatmapSensor.id,
        from: new Date(selectedHeatmapYear, 0, 1, 0, 0, 0, 0).toISOString(),
        to: new Date(selectedHeatmapYear, 11, 31, 23, 59, 59, 999).toISOString(),
        bucket: "hour"
      })
  });

  const demoSeriesConfig = useMemo(
    () => (historySection === "heatmap" ? { days: 365, bucket: "day" } : rangeConfig),
    [historySection, rangeConfig]
  );

  const demoSeriesByType = useMemo(() => {
    return new Map(
      sensorOrder.map((sensorType) => [sensorType, buildDemoSeries(sensorType, demoSeriesConfig)])
    );
  }, [demoSeriesConfig.days, demoSeriesConfig.bucket]);

  const chartCards = useMemo(
    () =>
      perTypeSpecs.map((spec, index) => {
        const queryData = historyQueries[index]?.data;
        const apiPoints = queryData?.series || [];
        const isDemo = apiPoints.length === 0;
        const points = isDemo ? demoSeriesByType.get(spec.sensorType) || [] : apiPoints;
        const latest = points[points.length - 1] || null;
        const previous = points[points.length - 2] || null;
        const latestAvg = latest ? Number(latest.avg_value) : null;
        const prevAvg = previous ? Number(previous.avg_value) : null;
        const delta = Number.isFinite(latestAvg) && Number.isFinite(prevAvg)
          ? Number((latestAvg - prevAvg).toFixed(3))
          : null;

        const samples = points.reduce((acc, item) => acc + Number(item.samples || 0), 0);
        const lastRange = latest
          ? Number((Number(latest.max_value) - Number(latest.min_value)).toFixed(3))
          : null;
        const meta = sensorMeta[spec.sensorType];

        return {
          sensorType: spec.sensorType,
          label: meta.label,
          unit: spec.sensor?.unit || meta.unit,
          color: meta.color,
          idealMin: meta.idealMin,
          idealMax: meta.idealMax,
          points,
          isDemo,
          samples,
          latestAvg,
          delta,
          lastRange,
          status: metricStatus(latestAvg, meta.idealMin, meta.idealMax)
        };
      }),
    [perTypeSpecs, historyQueries, demoSeriesByType]
  );

  const totalSamples = chartCards.reduce((acc, item) => acc + item.samples, 0);
  const realCoverage = chartCards.filter((item) => item.points.length > 0 && !item.isDemo).length;
  const demoCards = chartCards.filter((item) => item.isDemo).length;
  const outOfRange = chartCards.filter((item) => item.status === "Fuera de rango").length;
  const cardsWithRange = chartCards.filter((item) => Number.isFinite(item.lastRange));
  const averageRange =
    cardsWithRange.length > 0
      ? cardsWithRange.reduce((acc, item) => acc + item.lastRange, 0) / cardsWithRange.length
      : 0;

  const combinedRows = useMemo(() => {
    const byBucket = new Map();

    for (const card of chartCards) {
      for (const point of card.points) {
        const bucketKey = normalizeBucketStart(point.bucket_start, activeHistoryWindow.bucket);

        if (!byBucket.has(bucketKey)) {
          byBucket.set(bucketKey, {
            bucket_start: bucketKey
          });
        }

        byBucket.get(bucketKey)[card.sensorType] = Number(point.avg_value);
      }
    }

    return Array.from(byBucket.values()).sort(
      (a, b) => new Date(a.bucket_start).getTime() - new Date(b.bucket_start).getTime()
    );
  }, [chartCards, activeHistoryWindow.bucket]);

  const xCard = chartCards.find((item) => item.sensorType === selectedXAxisType);
  const yCard = chartCards.find((item) => item.sensorType === selectedYAxisType);

  const xyPoints = useMemo(() => {
    if (!xCard || !yCard) {
      return [];
    }

    const yPointsByBucket = new Map();
    for (const point of yCard.points) {
      const bucketKey = normalizeBucketStart(point.bucket_start, rangeConfig.bucket);
      yPointsByBucket.set(bucketKey, point);
    }

    const pairs = [];
    for (const point of xCard.points) {
      const bucketKey = normalizeBucketStart(point.bucket_start, rangeConfig.bucket);
      const yPoint = yPointsByBucket.get(bucketKey);

      if (!yPoint) {
        continue;
      }

      const xValue = Number(point.avg_value);
      const yValue = Number(yPoint.avg_value);

      if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
        continue;
      }

      pairs.push([xValue, yValue, formatBucketLabel(bucketKey, rangeConfig.bucket)]);
    }

    return pairs;
  }, [xCard, yCard, rangeConfig.bucket]);

  const xyCorrelation = useMemo(() => pearsonCorrelation(xyPoints), [xyPoints]);
  const xyRegression = useMemo(() => linearRegression(xyPoints), [xyPoints]);
  const xyClusters = useMemo(() => {
    const target = xyPoints.length >= 18 ? 3 : xyPoints.length >= 9 ? 2 : 1;
    return kMeansClusters(xyPoints, target);
  }, [xyPoints]);
  const xyUsesDemo = Boolean(xCard?.isDemo || yCard?.isDemo);
  const regressionEquation = xyRegression
    ? `${formatNumber(xyRegression.slope, 3)}x ${xyRegression.intercept >= 0 ? "+" : "-"} ${formatNumber(Math.abs(xyRegression.intercept), 3)}`
    : "-";

  const heatmapCard = chartCards.find((item) => item.sensorType === selectedHeatmapType) || null;
  const heatmapYear = selectedHeatmapYear;
  const heatmapDaysOfYear = useMemo(() => daysInYear(heatmapYear), [heatmapYear]);
  const heatmapDailyPoints = useMemo(() => {
    if (!heatmapCard) {
      return [];
    }

    const byDay = new Map();
    for (const point of heatmapCard.points) {
      const dayKey = normalizeBucketStart(point.bucket_start, "day");
      const current = byDay.get(dayKey) || { sum: 0, count: 0 };
      current.sum += Number(point.avg_value);
      current.count += 1;
      byDay.set(dayKey, current);
    }

    return Array.from(byDay.entries())
      .map(([dayKey, value]) => ({
        dayKey,
        avg: value.count ? value.sum / value.count : null
      }))
      .filter((item) => Number.isFinite(item.avg))
      .sort((a, b) => new Date(a.dayKey).getTime() - new Date(b.dayKey).getTime());
  }, [heatmapCard]);

  const heatmapMonthKeys = useMemo(() => allMonthKeysForYear(heatmapYear), [heatmapYear]);

  const heatmapMonthLabels = useMemo(
    () => heatmapMonthKeys.map((monthKey) => monthLabelFromKey(monthKey)),
    [heatmapMonthKeys]
  );

  const heatmapEntries = useMemo(() => {
    const monthIndexByKey = new Map(
      heatmapMonthKeys.map((monthKey, monthIndex) => [monthKey, monthIndex])
    );
    const realByDateKey = heatmapCard?.isDemo
      ? new Map()
      : new Map(
          heatmapDailyPoints.map((item) => [dateKeyFromIso(item.dayKey), Number(item.avg.toFixed(3))])
        );

    const cells = [];

    for (const monthKey of heatmapMonthKeys) {
      const monthIndex = monthIndexByKey.get(monthKey);
      const [year, monthNumber] = monthKey.split("-").map(Number);
      const totalDays = daysInMonth(year, monthNumber);

      for (let dayNumber = 1; dayNumber <= totalDays; dayNumber += 1) {
        const dayKey = `${monthKey}-${String(dayNumber).padStart(2, "0")}`;
        const realValue = realByDateKey.get(dayKey);
        const value = Number.isFinite(realValue)
          ? realValue
          : buildDemoHeatmapValue(selectedHeatmapType, year, monthNumber, dayNumber);

        cells.push({
          value: [monthIndex, dayNumber - 1, value],
          dateLabel: new Date(year, monthNumber - 1, dayNumber).toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          }),
          source: Number.isFinite(realValue) ? "real" : "demo"
        });
      }
    }

    return cells;
  }, [heatmapDailyPoints, heatmapMonthKeys, selectedHeatmapType, heatmapCard?.isDemo]);

  const heatmapHourlyByCell = useMemo(() => {
    const byCell = new Map();
    const series = heatmapHourlyQuery.data?.series || [];

    for (const point of series) {
      const bucketDate = new Date(point.bucket_start);
      if (Number.isNaN(bucketDate.getTime())) {
        continue;
      }

      if (bucketDate.getUTCFullYear() !== heatmapYear) {
        continue;
      }

      const dayOfYear = dayOfYearFromUtcDate(bucketDate);
      const hourOfDay = bucketDate.getUTCHours();
      const key = `${dayOfYear}-${hourOfDay}`;
      const current = byCell.get(key) || { sum: 0, count: 0 };
      current.sum += Number(point.avg_value);
      current.count += 1;
      byCell.set(key, current);
    }

    return byCell;
  }, [heatmapHourlyQuery.data?.series, heatmapYear]);

  const heatmapHourlyEntries = useMemo(() => {
    const cells = [];

    for (let dayOfYear = 1; dayOfYear <= heatmapDaysOfYear; dayOfYear += 1) {
      const date = dateFromYearDayUtc(heatmapYear, dayOfYear);
      const dateLabel = date.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC"
      });

      for (let hourOfDay = 0; hourOfDay < 24; hourOfDay += 1) {
        const key = `${dayOfYear}-${hourOfDay}`;
        const aggregate = heatmapHourlyByCell.get(key);
        const realValue = aggregate && aggregate.count > 0 ? aggregate.sum / aggregate.count : null;
        const value = Number.isFinite(realValue)
          ? Number(realValue.toFixed(3))
          : buildDemoHourlyHeatmapValue(selectedHeatmapType, heatmapYear, dayOfYear, hourOfDay);

        cells.push({
          value: [dayOfYear - 1, hourOfDay, value],
          dateLabel,
          hourLabel: `${String(hourOfDay).padStart(2, "0")}:00`,
          source: Number.isFinite(realValue) ? "real" : "demo"
        });
      }
    }

    return cells;
  }, [heatmapHourlyByCell, heatmapDaysOfYear, heatmapYear, selectedHeatmapType]);

  const heatmapValues = useMemo(
    () => heatmapEntries.map((entry) => Number(entry.value[2])).filter((value) => Number.isFinite(value)),
    [heatmapEntries]
  );
  const heatmapMinValue = heatmapValues.length ? Math.min(...heatmapValues) : null;
  const heatmapMaxValue = heatmapValues.length ? Math.max(...heatmapValues) : null;
  const heatmapRealCells = useMemo(
    () => heatmapEntries.filter((entry) => entry.source === "real").length,
    [heatmapEntries]
  );
  const heatmapDemoCells = heatmapEntries.length - heatmapRealCells;
  const heatmapHourlyRealCells = useMemo(
    () => heatmapHourlyEntries.filter((entry) => entry.source === "real").length,
    [heatmapHourlyEntries]
  );
  const heatmapHourlyDemoCells = heatmapHourlyEntries.length - heatmapHourlyRealCells;
  const heatmapUsesDemo = heatmapDemoCells > 0;
  const heatmapHourlyUsesDemo = heatmapHourlyDemoCells > 0;
  const shouldShowDemoNote = historySection !== "heatmap" && demoCards > 0;

  return (
    <section className="history-page">
      <article className="panel history-filter-panel">
        <h3>
          {historySection === "combined"
            ? "Analítica por parámetros"
            : historySection === "xy"
              ? "Relación de calidad de agua X-Y"
              : historySection === "heatmap"
                ? "Heatmap de calidad por día y mes"
              : "Analítica histórica por piscina"}
        </h3>
        <p className="history-intro">
          {historySection === "combined"
            ? "Comparativa en una sola gráfica para ver cómo evolucionan todos los parámetros en el mismo período."
            : historySection === "xy"
              ? "Gráfica de dispersión no temporal: cada punto cruza dos parámetros de calidad para revelar relaciones y patrones."
              : historySection === "heatmap"
                ? "Mapa de calor no temporal: eje X por fecha (meses), eje Y por día del mes, y color como intensidad del parámetro."
              : "Vista organizada por parámetros físico-químicos para detectar estabilidad, dispersión y tendencias de cada piscina en paralelo."}
        </p>

        {historySection === "xy" ? (
          <div className="filters-inline history-xy-controls">
            <div>
              <label htmlFor="pondSelect">Piscina</label>
              <select
                id="pondSelect"
                value={activePondId}
                onChange={(event) => setSelectedPondId(event.target.value)}
              >
                {displayPondOptions.map((pond) => (
                  <option key={pond.id} value={pond.id}>
                    {pond.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="xMetricSelect">Eje X</label>
              <select
                id="xMetricSelect"
                value={selectedXAxisType}
                onChange={(event) => {
                  const nextX = event.target.value;
                  setSelectedXAxisType(nextX);

                  if (nextX === selectedYAxisType) {
                    const fallbackY = sensorOrder.find((metricType) => metricType !== nextX) || nextX;
                    setSelectedYAxisType(fallbackY);
                  }
                }}
              >
                {sensorOrder.map((metricType) => (
                  <option key={`x-${metricType}`} value={metricType}>
                    {sensorMeta[metricType].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="yMetricSelect">Eje Y</label>
              <select
                id="yMetricSelect"
                value={selectedYAxisType}
                onChange={(event) => {
                  const nextY = event.target.value;
                  setSelectedYAxisType(nextY);

                  if (nextY === selectedXAxisType) {
                    const fallbackX = sensorOrder.find((metricType) => metricType !== nextY) || nextY;
                    setSelectedXAxisType(fallbackX);
                  }
                }}
              >
                {sensorOrder.map((metricType) => (
                  <option key={`y-${metricType}`} value={metricType}>
                    {sensorMeta[metricType].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rangeSelect">Rango</label>
              <select id="rangeSelect" value={range} onChange={(event) => setRange(event.target.value)}>
                <option value="24h">24 horas</option>
                <option value="7d">7 días</option>
                <option value="30d">30 días</option>
                <option value="90d">90 días</option>
                <option value="1y">1 año</option>
              </select>
            </div>
          </div>
        ) : historySection === "heatmap" ? (
          <div className="filters-inline history-heatmap-controls">
            <div>
              <label htmlFor="pondSelect">Piscina</label>
              <select
                id="pondSelect"
                value={activePondId}
                onChange={(event) => setSelectedPondId(event.target.value)}
              >
                {displayPondOptions.map((pond) => (
                  <option key={pond.id} value={pond.id}>
                    {pond.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="heatmapMetricSelect">Parámetro</label>
              <select
                id="heatmapMetricSelect"
                value={selectedHeatmapType}
                onChange={(event) => setSelectedHeatmapType(event.target.value)}
              >
                {sensorOrder.map((metricType) => (
                  <option key={`heat-${metricType}`} value={metricType}>
                    {sensorMeta[metricType].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="heatmapYearSelect">Año</label>
              <select
                id="heatmapYearSelect"
                value={selectedHeatmapYear}
                onChange={(event) => setSelectedHeatmapYear(Number(event.target.value))}
              >
                {heatmapYearOptions.map((year) => (
                  <option key={`heatmap-year-${year}`} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="filters-inline">
            <div>
              <label htmlFor="pondSelect">Piscina</label>
              <select
                id="pondSelect"
                value={activePondId}
                onChange={(event) => setSelectedPondId(event.target.value)}
              >
                {displayPondOptions.map((pond) => (
                  <option key={pond.id} value={pond.id}>
                    {pond.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rangeSelect">Rango</label>
              <select id="rangeSelect" value={range} onChange={(event) => setRange(event.target.value)}>
                <option value="24h">24 horas</option>
                <option value="7d">7 días</option>
                <option value="30d">30 días</option>
                <option value="90d">90 días</option>
                <option value="1y">1 año</option>
              </select>
            </div>
          </div>
        )}

        {shouldShowDemoNote ? (
          <p className="history-demo-note">
            {`Se muestran ${demoCards} gráfica(s) con datos demo porque no hay muestras reales para ese período o piscina.`}
          </p>
        ) : null}
      </article>

      {historySection === "pond" ? (
        <>
          <div className="history-kpi-grid">
            <article className="panel history-kpi-card">
              <span>Muestras procesadas</span>
              <strong>{totalSamples}</strong>
              <small>{rangeConfig.label}</small>
            </article>

            <article className="panel history-kpi-card">
              <span>Sensores reales</span>
              <strong>
                {realCoverage}/{sensorOrder.length}
              </strong>
              <small>{demoCards > 0 ? `${demoCards} en demo` : "Cobertura completa"}</small>
            </article>

            <article className="panel history-kpi-card">
              <span>Parámetros fuera de rango</span>
              <strong>{outOfRange}</strong>
              <small>Último bucket</small>
            </article>

            <article className="panel history-kpi-card">
              <span>Dispersión media</span>
              <strong>{formatNumber(averageRange, 2)}</strong>
              <small>Max - Min promedio</small>
            </article>
          </div>

          <div className="history-chart-grid">
            {chartCards.map((card) => (
              <article key={card.sensorType} className="panel history-chart-card">
                <header>
                  <div>
                    <h3>{card.label}</h3>
                    <p>
                      Último: <strong>{formatNumber(card.latestAvg, 2)}</strong> {card.unit}
                    </p>
                  </div>

                  <div className="history-chart-meta">
                    {card.isDemo ? <span className="demo-chip">Demo</span> : null}
                    <span className={`status-pill ${card.status === "OK" ? "status-ok" : "status-warning"}`}>
                      {card.status}
                    </span>
                    <span
                      className={`delta-chip ${
                        card.delta === null ? "delta-neutral" : card.delta >= 0 ? "delta-up" : "delta-down"
                      }`}
                    >
                      Delta {card.delta === null ? "-" : formatNumber(card.delta, 2)}
                    </span>
                  </div>
                </header>

                <ReactECharts
                  option={historyOption(card, rangeConfig.bucket)}
                  style={{ height: 340 }}
                />
              </article>
            ))}
          </div>
        </>
      ) : historySection === "combined" ? (
        <article className="panel history-combined-panel">
          <header className="history-combined-header">
            <h3>Comparativa unificada</h3>
            <p>
              Todos los parámetros en una misma gráfica usando índice normalizado: 0% equivale al
              límite inferior ideal y 100% al límite superior ideal.
            </p>
          </header>

          <ReactECharts
            option={combinedHistoryOption(combinedRows, rangeConfig.bucket)}
            style={{ height: 500 }}
          />
        </article>
      ) : historySection === "xy" ? (
        <article className="panel history-combined-panel">
          <header className="history-combined-header">
            <h3>Dispersión X-Y por calidad de agua</h3>
            <p>
              Cada punto representa un bucket de muestreo con la relación entre
              {` ${sensorMeta[selectedXAxisType].label}`} y {sensorMeta[selectedYAxisType].label}.
            </p>
          </header>

          <div className="history-xy-stats">
            <span>
              Puntos: <strong>{xyPoints.length}</strong>
            </span>
            <span>
              Correlación: <strong>{xyCorrelation === null ? "-" : formatNumber(xyCorrelation, 3)}</strong>
            </span>
            <span>
              Ajuste: <strong>{regressionEquation}</strong>
            </span>
            <span>
              R2: <strong>{xyRegression?.r2 === null || xyRegression?.r2 === undefined ? "-" : formatNumber(xyRegression.r2, 3)}</strong>
            </span>
            <span>
              Clusters k-means: <strong>{xyClusters.length}</strong>
            </span>
            <span>
              Fuente: <strong>{xyUsesDemo ? "Demo/mixto" : "Real"}</strong>
            </span>
          </div>

          {xyPoints.length ? (
            <ReactECharts
              option={xyScatterOption(xyPoints, selectedXAxisType, selectedYAxisType, xyRegression, xyClusters)}
              style={{ height: 500 }}
            />
          ) : (
            <p className="empty-text">No hay pares de datos para la combinación seleccionada.</p>
          )}
        </article>
      ) : (
        <article className="panel history-combined-panel">
          <header className="history-combined-header">
            <h3>Heatmap mensual del parámetro</h3>
            <p>
              Eje X: fecha por mes, eje Y: día del mes, eje Z: valor del parámetro seleccionado.
            </p>
          </header>

          <div className="history-xy-stats">
            <span>
              Parámetro: <strong>{sensorMeta[selectedHeatmapType].label}</strong>
            </span>
            <span>
              Celdas con dato: <strong>{heatmapEntries.length}</strong>
            </span>
            <span>
              Meses: <strong>{heatmapMonthLabels.length}</strong>
            </span>
            <span>
              Año: <strong>{selectedHeatmapYear}</strong>
            </span>
            <span>
              Celdas reales: <strong>{heatmapRealCells}</strong>
            </span>
            <span>
              Celdas demo: <strong>{heatmapDemoCells}</strong>
            </span>
            <span>
              Min: <strong>{heatmapMinValue === null ? "-" : `${formatNumber(heatmapMinValue, 2)} ${sensorMeta[selectedHeatmapType].unit}`}</strong>
            </span>
            <span>
              Max: <strong>{heatmapMaxValue === null ? "-" : `${formatNumber(heatmapMaxValue, 2)} ${sensorMeta[selectedHeatmapType].unit}`}</strong>
            </span>
            <span>
              Fuente: <strong>{heatmapUsesDemo ? "Demo/mixto" : "Real"}</strong>
            </span>
          </div>

          {heatmapEntries.length ? (
            <ReactECharts
              option={monthlyHeatmapOption(heatmapEntries, heatmapMonthLabels, selectedHeatmapType)}
              style={{ height: 540 }}
            />
          ) : (
            <p className="empty-text">No hay datos suficientes para construir el heatmap en este rango.</p>
          )}

          <div className="history-secondary-heatmap">
            <header className="history-combined-header">
              <h3>Heatmap horario por día del año</h3>
              <p>
                Eje X: fecha (día/mes) a lo largo del año, eje Y: horas del día, eje Z: valor del parámetro seleccionado.
              </p>
            </header>

            <div className="history-xy-stats">
              <span>
                Celdas con dato: <strong>{heatmapHourlyEntries.length}</strong>
              </span>
              <span>
                Horas: <strong>{hourOfDayLabels.length}</strong>
              </span>
              <span>
                Días: <strong>{heatmapDaysOfYear}</strong>
              </span>
              <span>
                Celdas reales: <strong>{heatmapHourlyRealCells}</strong>
              </span>
              <span>
                Celdas demo: <strong>{heatmapHourlyDemoCells}</strong>
              </span>
              <span>
                Fuente: <strong>{heatmapHourlyUsesDemo ? "Demo/mixto" : "Real"}</strong>
              </span>
            </div>

            <ReactECharts
              option={yearlyHourlyHeatmapOption(heatmapHourlyEntries, heatmapDaysOfYear, selectedHeatmapType, selectedHeatmapYear)}
              style={{ height: 560 }}
            />
          </div>
        </article>
      )}
    </section>
  );
}
