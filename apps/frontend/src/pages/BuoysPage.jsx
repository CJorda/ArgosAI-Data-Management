import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { useLocation } from "react-router-dom";
import "./BuoysPage.css";

const BUOY_CATALOG = [
  {
    id: "BOYA-NORTE-01",
    name: "Boya Norte 01",
    zone: "Ria de Vigo",
    depthM: 50,
    anchorLat: 42.2451,
    anchorLon: -8.7858,
    mooringRadiusM: 34,
    solarPeakW: 320,
    baseConsumptionW: 145,
    batteryCapacityWh: 5200,
    reserveSocPct: 24
  },
  {
    id: "BOYA-NORTE-02",
    name: "Boya Norte 02",
    zone: "Ria de Arousa",
    depthM: 45,
    anchorLat: 42.5976,
    anchorLon: -8.9431,
    mooringRadiusM: 30,
    solarPeakW: 300,
    baseConsumptionW: 132,
    batteryCapacityWh: 4800,
    reserveSocPct: 23
  },
  {
    id: "BOYA-SUR-01",
    name: "Boya Sur 01",
    zone: "Costa de Huelva",
    depthM: 38,
    anchorLat: 37.1834,
    anchorLon: -6.9724,
    mooringRadiusM: 28,
    solarPeakW: 340,
    baseConsumptionW: 151,
    batteryCapacityWh: 5600,
    reserveSocPct: 22
  },
  {
    id: "BOYA-ESTE-01",
    name: "Boya Este 01",
    zone: "Mar Menor",
    depthM: 32,
    anchorLat: 37.7361,
    anchorLon: -0.7421,
    mooringRadiusM: 26,
    solarPeakW: 285,
    baseConsumptionW: 126,
    batteryCapacityWh: 4500,
    reserveSocPct: 21
  }
];

const DEPTH_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const DIRECTION_LABELS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSO",
  "SO",
  "OSO",
  "O",
  "ONO",
  "NO",
  "NNO"
];

const METRIC_PALETTE = {
  oxygen: ["#0e9a83", "#34af96", "#5fc7b0", "#87d8c5"],
  temperature: ["#ff7f45", "#ff9a68", "#ffb088", "#ffc8ad"],
  waveHeight: ["#1f73c6", "#3d8ede", "#6aa7ea", "#9ec5f5"]
};

const WIND_ROSE_COLORS = [
  "#1f8a70",
  "#2a9d8f",
  "#43aa8b",
  "#6abf9a",
  "#7ebf71",
  "#95c66d",
  "#b8cf74",
  "#d6d87a",
  "#edcf6b",
  "#f4b860",
  "#f09f5a",
  "#ea8455",
  "#e76f51",
  "#cf5e56",
  "#b14f5c",
  "#8e3d63"
];

const DRIFT_WARNING_RATIO = 0.82;

const EARTH_RADIUS_M = 6371000;

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function toDegrees(value) {
  return (Number(value) * 180) / Math.PI;
}

function metersToLatitudeDegrees(meters) {
  return Number(meters) / 111320;
}

function metersToLongitudeDegrees(meters, latitude) {
  const cosLatitude = Math.max(Math.cos(toRadians(latitude)), 0.12);
  return Number(meters) / (111320 * cosLatitude);
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const latitude1 = toRadians(lat1);
  const latitude2 = toRadians(lat2);
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function normalizeAngle(angle) {
  return (Number(angle) % 360 + 360) % 360;
}

function bearingBetweenPoints(lat1, lon1, lat2, lon2) {
  const latitude1 = toRadians(lat1);
  const latitude2 = toRadians(lat2);
  const deltaLon = toRadians(lon2 - lon1);

  const y = Math.sin(deltaLon) * Math.cos(latitude2);
  const x =
    Math.cos(latitude1) * Math.sin(latitude2)
    - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(deltaLon);

  return normalizeAngle(toDegrees(Math.atan2(y, x)));
}

function bearingToDirectionLabel(bearingDeg) {
  const index = Math.floor((normalizeAngle(bearingDeg) + 11.25) / 22.5) % DIRECTION_LABELS.length;
  return DIRECTION_LABELS[index] || "-";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function phaseFromId(value) {
  const source = String(value || "");
  const total = Array.from(source).reduce(
    (acc, char, index) => acc + char.charCodeAt(0) * (index + 1),
    0
  );

  return total / 71;
}

function pseudoNoise(seed, index) {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function formatAxisLabel(date) {
  const day = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit"
  });
  const hour = date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  return `${day}\n${hour}`;
}

function formatHourLabel(date) {
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function formatTimelineLabel(point) {
  if (!point) {
    return "-";
  }

  return String(point.axisLabel || point.hourLabel || "-").replace("\n", " ");
}

function formatMetricValue(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return numeric.toFixed(digits);
}

function buildTelemetryForBuoy(buoy, windowHours) {
  const sampleCount = Math.max(24, Math.min(96, Number(windowHours) || 48));
  const baseTime = Date.now() - (sampleCount - 1) * 3600 * 1000;
  const phase = phaseFromId(`${buoy.id}-${buoy.zone}`);
  const anchorLat = Number(buoy.anchorLat) || 0;
  const anchorLon = Number(buoy.anchorLon) || 0;
  const mooringRadiusM = Math.max(10, Number(buoy.mooringRadiusM) || 30);
  const solarPeakW = Math.max(120, Number(buoy.solarPeakW) || 260);
  const baseConsumptionW = Math.max(70, Number(buoy.baseConsumptionW) || 125);
  const batteryCapacityWh = Math.max(2200, Number(buoy.batteryCapacityWh) || 4600);
  const reserveSocPct = clamp(Number(buoy.reserveSocPct) || 22, 10, 40);
  let batterySocPct = clamp(66 + Math.sin(phase * 0.4) * 12, reserveSocPct + 8, 96);

  const points = Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const timestamp = new Date(baseTime + sampleIndex * 3600 * 1000);
    const hourRatio = (timestamp.getHours() + timestamp.getMinutes() / 60) / 24;
    const diurnal = Math.sin(hourRatio * Math.PI * 2 - Math.PI / 3);
    const tide = Math.sin((sampleIndex + phase) * 0.23);

    const oxygen = clamp(
      7.2 + diurnal * 0.92 + tide * 0.34 + (pseudoNoise(phase, sampleIndex) - 0.5) * 0.45,
      5.1,
      10.8
    );

    const temperature = clamp(
      16.6 + diurnal * 1.85 + tide * 0.52 + (pseudoNoise(phase * 1.7, sampleIndex) - 0.5) * 0.66,
      12,
      24
    );

    const waveHeight = clamp(
      0.95 + Math.abs(Math.sin((sampleIndex + phase) * 0.18)) * 1.1 + (pseudoNoise(phase * 2.3, sampleIndex) - 0.5) * 0.3,
      0.2,
      3.8
    );

    const currentsByDepth = DEPTH_LEVELS.map((depth, depthIndex) => {
      const attenuation = Math.exp(-depth / (30 + buoy.depthM * 0.35));
      const shear = Math.sin(sampleIndex * 0.41 + depthIndex * 0.76 + phase) * 0.23;
      const pulse = Math.cos(sampleIndex * 0.15 + depth * 0.09 + phase * 0.4) * 0.12;

      return Number(
        clamp(
          0.25 + attenuation * 0.7 + shear + pulse + Math.abs(pseudoNoise(phase + depth * 0.43, sampleIndex)) * 0.08,
          0.04,
          1.95
        ).toFixed(3)
      );
    });

    const windSpeed = clamp(
      6 + Math.abs(Math.sin((sampleIndex + phase) * 0.2)) * 9.5 + (pseudoNoise(phase * 3.2, sampleIndex) - 0.5) * 2.4,
      0.6,
      28
    );

    const windDirection =
      (235 + Math.sin((sampleIndex + phase) * 0.11) * 74 + (pseudoNoise(phase * 0.8, sampleIndex) - 0.5) * 68 + 360) %
      360;

    const daylightFactor = Math.max(0, Math.sin((hourRatio - 0.25) * Math.PI * 2));
    const cloudFactor = clamp(
      0.64 + Math.sin((sampleIndex + phase) * 0.09) * 0.2 + (pseudoNoise(phase * 6.1, sampleIndex) - 0.5) * 0.18,
      0.35,
      1
    );

    const solarGenerationW = clamp(
      solarPeakW * daylightFactor * cloudFactor,
      0,
      solarPeakW * 1.03
    );

    const communicationLoadW = Math.abs(Math.sin((sampleIndex + phase) * 0.73)) * 23;
    const actuationLoadW = Math.max(0, waveHeight - 1.1) * 24 + Math.abs(tide) * 9;
    const sensorLoadW = Math.max(0.6, 0.85 + Math.sin((sampleIndex + phase) * 0.37) * 0.15) * 18;

    const systemConsumptionW = clamp(
      baseConsumptionW + communicationLoadW + actuationLoadW + sensorLoadW
      + (pseudoNoise(phase * 3.9, sampleIndex) - 0.5) * 10,
      baseConsumptionW * 0.75,
      baseConsumptionW * 1.72
    );

    const netPowerW = solarGenerationW - systemConsumptionW;
    batterySocPct = clamp(
      batterySocPct + (netPowerW / batteryCapacityWh) * 100,
      reserveSocPct - 2,
      100
    );

    const batteryVoltageV = clamp(
      11.7 + batterySocPct * 0.016 + (netPowerW > 8 ? 0.22 : -0.04),
      11.4,
      14.25
    );

    const controllerTempC = clamp(
      27.5 + daylightFactor * 11.5 + (systemConsumptionW / baseConsumptionW - 1) * 6.4
      + (pseudoNoise(phase * 7.2, sampleIndex) - 0.5) * 2.8,
      17,
      57
    );

    const linkQualityPct = clamp(
      87 + Math.sin((sampleIndex + phase) * 0.16) * 7 + (pseudoNoise(phase * 2.8, sampleIndex) - 0.5) * 8,
      62,
      99
    );

    let driftNorthM =
      Math.sin((sampleIndex + phase) * 0.19) * (mooringRadiusM * 0.42)
      + Math.cos((sampleIndex + phase) * 0.05) * (mooringRadiusM * 0.18)
      + (pseudoNoise(phase * 4.6, sampleIndex) - 0.5) * (mooringRadiusM * 0.2);

    let driftEastM =
      Math.cos((sampleIndex + phase) * 0.17) * (mooringRadiusM * 0.4)
      + Math.sin((sampleIndex + phase) * 0.07) * (mooringRadiusM * 0.15)
      + (pseudoNoise(phase * 5.2, sampleIndex) - 0.5) * (mooringRadiusM * 0.2);

    const driftMagnitude = Math.hypot(driftNorthM, driftEastM);
    const driftCap = mooringRadiusM * 1.08;

    if (driftMagnitude > driftCap && driftMagnitude > 0) {
      const scale = driftCap / driftMagnitude;
      driftNorthM *= scale;
      driftEastM *= scale;
    }

    const gpsLat = anchorLat + metersToLatitudeDegrees(driftNorthM);
    const gpsLon = anchorLon + metersToLongitudeDegrees(driftEastM, anchorLat);
    const driftRadiusM = Math.hypot(driftNorthM, driftEastM);

    return {
      timestamp,
      axisLabel: formatAxisLabel(timestamp),
      hourLabel: formatHourLabel(timestamp),
      oxygen: Number(oxygen.toFixed(3)),
      temperature: Number(temperature.toFixed(3)),
      waveHeight: Number(waveHeight.toFixed(3)),
      currentsByDepth,
      windSpeed: Number(windSpeed.toFixed(3)),
      windDirection: Number(windDirection.toFixed(2)),
      solarGenerationW: Number(solarGenerationW.toFixed(2)),
      systemConsumptionW: Number(systemConsumptionW.toFixed(2)),
      netPowerW: Number(netPowerW.toFixed(2)),
      batterySocPct: Number(batterySocPct.toFixed(2)),
      batteryVoltageV: Number(batteryVoltageV.toFixed(2)),
      controllerTempC: Number(controllerTempC.toFixed(2)),
      linkQualityPct: Number(linkQualityPct.toFixed(1)),
      gpsLat: Number(gpsLat.toFixed(6)),
      gpsLon: Number(gpsLon.toFixed(6)),
      driftRadiusM: Number(driftRadiusM.toFixed(2))
    };
  });

  return {
    buoyId: buoy.id,
    points
  };
}

function metricChartOption({ field, unit, selectedBuoys, telemetryByBuoy }) {
  const referenceBuoyId = selectedBuoys[0]?.id;
  const axisLabels = (telemetryByBuoy.get(referenceBuoyId)?.points || []).map((point) => point.axisLabel);
  const colorSet = METRIC_PALETTE[field] || METRIC_PALETTE.oxygen;

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross"
      },
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#bfd3e8",
      borderWidth: 1,
      textStyle: {
        color: "#1c3552"
      },
      valueFormatter: (value) => `${formatMetricValue(value, 2)} ${unit}`
    },
    legend: {
      top: 2,
      type: "scroll",
      itemWidth: 14,
      itemHeight: 8,
      textStyle: {
        color: "#3f5879"
      },
      data: selectedBuoys.map((buoy) => buoy.name)
    },
    grid: {
      top: 58,
      right: 16,
      bottom: 44,
      left: 56
    },
    xAxis: {
      type: "category",
      data: axisLabels,
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788",
        interval: axisLabels.length > 14 ? Math.ceil(axisLabels.length / 14) - 1 : 0,
        hideOverlap: true,
        fontSize: 11
      }
    },
    yAxis: {
      type: "value",
      name: unit,
      nameTextStyle: {
        color: "#4d6788"
      },
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788",
        formatter: (value) => formatMetricValue(value, 1)
      },
      splitLine: {
        lineStyle: {
          color: "rgba(146, 169, 194, 0.3)",
          type: "dashed"
        }
      }
    },
    series: selectedBuoys.map((buoy, index) => {
      const points = telemetryByBuoy.get(buoy.id)?.points || [];
      const color = colorSet[index % colorSet.length];

      return {
        name: buoy.name,
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 2.2,
          color
        },
        emphasis: {
          focus: "series"
        },
        data: points.map((point) => point[field])
      };
    })
  };
}

function buoyEnergyOption(focusTelemetry) {
  const points = focusTelemetry?.points || [];
  if (!points.length) {
    return null;
  }

  const labels = points.map((point) => point.hourLabel);
  const solarValues = points.map((point) => Number(point.solarGenerationW) || 0);
  const consumptionValues = points.map((point) => Number(point.systemConsumptionW) || 0);
  const netValues = points.map((point) => Number(point.netPowerW) || 0);
  const batterySocValues = points.map((point) => Number(point.batterySocPct) || 0);

  const maxPower = Math.max(120, ...solarValues, ...consumptionValues) * 1.16;

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross"
      },
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#bfd3e8",
      borderWidth: 1,
      textStyle: {
        color: "#1c3552"
      }
    },
    legend: {
      top: 4,
      textStyle: {
        color: "#3f5879"
      },
      data: ["Generación solar", "Consumo sistema", "Balance neto", "SOC batería"]
    },
    grid: {
      top: 58,
      right: 58,
      bottom: 44,
      left: 62
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788",
        interval: labels.length > 18 ? Math.ceil(labels.length / 18) - 1 : 0,
        hideOverlap: true,
        fontSize: 11
      }
    },
    yAxis: [
      {
        type: "value",
        min: Math.min(-120, Math.min(...netValues) * 1.2),
        max: Number(maxPower.toFixed(0)),
        name: "Potencia (W)",
        nameTextStyle: {
          color: "#4d6788"
        },
        axisLine: {
          lineStyle: {
            color: "rgba(112, 138, 170, 0.52)"
          }
        },
        axisLabel: {
          color: "#4d6788",
          formatter: (value) => formatMetricValue(value, 0)
        },
        splitLine: {
          lineStyle: {
            color: "rgba(146, 169, 194, 0.3)",
            type: "dashed"
          }
        }
      },
      {
        type: "value",
        min: 0,
        max: 100,
        name: "SOC (%)",
        nameTextStyle: {
          color: "#4d6788"
        },
        axisLine: {
          lineStyle: {
            color: "rgba(112, 138, 170, 0.52)"
          }
        },
        axisLabel: {
          color: "#4d6788",
          formatter: (value) => `${formatMetricValue(value, 0)}%`
        },
        splitLine: {
          show: false
        }
      }
    ],
    series: [
      {
        name: "Generación solar",
        type: "bar",
        barMaxWidth: 16,
        itemStyle: {
          color: "#f0b24a",
          borderRadius: [4, 4, 0, 0]
        },
        data: solarValues
      },
      {
        name: "Consumo sistema",
        type: "line",
        smooth: 0.2,
        showSymbol: false,
        lineStyle: {
          width: 2.3,
          color: "#d95d39"
        },
        data: consumptionValues
      },
      {
        name: "Balance neto",
        type: "line",
        smooth: 0.12,
        showSymbol: false,
        lineStyle: {
          width: 2,
          type: "dashed",
          color: "#2f7fd1"
        },
        areaStyle: {
          color: "rgba(47, 127, 209, 0.16)"
        },
        data: netValues,
        markLine: {
          symbol: "none",
          lineStyle: {
            color: "#6e87a8",
            type: "dotted"
          },
          data: [{ yAxis: 0 }]
        }
      },
      {
        name: "SOC batería",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 2.1,
          color: "#1f4f7e"
        },
        data: batterySocValues
      }
    ]
  };
}

function buildBuoyEnergyStats(focusBuoy, focusTelemetry) {
  const points = focusTelemetry?.points || [];
  if (!focusBuoy || points.length === 0) {
    return null;
  }

  const latest = points[points.length - 1];
  const recent = points.slice(-8);
  const batteryCapacityWh = Math.max(2200, Number(focusBuoy.batteryCapacityWh) || 4600);
  const reserveSocPct = clamp(Number(focusBuoy.reserveSocPct) || 22, 10, 40);

  const avgGenerationW = points.reduce((acc, point) => acc + (Number(point.solarGenerationW) || 0), 0) / points.length;
  const avgConsumptionW = points.reduce((acc, point) => acc + (Number(point.systemConsumptionW) || 0), 0) / points.length;
  const avgNetRecentW = recent.reduce((acc, point) => acc + (Number(point.netPowerW) || 0), 0) / Math.max(1, recent.length);

  const latestSocPct = Number(latest.batterySocPct) || 0;
  const latestGenerationW = Number(latest.solarGenerationW) || 0;
  const latestConsumptionW = Number(latest.systemConsumptionW) || 0;
  const latestNetW = Number(latest.netPowerW) || 0;

  const usableEnergyWh = Math.max(0, ((latestSocPct - reserveSocPct) / 100) * batteryCapacityWh);
  const predictedDrainW = Math.max(18, latestConsumptionW - avgGenerationW * 0.28);
  const autonomyHours = clamp(usableEnergyWh / predictedDrainW, 0, 240);

  const coveragePct = latestConsumptionW > 0
    ? clamp((latestGenerationW / latestConsumptionW) * 100, 0, 300)
    : 0;

  const batteryHealthPct = clamp(
    87 + Math.sin(phaseFromId(focusBuoy.id) * 0.7) * 4 - Math.max(0, 28 - latestSocPct) * 0.14,
    64,
    98
  );

  const trendLabel = avgNetRecentW > 12
    ? "Cargando"
    : avgNetRecentW < -12
      ? "Descargando"
      : "Estable";

  const statusLevel = latestSocPct < reserveSocPct + 6 || Number(latest.controllerTempC) > 51
    ? "critico"
    : latestSocPct < reserveSocPct + 14 || Number(latest.linkQualityPct) < 74
      ? "alerta"
      : "nominal";

  return {
    latestGenerationW,
    latestConsumptionW,
    latestNetW,
    avgGenerationW,
    avgConsumptionW,
    coveragePct,
    autonomyHours,
    latestSocPct,
    batteryVoltageV: Number(latest.batteryVoltageV) || 0,
    controllerTempC: Number(latest.controllerTempC) || 0,
    linkQualityPct: Number(latest.linkQualityPct) || 0,
    batteryHealthPct,
    trendLabel,
    statusLevel
  };
}

function currentsHeatmapOption(focusTelemetry) {
  const points = focusTelemetry?.points || [];
  const xLabels = points.map((point) => point.hourLabel);
  const depthLabels = DEPTH_LEVELS.map((depth) => `${depth} m`);
  const heatmapPoints = [];

  for (let xIndex = 0; xIndex < points.length; xIndex += 1) {
    const row = points[xIndex];

    for (let yIndex = 0; yIndex < DEPTH_LEVELS.length; yIndex += 1) {
      const value = Number(row.currentsByDepth?.[yIndex] || 0);
      heatmapPoints.push([xIndex, yIndex, value]);
    }
  }

  const values = heatmapPoints.map((item) => item[2]);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;

  return {
    backgroundColor: "transparent",
    tooltip: {
      position: "top",
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#bfd3e8",
      borderWidth: 1,
      textStyle: {
        color: "#1c3552"
      },
      formatter: (params) => {
        const depthLabel = depthLabels[params.value[1]];
        const hourLabel = xLabels[params.value[0]];

        return `${hourLabel}<br/>Profundidad: ${depthLabel}<br/>Velocidad: ${formatMetricValue(params.value[2], 2)} m/s`;
      }
    },
    grid: {
      top: 16,
      right: 90,
      bottom: 48,
      left: 66
    },
    xAxis: {
      type: "category",
      data: xLabels,
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788",
        interval: xLabels.length > 18 ? Math.ceil(xLabels.length / 18) - 1 : 0,
        hideOverlap: true,
        fontSize: 11
      }
    },
    yAxis: {
      type: "category",
      data: depthLabels,
      inverse: true,
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788"
      }
    },
    visualMap: {
      min: Number(minValue.toFixed(2)),
      max: Number(maxValue.toFixed(2)),
      right: 14,
      top: "middle",
      calculable: true,
      text: ["m/s", ""],
      textStyle: {
        color: "#3f5879"
      },
      inRange: {
        color: ["#0d3b66", "#2c7fb8", "#7fcdbb", "#f9f871", "#f4a259", "#d84727"]
      }
    },
    series: [
      {
        type: "heatmap",
        data: heatmapPoints,
        emphasis: {
          itemStyle: {
            borderColor: "#152238",
            borderWidth: 1
          }
        },
        progressive: 0
      }
    ]
  };
}

function aggregateWindData(telemetryRows) {
  const buckets = DIRECTION_LABELS.map((direction) => ({
    direction,
    weight: 0
  }));

  let totalSamples = 0;
  let speedSum = 0;

  for (const telemetry of telemetryRows) {
    for (const point of telemetry.points) {
      const normalized = (point.windDirection + 360) % 360;
      const directionIndex =
        Math.floor((normalized + 11.25) / 22.5) % DIRECTION_LABELS.length;
      const weight = 1 + point.windSpeed / 12;

      buckets[directionIndex].weight += weight;
      totalSamples += 1;
      speedSum += point.windSpeed;
    }
  }

  const totalWeight = buckets.reduce((acc, bucket) => acc + bucket.weight, 0) || 1;
  const roseData = buckets.map((bucket) => ({
    direction: bucket.direction,
    percent: Number(((bucket.weight / totalWeight) * 100).toFixed(2))
  }));

  const dominant = roseData.reduce((max, current) =>
    current.percent > max.percent ? current : max
  , roseData[0] || { direction: "-", percent: 0 });

  return {
    roseData,
    dominantDirection: dominant.direction,
    dominantPercent: dominant.percent,
    avgWindSpeed: totalSamples ? speedSum / totalSamples : 0,
    samples: totalSamples
  };
}

function windRoseOption(roseData) {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#bfd3e8",
      borderWidth: 1,
      textStyle: {
        color: "#1c3552"
      },
      formatter: (params) => `${params.name}: ${formatMetricValue(params.value, 2)}%`
    },
    angleAxis: {
      type: "category",
      data: roseData.map((item) => item.direction),
      startAngle: 90,
      axisLabel: {
        color: "#4d6788",
        interval: 0
      },
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      }
    },
    radiusAxis: {
      axisLabel: {
        color: "#4d6788",
        formatter: (value) => `${formatMetricValue(value, 0)}%`
      },
      splitLine: {
        lineStyle: {
          color: "rgba(146, 169, 194, 0.3)",
          type: "dashed"
        }
      }
    },
    polar: {},
    series: [
      {
        type: "bar",
        coordinateSystem: "polar",
        roundCap: true,
        barWidth: "62%",
        data: roseData.map((item, index) => ({
          value: item.percent,
          name: item.direction,
          itemStyle: {
            color: WIND_ROSE_COLORS[index % WIND_ROSE_COLORS.length]
          }
        })),
        animationDuration: 500
      }
    ]
  };
}

function gpsTrajectoryOption(focusBuoy, focusTelemetry, cursorIndex) {
  const points = focusTelemetry?.points || [];
  if (!focusBuoy || points.length === 0) {
    return null;
  }

  const anchorLat = Number(focusBuoy.anchorLat);
  const anchorLon = Number(focusBuoy.anchorLon);
  const safeCursorIndex = clamp(Math.round(Number(cursorIndex) || points.length - 1), 0, points.length - 1);

  const trajectoryData = points.map((point, index) => {
    return [
      Number(point.gpsLon),
      Number(point.gpsLat),
      formatTimelineLabel(point),
      Number(point.driftRadiusM),
      index
    ];
  });

  const lonValues = trajectoryData.map((item) => item[0]);
  const latValues = trajectoryData.map((item) => item[1]);

  const lonMinBase = Math.min(anchorLon, ...lonValues);
  const lonMaxBase = Math.max(anchorLon, ...lonValues);
  const latMinBase = Math.min(anchorLat, ...latValues);
  const latMaxBase = Math.max(anchorLat, ...latValues);

  const lonSpread = Math.max(0.00016, lonMaxBase - lonMinBase);
  const latSpread = Math.max(0.00016, latMaxBase - latMinBase);
  const lonPadding = lonSpread * 0.32;
  const latPadding = latSpread * 0.32;

  const traversedData = trajectoryData.slice(0, safeCursorIndex + 1);
  const pendingData = safeCursorIndex < trajectoryData.length - 1
    ? trajectoryData.slice(safeCursorIndex)
    : [];
  const cursorPoint = trajectoryData[safeCursorIndex] || null;
  const latestPoint = trajectoryData[trajectoryData.length - 1];
  const showCurrentMarker = safeCursorIndex < trajectoryData.length - 1;

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#bfd3e8",
      borderWidth: 1,
      textStyle: {
        color: "#1c3552"
      },
      formatter: (params) => {
        if (params.seriesName === "Posición de fondeo") {
          return `Fondeo<br/>Lat: ${formatMetricValue(anchorLat, 6)}<br/>Lon: ${formatMetricValue(anchorLon, 6)}`;
        }

        const value = Array.isArray(params.value) ? params.value : [];
        const [lon, lat, hour, drift, sampleIndex] = value;

        const stateLabel = Number(sampleIndex) === safeCursorIndex
          ? "Cursor temporal"
          : Number(sampleIndex) === points.length - 1
            ? "Posición actual"
            : Number(sampleIndex) === 0
              ? "Inicio"
              : "Muestra";

        return `${stateLabel}<br/>Hora: ${hour || "-"}<br/>Paso: ${Number(sampleIndex) + 1}/${points.length}<br/>Lat: ${formatMetricValue(lat, 6)}<br/>Lon: ${formatMetricValue(lon, 6)}<br/>Deriva: ${formatMetricValue(drift, 2)} m`;
      }
    },
    legend: {
      top: 4,
      textStyle: {
        color: "#3f5879"
      },
      data: [
        "Trayectoria completa",
        "Trayectoria recorrida",
        "Trayectoria pendiente",
        "Posición en barra temporal",
        "Posición actual",
        "Posición de fondeo"
      ]
    },
    grid: {
      top: 56,
      right: 18,
      bottom: 42,
      left: 68
    },
    xAxis: {
      type: "value",
      min: lonMinBase - lonPadding,
      max: lonMaxBase + lonPadding,
      name: "Longitud",
      nameTextStyle: {
        color: "#4d6788"
      },
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788",
        formatter: (value) => formatMetricValue(value, 5)
      },
      splitLine: {
        lineStyle: {
          color: "rgba(146, 169, 194, 0.28)",
          type: "dashed"
        }
      }
    },
    yAxis: {
      type: "value",
      min: latMinBase - latPadding,
      max: latMaxBase + latPadding,
      name: "Latitud",
      nameTextStyle: {
        color: "#4d6788"
      },
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788",
        formatter: (value) => formatMetricValue(value, 5)
      },
      splitLine: {
        lineStyle: {
          color: "rgba(146, 169, 194, 0.28)",
          type: "dashed"
        }
      }
    },
    series: [
      {
        name: "Trayectoria completa",
        type: "line",
        data: trajectoryData,
        showSymbol: false,
        smooth: 0.15,
        lineStyle: {
          width: 1.6,
          color: "rgba(47, 127, 209, 0.34)"
        }
      },
      {
        name: "Trayectoria recorrida",
        type: "line",
        data: traversedData,
        showSymbol: false,
        smooth: 0.22,
        lineStyle: {
          width: 2.8,
          color: "#2f7fd1"
        }
      },
      {
        name: "Trayectoria pendiente",
        type: "line",
        data: pendingData,
        showSymbol: false,
        smooth: 0.22,
        lineStyle: {
          width: 2,
          type: "dashed",
          color: "rgba(240, 140, 77, 0.7)"
        }
      },
      {
        name: "Posición en barra temporal",
        type: "effectScatter",
        data: cursorPoint ? [cursorPoint] : [],
        symbolSize: 11,
        rippleEffect: {
          scale: 2.2,
          brushType: "stroke"
        },
        itemStyle: {
          color: "#f08c4d"
        }
      },
      {
        name: "Posición actual",
        type: "scatter",
        data: showCurrentMarker && latestPoint ? [latestPoint] : [],
        symbolSize: 9,
        itemStyle: {
          color: "#1f4f7e"
        }
      },
      {
        name: "Posición de fondeo",
        type: "scatter",
        data: [[anchorLon, anchorLat]],
        symbol: "diamond",
        symbolSize: 12,
        itemStyle: {
          color: "#1f4f7e"
        }
      }
    ]
  };
}

function gpsDriftHistogramOption(focusBuoy, focusTelemetry) {
  const points = focusTelemetry?.points || [];
  if (!focusBuoy || points.length === 0) {
    return null;
  }

  const driftValues = points.map((point) => Math.max(0, Number(point.driftRadiusM) || 0));
  const mooringRadiusM = Math.max(1, Number(focusBuoy.mooringRadiusM) || 1);
  const warningRatio = clamp(Number(focusBuoy.driftWarningRatio) || DRIFT_WARNING_RATIO, 0.6, 0.98);
  const warningThresholdM = mooringRadiusM * warningRatio;
  const maxDriftM = Math.max(mooringRadiusM * 1.2, ...driftValues, 1);
  const binCount = clamp(Math.round(Math.sqrt(driftValues.length) * 1.45), 8, 16);
  const binWidth = maxDriftM / binCount;

  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = index * binWidth;
    const end = index === binCount - 1 ? maxDriftM : (index + 1) * binWidth;

    return {
      start,
      end,
      count: 0
    };
  });

  for (const drift of driftValues) {
    const index = Math.min(binCount - 1, Math.floor(drift / binWidth));
    bins[index].count += 1;
  }

  const categoryLabels = bins.map((bin) => `${formatMetricValue(bin.start, 0)}-${formatMetricValue(bin.end, 0)}`);
  const warningStartIndex = Math.max(0, Math.min(binCount - 1, Math.floor(warningThresholdM / binWidth)));
  const dangerStartIndex = Math.max(0, Math.min(binCount - 1, Math.ceil(mooringRadiusM / binWidth)));
  const radiusMarkIndex = Math.max(0, Math.min(binCount - 1, Math.floor(mooringRadiusM / binWidth)));

  const riskBandAreas = [];

  if (warningStartIndex > 0) {
    riskBandAreas.push([
      {
        name: "Estable",
        xAxis: categoryLabels[0],
        itemStyle: {
          color: "rgba(76, 175, 120, 0.14)"
        }
      },
      {
        xAxis: categoryLabels[warningStartIndex - 1]
      }
    ]);
  }

  if (warningStartIndex <= dangerStartIndex - 1) {
    riskBandAreas.push([
      {
        name: "Cerca del límite",
        xAxis: categoryLabels[warningStartIndex],
        itemStyle: {
          color: "rgba(233, 185, 73, 0.18)"
        }
      },
      {
        xAxis: categoryLabels[dangerStartIndex - 1]
      }
    ]);
  }

  if (dangerStartIndex <= binCount - 1) {
    riskBandAreas.push([
      {
        name: "Fuera de radio",
        xAxis: categoryLabels[dangerStartIndex],
        itemStyle: {
          color: "rgba(217, 93, 57, 0.15)"
        }
      },
      {
        xAxis: categoryLabels[binCount - 1]
      }
    ]);
  }

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#bfd3e8",
      borderWidth: 1,
      textStyle: {
        color: "#1c3552"
      },
      formatter: (params) => {
        const data = params.data || {};
        const zone = data.start >= mooringRadiusM
          ? "Fuera de radio"
          : data.end > warningThresholdM
            ? "Cerca del límite"
            : "Estable";

        return `Deriva ${formatMetricValue(data.start, 1)}-${formatMetricValue(data.end, 1)} m<br/>Muestras: ${data.value || 0}<br/>Zona: ${zone}`;
      }
    },
    grid: {
      top: 30,
      right: 18,
      bottom: 58,
      left: 58
    },
    xAxis: {
      type: "category",
      data: categoryLabels,
      name: "Rango de deriva (m)",
      nameGap: 34,
      nameTextStyle: {
        color: "#4d6788"
      },
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788",
        interval: bins.length > 10 ? 1 : 0,
        rotate: 22
      }
    },
    yAxis: {
      type: "value",
      name: "Muestras",
      nameTextStyle: {
        color: "#4d6788"
      },
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788",
        formatter: (value) => formatMetricValue(value, 0)
      },
      splitLine: {
        lineStyle: {
          color: "rgba(146, 169, 194, 0.3)",
          type: "dashed"
        }
      }
    },
    series: [
      {
        name: "Frecuencia",
        type: "bar",
        barWidth: "72%",
        itemStyle: {
          borderRadius: [5, 5, 0, 0]
        },
        data: bins.map((bin) => ({
          value: bin.count,
          start: Number(bin.start.toFixed(2)),
          end: Number(bin.end.toFixed(2)),
          itemStyle: {
            color: bin.start >= mooringRadiusM
              ? "#d95d39"
              : bin.end > warningThresholdM
                ? "#e9b949"
                : "#3fa36a"
          }
        })),
        markArea: riskBandAreas.length
          ? {
            silent: true,
            z: -1,
            label: {
              show: false
            },
            data: riskBandAreas
          }
          : undefined,
        markLine: {
          symbol: "none",
          lineStyle: {
            color: "#cc5b2e",
            type: "dashed",
            width: 2
          },
          label: {
            color: "#9d421e",
            formatter: `Radio objetivo ${formatMetricValue(mooringRadiusM, 1)} m`
          },
          data: [
            {
              xAxis: categoryLabels[radiusMarkIndex]
            }
          ]
        }
      }
    ]
  };
}

function gpsExceedanceCurveOption(focusBuoy, focusTelemetry) {
  const points = focusTelemetry?.points || [];
  if (!focusBuoy || points.length === 0) {
    return null;
  }

  const driftValues = points.map((point) => Math.max(0, Number(point.driftRadiusM) || 0));
  const mooringRadiusM = Math.max(1, Number(focusBuoy.mooringRadiusM) || 1);
  const maxDriftM = Math.max(mooringRadiusM * 1.35, ...driftValues, 1);
  const sampleCount = driftValues.length;
  const steps = clamp(Math.round(sampleCount / 2.2), 16, 30);
  const thresholdStep = maxDriftM / (steps - 1);

  const curveData = Array.from({ length: steps }, (_, index) => {
    const threshold = index * thresholdStep;
    const exceedCount = driftValues.filter((value) => value > threshold).length;
    const exceedPct = sampleCount > 0 ? (exceedCount / sampleCount) * 100 : 0;

    return [Number(threshold.toFixed(2)), Number(exceedPct.toFixed(2))];
  });

  const exceedAtRadiusCount = driftValues.filter((value) => value > mooringRadiusM).length;
  const exceedAtRadiusPct = sampleCount > 0 ? (exceedAtRadiusCount / sampleCount) * 100 : 0;

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross"
      },
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#bfd3e8",
      borderWidth: 1,
      textStyle: {
        color: "#1c3552"
      },
      formatter: (params) => {
        const item = params?.[0];
        if (!item || !Array.isArray(item.value)) {
          return "-";
        }

        const [threshold, exceedPct] = item.value;
        return `Umbral: ${formatMetricValue(threshold, 1)} m<br/>Excedencia: ${formatMetricValue(exceedPct, 1)}%`;
      }
    },
    grid: {
      top: 28,
      right: 18,
      bottom: 48,
      left: 66
    },
    xAxis: {
      type: "value",
      min: 0,
      max: Number(maxDriftM.toFixed(2)),
      name: "Umbral de deriva (m)",
      nameTextStyle: {
        color: "#4d6788"
      },
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788",
        formatter: (value) => formatMetricValue(value, 0)
      },
      splitLine: {
        lineStyle: {
          color: "rgba(146, 169, 194, 0.28)",
          type: "dashed"
        }
      }
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      name: "Excedencia (%)",
      nameTextStyle: {
        color: "#4d6788"
      },
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.52)"
        }
      },
      axisLabel: {
        color: "#4d6788",
        formatter: (value) => `${formatMetricValue(value, 0)}%`
      },
      splitLine: {
        lineStyle: {
          color: "rgba(146, 169, 194, 0.28)",
          type: "dashed"
        }
      }
    },
    series: [
      {
        name: "Excedencia acumulada",
        type: "line",
        smooth: 0.2,
        showSymbol: false,
        lineStyle: {
          width: 2.4,
          color: "#2a9d8f"
        },
        areaStyle: {
          color: "rgba(42, 157, 143, 0.2)"
        },
        data: curveData,
        markLine: {
          symbol: "none",
          lineStyle: {
            color: "#cc5b2e",
            type: "dashed",
            width: 2
          },
          label: {
            color: "#9d421e",
            formatter: `Radio ${formatMetricValue(mooringRadiusM, 1)} m`
          },
          data: [
            {
              xAxis: Number(mooringRadiusM.toFixed(2))
            }
          ]
        },
        markPoint: {
          symbolSize: 38,
          itemStyle: {
            color: "#f08c4d"
          },
          label: {
            color: "#fff",
            formatter: `${formatMetricValue(exceedAtRadiusPct, 1)}%`
          },
          data: [
            {
              coord: [Number(mooringRadiusM.toFixed(2)), Number(exceedAtRadiusPct.toFixed(2))],
              name: "Fuera de radio"
            }
          ]
        }
      }
    ]
  };
}

function buildGpsTrajectoryStats(focusBuoy, focusTelemetry) {
  const points = focusTelemetry?.points || [];
  if (!focusBuoy || points.length === 0) {
    return null;
  }

  const mooringRadiusM = Number(focusBuoy.mooringRadiusM) || 0;
  const warningRatio = clamp(Number(focusBuoy.driftWarningRatio) || DRIFT_WARNING_RATIO, 0.6, 0.98);
  const warningThresholdM = mooringRadiusM * warningRatio;
  const driftValues = points.map((point) => Number(point.driftRadiusM) || 0);
  const latestDriftM = driftValues[driftValues.length - 1] || 0;
  const maxDriftM = driftValues.length ? Math.max(...driftValues) : 0;
  const avgDriftM = driftValues.length
    ? driftValues.reduce((acc, value) => acc + value, 0) / driftValues.length
    : 0;

  let trackDistanceM = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    trackDistanceM += haversineDistanceMeters(
      previous.gpsLat,
      previous.gpsLon,
      current.gpsLat,
      current.gpsLon
    );
  }

  const outOfRadiusSamples = points.filter(
    (point) => (Number(point.driftRadiusM) || 0) > mooringRadiusM
  ).length;

  const outOfRadiusPct = points.length > 0
    ? (outOfRadiusSamples / points.length) * 100
    : 0;

  let headingDeg = 0;
  if (points.length >= 2) {
    const previous = points[points.length - 2];
    const current = points[points.length - 1];
    headingDeg = bearingBetweenPoints(previous.gpsLat, previous.gpsLon, current.gpsLat, current.gpsLon);
  }

  return {
    anchorLat: Number(focusBuoy.anchorLat) || 0,
    anchorLon: Number(focusBuoy.anchorLon) || 0,
    mooringRadiusM,
    warningThresholdM,
    latestDriftM,
    maxDriftM,
    avgDriftM,
    trackDistanceM,
    avgDriftSpeedMph: points.length > 1 ? trackDistanceM / (points.length - 1) : 0,
    outOfRadiusSamples,
    outOfRadiusPct,
    headingDeg,
    headingLabel: bearingToDirectionLabel(headingDeg),
    maxRadiusUsagePct: mooringRadiusM > 0 ? (maxDriftM / mooringRadiusM) * 100 : 0
  };
}

export function BuoysPage() {
  const location = useLocation();
  const [selectedBuoyIds, setSelectedBuoyIds] = useState(() =>
    BUOY_CATALOG.slice(0, 2).map((buoy) => buoy.id)
  );
  const [windowHours, setWindowHours] = useState("48");
  const [focusBuoyId, setFocusBuoyId] = useState(BUOY_CATALOG[0]?.id || "");
  const [trajectoryCursorIndex, setTrajectoryCursorIndex] = useState(0);

  const activeSection = useMemo(() => {
    if (location.pathname.includes("/boyas/energia-sistema")) {
      return "energia";
    }

    if (location.pathname.includes("/boyas/recorrido-gps")) {
      return "trayectoria";
    }

    if (location.pathname.includes("/boyas/corrientes-heatmap")) {
      return "corrientes";
    }

    if (location.pathname.includes("/boyas/rosa-vientos")) {
      return "vientos";
    }

    return "parametros";
  }, [location.pathname]);

  const selectedBuoys = useMemo(
    () => BUOY_CATALOG.filter((buoy) => selectedBuoyIds.includes(buoy.id)),
    [selectedBuoyIds]
  );

  useEffect(() => {
    if (!selectedBuoys.length) {
      const fallback = BUOY_CATALOG[0]?.id;
      if (fallback) {
        setSelectedBuoyIds([fallback]);
        setFocusBuoyId(fallback);
      }
      return;
    }

    if (!selectedBuoys.some((buoy) => buoy.id === focusBuoyId)) {
      setFocusBuoyId(selectedBuoys[0].id);
    }
  }, [selectedBuoys, focusBuoyId]);

  const safeWindowHours = useMemo(
    () => clamp(Math.round(Number(windowHours) || 48), 24, 96),
    [windowHours]
  );

  const telemetryByBuoy = useMemo(() => {
    return new Map(
      selectedBuoys.map((buoy) => {
        const telemetry = buildTelemetryForBuoy(buoy, safeWindowHours);
        return [buoy.id, telemetry];
      })
    );
  }, [selectedBuoys, safeWindowHours]);

  const telemetryRows = useMemo(() => Array.from(telemetryByBuoy.values()), [telemetryByBuoy]);

  const focusBuoy = useMemo(
    () => selectedBuoys.find((buoy) => buoy.id === focusBuoyId) || selectedBuoys[0] || null,
    [selectedBuoys, focusBuoyId]
  );

  const focusTelemetry = useMemo(
    () => (focusBuoy ? telemetryByBuoy.get(focusBuoy.id) || null : null),
    [focusBuoy, telemetryByBuoy]
  );

  const maxTrajectoryIndex = Math.max(0, (focusTelemetry?.points?.length || 1) - 1);

  const safeTrajectoryCursorIndex = useMemo(
    () => clamp(Math.round(Number(trajectoryCursorIndex) || 0), 0, maxTrajectoryIndex),
    [trajectoryCursorIndex, maxTrajectoryIndex]
  );

  const trajectoryCursorPoint = useMemo(() => {
    const points = focusTelemetry?.points || [];
    return points[safeTrajectoryCursorIndex] || null;
  }, [focusTelemetry, safeTrajectoryCursorIndex]);

  const trajectoryStartPoint = focusTelemetry?.points?.[0] || null;
  const trajectoryEndPoint = focusTelemetry?.points?.[maxTrajectoryIndex] || null;

  useEffect(() => {
    setTrajectoryCursorIndex(maxTrajectoryIndex);
  }, [focusBuoy?.id, maxTrajectoryIndex]);

  const metricCharts = useMemo(() => {
    return [
      {
        id: "oxygen",
        title: "Oxigeno disuelto",
        unit: "mg/L",
        description: "Comparativa horaria entre boyas seleccionadas.",
        option: metricChartOption({
          field: "oxygen",
          unit: "mg/L",
          selectedBuoys,
          telemetryByBuoy
        })
      },
      {
        id: "temperature",
        title: "Temperatura",
        unit: "C",
        description: "Oscilacion termica en la ventana configurada.",
        option: metricChartOption({
          field: "temperature",
          unit: "C",
          selectedBuoys,
          telemetryByBuoy
        })
      },
      {
        id: "waveHeight",
        title: "Oleaje",
        unit: "m",
        description: "Altura significativa de ola por boya.",
        option: metricChartOption({
          field: "waveHeight",
          unit: "m",
          selectedBuoys,
          telemetryByBuoy
        })
      }
    ];
  }, [selectedBuoys, telemetryByBuoy]);

  const currentsOption = useMemo(
    () => (focusTelemetry ? currentsHeatmapOption(focusTelemetry) : null),
    [focusTelemetry]
  );

  const currentsStats = useMemo(() => {
    if (!focusTelemetry) {
      return null;
    }

    const values = [];
    for (const point of focusTelemetry.points) {
      for (const value of point.currentsByDepth || []) {
        values.push(Number(value));
      }
    }

    const latestPoint = focusTelemetry.points.at(-1) || null;
    const avg = values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;

    return {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      avg,
      surface: latestPoint ? Number(latestPoint.currentsByDepth[0]) : 0,
      bottom: latestPoint
        ? Number(latestPoint.currentsByDepth[latestPoint.currentsByDepth.length - 1])
        : 0
    };
  }, [focusTelemetry]);

  const windState = useMemo(() => aggregateWindData(telemetryRows), [telemetryRows]);

  const windChartOption = useMemo(
    () => windRoseOption(windState.roseData),
    [windState.roseData]
  );

  const trajectoryChartOption = useMemo(
    () => gpsTrajectoryOption(focusBuoy, focusTelemetry, safeTrajectoryCursorIndex),
    [focusBuoy, focusTelemetry, safeTrajectoryCursorIndex]
  );

  const energyChartOption = useMemo(
    () => buoyEnergyOption(focusTelemetry),
    [focusTelemetry]
  );

  const driftHistogramChartOption = useMemo(
    () => gpsDriftHistogramOption(focusBuoy, focusTelemetry),
    [focusBuoy, focusTelemetry]
  );

  const driftExceedanceChartOption = useMemo(
    () => gpsExceedanceCurveOption(focusBuoy, focusTelemetry),
    [focusBuoy, focusTelemetry]
  );

  const gpsStats = useMemo(
    () => buildGpsTrajectoryStats(focusBuoy, focusTelemetry),
    [focusBuoy, focusTelemetry]
  );

  const energyStats = useMemo(
    () => buildBuoyEnergyStats(focusBuoy, focusTelemetry),
    [focusBuoy, focusTelemetry]
  );

  function toggleBuoySelection(buoyId) {
    setSelectedBuoyIds((current) => {
      const alreadySelected = current.includes(buoyId);

      if (alreadySelected) {
        if (current.length === 1) {
          return current;
        }

        return current.filter((id) => id !== buoyId);
      }

      return [...current, buoyId];
    });
  }

  const sectionTitle =
    activeSection === "energia"
      ? "Energía y autonomía"
      : activeSection === "trayectoria"
      ? "Recorrido GPS"
      : activeSection === "corrientes"
      ? "Corrientes marinas"
      : activeSection === "vientos"
        ? "Rosa de los vientos"
        : "Parametros oceanograficos";

  const sectionSubtitle =
    activeSection === "energia"
      ? "Balance entre paneles solares, consumo de sistema y autonomía esperada de la boya de foco."
      : activeSection === "trayectoria"
      ? "Trayectoria de la boya sobre el punto de fondeo para detectar derivas anómalas."
      : activeSection === "corrientes"
      ? "Heatmap de corrientes en la columna de agua para la boya de foco."
      : activeSection === "vientos"
        ? "Distribucion de direccion y frecuencia del viento agregada para boyas activas."
        : "Series temporales de oxigeno disuelto, temperatura y oleaje para multiples boyas.";

  const energyStatusClassName =
    energyStats?.statusLevel === "critico"
      ? "buoys-energy-status-critico"
      : energyStats?.statusLevel === "alerta"
      ? "buoys-energy-status-alerta"
      : "buoys-energy-status-nominal";

  const energyStatusLabel =
    energyStats?.statusLevel === "critico"
      ? "Estado energético: crítico"
      : energyStats?.statusLevel === "alerta"
      ? "Estado energético: alerta"
      : "Estado energético: nominal";

  return (
    <section className="buoys-page">
      <article className="panel">
        <h3>{sectionTitle}</h3>
        <p className="buoys-intro">{sectionSubtitle}</p>

        <div className="filters-inline buoys-toolbar">
          <div>
            <label htmlFor="buoysWindowSelect">Ventana temporal</label>
            <select
              id="buoysWindowSelect"
              value={windowHours}
              onChange={(event) => setWindowHours(event.target.value)}
            >
              <option value="24">24 horas</option>
              <option value="48">48 horas</option>
              <option value="72">72 horas</option>
              <option value="96">96 horas</option>
            </select>
          </div>

          <div>
            <label htmlFor="buoysFocusSelect">Boya de foco</label>
            <select
              id="buoysFocusSelect"
              value={focusBuoy?.id || ""}
              onChange={(event) => setFocusBuoyId(event.target.value)}
            >
              {selectedBuoys.map((buoy) => (
                <option key={buoy.id} value={buoy.id}>
                  {buoy.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="buoys-selector-grid">
          {BUOY_CATALOG.map((buoy) => {
            const isSelected = selectedBuoyIds.includes(buoy.id);
            const mustStaySelected = isSelected && selectedBuoyIds.length === 1;

            return (
              <label
                key={buoy.id}
                className={`buoy-selector ${isSelected ? "buoy-selector-active" : ""}`.trim()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={mustStaySelected}
                  onChange={() => toggleBuoySelection(buoy.id)}
                />
                <span className="buoy-selector-content">
                  <strong>{buoy.name}</strong>
                  <span className="buoy-selector-meta">
                    {buoy.zone} · Columna {buoy.depthM} m
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <p className="buoys-caption">
          Boyas activas para este cliente: <strong>{selectedBuoys.length}</strong>
        </p>
      </article>

      {activeSection === "parametros" ? (
        <div className="buoys-chart-grid">
          {metricCharts.map((chart) => (
            <article key={chart.id} className="panel buoys-chart-panel">
              <h3>
                {chart.title} ({chart.unit})
              </h3>
              <p>{chart.description}</p>
              <ReactECharts option={chart.option} style={{ height: 290 }} />
            </article>
          ))}
        </div>
      ) : null}

      {activeSection === "energia" ? (
        <article className="panel buoys-detail-panel">
          <h3>
            Energía solar y consumo · {focusBuoy?.name || "-"}
          </h3>
          <p>
            Seguimiento del aporte de paneles solares frente al consumo total de la boya para estimar
            autonomía y detectar degradación temprana del sistema eléctrico.
          </p>

          {energyChartOption ? (
            <ReactECharts option={energyChartOption} style={{ height: 420 }} />
          ) : (
            <p className="buoys-empty">Selecciona al menos una boya para ver el balance energético.</p>
          )}

          <div className="buoys-energy-header">
            <p className="buoys-energy-note">
              Reserva recomendada: {formatMetricValue(focusBuoy?.reserveSocPct, 0)}% de batería para
              contingencias de noche y mala meteorología.
            </p>
            <span className={`buoys-energy-status ${energyStatusClassName}`.trim()}>{energyStatusLabel}</span>
          </div>

          <div className="buoys-kpi-grid buoys-kpi-grid-energy">
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Generación solar actual</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.latestGenerationW, 0)} W</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Consumo actual sistema</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.latestConsumptionW, 0)} W</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Balance neto actual</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.latestNetW, 0)} W</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Cobertura solar instantánea</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.coveragePct, 1)} %</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Autonomía esperada</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.autonomyHours, 1)} h</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">SOC batería</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.latestSocPct, 1)} %</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Tensión batería</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.batteryVoltageV, 2)} V</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Temperatura electrónica</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.controllerTempC, 1)} °C</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Calidad de enlace</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.linkQualityPct, 1)} %</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Salud estimada de batería</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.batteryHealthPct, 1)} %</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Tendencia energética (8h)</span>
              <span className="buoys-kpi-value">{energyStats?.trendLabel || "-"}</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Generación media</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.avgGenerationW, 0)} W</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Consumo medio</span>
              <span className="buoys-kpi-value">{formatMetricValue(energyStats?.avgConsumptionW, 0)} W</span>
            </div>
          </div>
        </article>
      ) : null}

      {activeSection === "trayectoria" ? (
        <article className="panel buoys-detail-panel">
          <h3>
            Recorrido GPS y deriva · {focusBuoy?.name || "-"}
          </h3>
          <p>
            El trazado muestra la deriva histórica de la boya respecto a su fondeo. En condiciones
            normales la variación debería mantenerse en un radio corto.
          </p>

          {trajectoryChartOption ? (
            <>
              <ReactECharts option={trajectoryChartOption} style={{ height: 440 }} />

              <div className="buoys-timebar">
                <div className="buoys-timebar-header">
                  <span className="buoys-timebar-label">Barra temporal del recorrido</span>
                  <span className="buoys-timebar-current">{formatTimelineLabel(trajectoryCursorPoint)}</span>
                  <button
                    type="button"
                    className="buoys-timebar-live"
                    onClick={() => setTrajectoryCursorIndex(maxTrajectoryIndex)}
                    disabled={safeTrajectoryCursorIndex >= maxTrajectoryIndex}
                  >
                    Ir a posicion actual
                  </button>
                </div>

                <input
                  type="range"
                  min={0}
                  max={maxTrajectoryIndex}
                  step={1}
                  value={safeTrajectoryCursorIndex}
                  onChange={(event) => setTrajectoryCursorIndex(Number(event.target.value))}
                  className="buoys-timebar-slider"
                  aria-label="Barra temporal de trayectoria GPS"
                />

                <div className="buoys-timebar-scale">
                  <span>{formatTimelineLabel(trajectoryStartPoint)}</span>
                  <span>Paso {safeTrajectoryCursorIndex + 1} / {maxTrajectoryIndex + 1}</span>
                  <span>{formatTimelineLabel(trajectoryEndPoint)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="buoys-empty">Selecciona al menos una boya para ver su trayectoria.</p>
          )}

          <p className="buoys-trajectory-note">
            Punto de fondeo: Lat {formatMetricValue(gpsStats?.anchorLat, 5)} · Lon {formatMetricValue(gpsStats?.anchorLon, 5)}
          </p>

          <div className="buoys-analytics-grid">
            <article className="buoys-analytics-panel">
              <h4>Histograma de deriva</h4>
              <p>
                Distribución de frecuencia de la distancia al fondeo para identificar dispersión y
                acumulación en torno al radio objetivo.
              </p>

              {driftHistogramChartOption ? (
                <ReactECharts option={driftHistogramChartOption} style={{ height: 280 }} />
              ) : (
                <p className="buoys-empty">No hay muestras suficientes para generar el histograma.</p>
              )}

              <p className="buoys-band-note">
                <span className="buoys-band buoys-band-stable">
                  Estable: 0-{formatMetricValue(gpsStats?.warningThresholdM, 1)} m
                </span>
                <span className="buoys-band buoys-band-warning">
                  Cerca del límite: {formatMetricValue(gpsStats?.warningThresholdM, 1)}-{formatMetricValue(gpsStats?.mooringRadiusM, 1)} m
                </span>
                <span className="buoys-band buoys-band-danger">
                  Fuera de radio: {">"}{formatMetricValue(gpsStats?.mooringRadiusM, 1)} m
                </span>
              </p>
            </article>

            <article className="buoys-analytics-panel">
              <h4>Curva de excedencia</h4>
              <p>
                Porcentaje acumulado de muestras que superan cada umbral de deriva para evaluar la
                estabilidad del amarre.
              </p>

              {driftExceedanceChartOption ? (
                <ReactECharts option={driftExceedanceChartOption} style={{ height: 280 }} />
              ) : (
                <p className="buoys-empty">No hay datos suficientes para calcular excedencias.</p>
              )}
            </article>
          </div>

          <div className="buoys-kpi-grid">
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Radio objetivo</span>
              <span className="buoys-kpi-value">{formatMetricValue(gpsStats?.mooringRadiusM, 1)} m</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Deriva actual</span>
              <span className="buoys-kpi-value">{formatMetricValue(gpsStats?.latestDriftM, 1)} m</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Deriva maxima</span>
              <span className="buoys-kpi-value">{formatMetricValue(gpsStats?.maxDriftM, 1)} m</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Uso maximo del radio</span>
              <span className="buoys-kpi-value">{formatMetricValue(gpsStats?.maxRadiusUsagePct, 1)} %</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Distancia recorrida</span>
              <span className="buoys-kpi-value">{formatMetricValue(gpsStats?.trackDistanceM, 1)} m</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Velocidad media deriva</span>
              <span className="buoys-kpi-value">{formatMetricValue(gpsStats?.avgDriftSpeedMph, 2)} m/h</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Rumbo ultimo tramo</span>
              <span className="buoys-kpi-value">
                {gpsStats?.headingLabel || "-"} ({formatMetricValue(gpsStats?.headingDeg, 0)}°)
              </span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Muestras fuera de radio</span>
              <span className="buoys-kpi-value">
                {gpsStats?.outOfRadiusSamples ?? 0} ({formatMetricValue(gpsStats?.outOfRadiusPct, 1)}%)
              </span>
            </div>
          </div>
        </article>
      ) : null}

      {activeSection === "corrientes" ? (
        <article className="panel buoys-detail-panel">
          <h3>
            Corrientes en columna de agua · {focusBuoy?.name || "-"}
          </h3>
          <p>
            Perfil de velocidad por profundidad y hora. Se muestra la boya de foco para inspeccion
            puntual de capas superficiales y fondo.
          </p>

          {currentsOption ? (
            <ReactECharts option={currentsOption} style={{ height: 420 }} />
          ) : (
            <p className="buoys-empty">Selecciona al menos una boya para ver el heatmap.</p>
          )}

          <div className="buoys-kpi-grid">
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Corriente minima</span>
              <span className="buoys-kpi-value">{formatMetricValue(currentsStats?.min)} m/s</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Corriente media</span>
              <span className="buoys-kpi-value">{formatMetricValue(currentsStats?.avg)} m/s</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Superficie actual</span>
              <span className="buoys-kpi-value">{formatMetricValue(currentsStats?.surface)} m/s</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Fondo actual</span>
              <span className="buoys-kpi-value">{formatMetricValue(currentsStats?.bottom)} m/s</span>
            </div>
          </div>
        </article>
      ) : null}

      {activeSection === "vientos" ? (
        <article className="panel buoys-detail-panel">
          <h3>Rosa de los vientos multi-boya</h3>
          <p>
            Distribucion polar agregada de direccion del viento. La frecuencia se pondera por intensidad
            para resaltar eventos dominantes.
          </p>

          <ReactECharts option={windChartOption} style={{ height: 430 }} />

          <div className="buoys-kpi-grid">
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Direccion dominante</span>
              <span className="buoys-kpi-value">{windState.dominantDirection}</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Peso dominante</span>
              <span className="buoys-kpi-value">{formatMetricValue(windState.dominantPercent, 1)} %</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Velocidad media</span>
              <span className="buoys-kpi-value">{formatMetricValue(windState.avgWindSpeed)} kn</span>
            </div>
            <div className="buoys-kpi">
              <span className="buoys-kpi-label">Muestras</span>
              <span className="buoys-kpi-value">{windState.samples}</span>
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}
