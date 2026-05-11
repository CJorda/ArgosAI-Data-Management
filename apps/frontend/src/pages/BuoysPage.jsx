import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { useLocation } from "react-router-dom";
import "./BuoysPage.css";

const BUOY_CATALOG = [
  {
    id: "BOYA-NORTE-01",
    name: "Boya Norte 01",
    zone: "Ria de Vigo",
    depthM: 50
  },
  {
    id: "BOYA-NORTE-02",
    name: "Boya Norte 02",
    zone: "Ria de Arousa",
    depthM: 45
  },
  {
    id: "BOYA-SUR-01",
    name: "Boya Sur 01",
    zone: "Costa de Huelva",
    depthM: 38
  },
  {
    id: "BOYA-ESTE-01",
    name: "Boya Este 01",
    zone: "Mar Menor",
    depthM: 32
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

    return {
      timestamp,
      axisLabel: formatAxisLabel(timestamp),
      hourLabel: formatHourLabel(timestamp),
      oxygen: Number(oxygen.toFixed(3)),
      temperature: Number(temperature.toFixed(3)),
      waveHeight: Number(waveHeight.toFixed(3)),
      currentsByDepth,
      windSpeed: Number(windSpeed.toFixed(3)),
      windDirection: Number(windDirection.toFixed(2))
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

export function BuoysPage() {
  const location = useLocation();
  const [selectedBuoyIds, setSelectedBuoyIds] = useState(() =>
    BUOY_CATALOG.slice(0, 2).map((buoy) => buoy.id)
  );
  const [windowHours, setWindowHours] = useState("48");
  const [focusBuoyId, setFocusBuoyId] = useState(BUOY_CATALOG[0]?.id || "");

  const activeSection = useMemo(() => {
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
    activeSection === "corrientes"
      ? "Corrientes marinas"
      : activeSection === "vientos"
        ? "Rosa de los vientos"
        : "Parametros oceanograficos";

  const sectionSubtitle =
    activeSection === "corrientes"
      ? "Heatmap de corrientes en la columna de agua para la boya de foco."
      : activeSection === "vientos"
        ? "Distribucion de direccion y frecuencia del viento agregada para boyas activas."
        : "Series temporales de oxigeno disuelto, temperatura y oleaje para multiples boyas.";

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
