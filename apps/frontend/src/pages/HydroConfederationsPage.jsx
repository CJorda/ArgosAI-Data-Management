import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import {
  hydroConfederationCaptureRequest,
  hydroConfederationSourcesRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./HydroConfederationsPage.css";

const yesaStations = [
  {
    code: "A101",
    name: "Rio Aragon Pie de Presa Yesa"
  },
  {
    code: "E029",
    name: "Embalse de Yesa"
  },
  {
    code: "EM29",
    name: "Estacion Meteorologica de Yesa"
  }
];

const yesaVariableDefinitions = [
  {
    key: "a101_level_downstream",
    sourceCode: "A101",
    label: "NIVEL ARAGON A.ABAJO E.YESA",
    shortLabel: "Nivel Aragon abajo",
    unit: "m",
    color: "#1d4ed8"
  },
  {
    key: "a101_flow_downstream",
    sourceCode: "A101",
    label: "CAUDAL ARAGON A.ABAJO E.YESA",
    shortLabel: "Caudal Aragon abajo",
    unit: "m3/s",
    color: "#dc2626"
  },
  {
    key: "e029_reservoir_level",
    sourceCode: "E029",
    label: "NIVEL EMBALSE YESA",
    shortLabel: "Nivel embalse",
    unit: "m",
    color: "#7e22ce"
  },
  {
    key: "e029_bardenas_flow",
    sourceCode: "E029",
    label: "CAUDAL ORIGEN BARDENAS",
    shortLabel: "Caudal Bardenas",
    unit: "m3/s",
    color: "#0891b2"
  },
  {
    key: "e029_inflow_4h",
    sourceCode: "E029",
    label: "Q ENTRADA EMBALSE YESA (PROM.4H)",
    shortLabel: "Q entrada prom 4h",
    unit: "m3/s",
    color: "#8b5a2b"
  },
  {
    key: "e029_reservoir_volume_pct",
    sourceCode: "E029",
    label: "% VOLUMEN EMBALSE YESA",
    shortLabel: "% volumen embalse",
    unit: "%",
    color: "#16a34a"
  },
  {
    key: "e029_reservoir_volume",
    sourceCode: "E029",
    label: "VOLUMEN EMBALSE YESA",
    shortLabel: "Volumen embalse",
    unit: "hm3",
    color: "#ea580c"
  },
  {
    key: "em29_air_temperature",
    sourceCode: "EM29",
    label: "TEMPERATURA AMB. YESA",
    shortLabel: "Temp. ambiente",
    unit: "C",
    color: "#6b7280"
  },
  {
    key: "em29_relative_humidity",
    sourceCode: "EM29",
    label: "HUMEDAD RELAT. AIRE YESA",
    shortLabel: "Humedad relativa",
    unit: "%",
    color: "#6b7280"
  },
  {
    key: "em29_wind_speed",
    sourceCode: "EM29",
    label: "VELOCIDAD VIENTO YESA",
    shortLabel: "Velocidad viento",
    unit: "km/h",
    color: "#6b7280"
  },
  {
    key: "em29_solar_radiation",
    sourceCode: "EM29",
    label: "RADIACION SOLAR YESA",
    shortLabel: "Radiacion solar",
    unit: "W/m2",
    color: "#6b7280"
  },
  {
    key: "em29_wind_direction",
    sourceCode: "EM29",
    label: "DIRECCION VIENTO YESA",
    shortLabel: "Direccion viento",
    unit: "deg",
    color: "#6b7280"
  },
  {
    key: "em29_insolation_accum",
    sourceCode: "EM29",
    label: "INSOLACION ACUM. QM. YESA",
    shortLabel: "Insolacion acum.",
    unit: "h",
    color: "#6b7280"
  },
  {
    key: "em29_wind_gust",
    sourceCode: "EM29",
    label: "VELOC. RACHA VIENTO YESA",
    shortLabel: "Racha viento",
    unit: "km/h",
    color: "#6b7280"
  },
  {
    key: "em29_sea_level_pressure",
    sourceCode: "EM29",
    label: "PRESION NIVEL DEL MAR EN YESA",
    shortLabel: "Presion NMM",
    unit: "hPa",
    color: "#6b7280"
  },
  {
    key: "em29_precip_24h",
    sourceCode: "EM29",
    label: "PRECIP. 24H. EMA YESA (BT)",
    shortLabel: "Precip 24h",
    unit: "mm",
    color: "#6b7280"
  },
  {
    key: "em29_precip_day_accum",
    sourceCode: "EM29",
    label: "PRECIP. ACUM DIA EMA YESA (BT)",
    shortLabel: "Precip acum dia",
    unit: "mm",
    color: "#6b7280"
  },
  {
    key: "em29_precip_qm",
    sourceCode: "EM29",
    label: "PRECIP. QM EMA YESA (BT)",
    shortLabel: "Precip QM",
    unit: "mm",
    color: "#6b7280"
  }
];

const defaultYesaSelection = yesaVariableDefinitions.slice(0, 8).map((item) => item.key);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function oscillate(base, index, amplitude = 0.04, phase = 0) {
  return (
    base
    * (1
      + Math.sin(index / 3 + phase) * amplitude
      + Math.cos(index / 5 + phase * 0.7) * amplitude * 0.45)
  );
}

function variableValueAtStep(key, index, base) {
  switch (key) {
    case "a101_level_downstream":
      return oscillate(base, index, 0.006, 0.3) + Math.sin(index / 2.8) * 0.1;
    case "a101_flow_downstream":
      return oscillate(base, index, 0.09, 0.8);
    case "e029_reservoir_level":
      return oscillate(base, index, 0.003, 0.2);
    case "e029_bardenas_flow":
      return oscillate(base, index, 0.08, 1.3);
    case "e029_inflow_4h":
      return oscillate(base, index, 0.06, 1.9);
    case "e029_reservoir_volume_pct":
      return clamp(oscillate(base, index, 0.012, 0.5), 0, 100);
    case "e029_reservoir_volume":
      return oscillate(base, index, 0.02, 1.2);
    case "em29_air_temperature":
      return oscillate(base, index, 0.05, 0.5);
    case "em29_relative_humidity":
      return clamp(oscillate(base, index, 0.08, 1.1), 0, 100);
    case "em29_wind_speed":
      return Math.max(0, oscillate(base, index, 0.18, 1.9));
    case "em29_solar_radiation":
      return Math.max(0, oscillate(base, index, 0.35, 0.7));
    case "em29_wind_direction": {
      const value = base + Math.sin(index / 2.7) * 42 + Math.cos(index / 4.1) * 19;
      return (value % 360 + 360) % 360;
    }
    case "em29_insolation_accum":
      return Math.max(0, base + index * 0.11 + Math.sin(index / 3.5) * 0.18);
    case "em29_wind_gust":
      return Math.max(0, oscillate(base, index, 0.2, 2.1));
    case "em29_sea_level_pressure":
      return oscillate(base, index, 0.004, 0.4);
    case "em29_precip_24h":
      return Math.max(0, base + Math.sin(index / 3.1 + 0.7) * 0.85);
    case "em29_precip_day_accum":
      return Math.max(0, base + (index % 12) * 0.09 + Math.sin(index / 2.9) * 0.2);
    case "em29_precip_qm":
      return Math.max(0, base + Math.sin(index / 3.4 + 1.1) * 0.06);
    default:
      return oscillate(base, index, 0.03, 0.2);
  }
}

function buildYesaTimeline(snapshot) {
  const capturedAt = snapshot?.capturedAt ? new Date(snapshot.capturedAt) : new Date();
  const points = 18;
  const labels = Array.from({ length: points }, (_item, index) => {
    const timestamp = new Date(capturedAt.getTime() - (points - 1 - index) * 20 * 60 * 1000);
    return timestamp.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  });

  const flowBase = Number.isFinite(Number(snapshot?.kpis?.riverFlowM3s))
    ? Number(snapshot.kpis.riverFlowM3s)
    : 74;
  const reservoirPctBase = Number.isFinite(Number(snapshot?.kpis?.reservoirLevelPct))
    ? Number(snapshot.kpis.reservoirLevelPct)
    : 64;
  const rainBase = Number.isFinite(Number(snapshot?.kpis?.rain24hMm))
    ? Number(snapshot.kpis.rain24hMm)
    : 1.5;
  const temperatureBase = Number.isFinite(Number(snapshot?.kpis?.airTemperatureC))
    ? Number(snapshot.kpis.airTemperatureC)
    : 14.4;

  const baseByKey = {
    a101_level_downstream: 488 + reservoirPctBase * 0.07,
    a101_flow_downstream: flowBase,
    e029_reservoir_level: 489 + reservoirPctBase * 0.09,
    e029_bardenas_flow: flowBase * 0.58,
    e029_inflow_4h: flowBase * 0.86,
    e029_reservoir_volume_pct: reservoirPctBase,
    e029_reservoir_volume: reservoirPctBase * 4.7,
    em29_air_temperature: temperatureBase,
    em29_relative_humidity: clamp(58 + rainBase * 5.3, 20, 95),
    em29_wind_speed: 9.2,
    em29_solar_radiation: 360,
    em29_wind_direction: 202,
    em29_insolation_accum: 6.3,
    em29_wind_gust: 15.8,
    em29_sea_level_pressure: 1016,
    em29_precip_24h: Math.max(0.2, rainBase),
    em29_precip_day_accum: Math.max(0.1, rainBase * 0.63),
    em29_precip_qm: Math.max(0.01, rainBase * 0.11)
  };

  const valueByKey = {};
  const normalizedByKey = {};
  const latestByKey = {};

  for (const variable of yesaVariableDefinitions) {
    const rawValues = labels.map((_label, index) => variableValueAtStep(
      variable.key,
      index,
      Number(baseByKey[variable.key] || 1)
    ));
    const safeBaseline = Math.abs(rawValues[0]) > 0.0001 ? rawValues[0] : 1;

    valueByKey[variable.key] = rawValues.map((item) => Number(item.toFixed(3)));
    normalizedByKey[variable.key] = rawValues.map((item) => Number(((item / safeBaseline) * 100).toFixed(2)));
    latestByKey[variable.key] = Number(rawValues[rawValues.length - 1].toFixed(3));
  }

  return {
    labels,
    valueByKey,
    normalizedByKey,
    latestByKey
  };
}

function formatMetric(value, unit) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return `${numeric.toFixed(2)} ${unit}`.trim();
}

function formatTimestamp(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleString("es-ES");
}

export function HydroConfederationsPage() {
  const { accessToken } = useAuth();
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [endpointOverride, setEndpointOverride] = useState("");
  const [maxItems, setMaxItems] = useState("10");
  const [selectedYesaVariables, setSelectedYesaVariables] = useState(defaultYesaSelection);

  const sourcesQuery = useQuery({
    queryKey: ["hydro-confederations", "sources"],
    queryFn: () => hydroConfederationSourcesRequest(accessToken)
  });

  const sources = sourcesQuery.data?.sources || [];

  useEffect(() => {
    if (!selectedSourceId && sources.length > 0) {
      const firstSource = sources[0];
      setSelectedSourceId(firstSource.id);
      setEndpointOverride(firstSource.defaultEndpointUrl || "");
    }
  }, [sources, selectedSourceId]);

  const captureMutation = useMutation({
    mutationFn: (payload) => hydroConfederationCaptureRequest(accessToken, payload)
  });

  const selectedSource =
    sources.find((source) => source.id === selectedSourceId) || sources[0] || null;

  const runCapture = () => {
    if (!selectedSourceId) {
      return;
    }

    captureMutation.mutate({
      sourceId: selectedSourceId,
      endpointUrl: endpointOverride.trim() || undefined,
      maxItems: Number(maxItems) || 10
    });
  };

  const snapshot = captureMutation.data;
  const stations = snapshot?.stations || [];

  const yesaTimeline = useMemo(() => buildYesaTimeline(snapshot), [snapshot]);

  const selectedYesaDefinitions = useMemo(
    () => yesaVariableDefinitions.filter((item) => selectedYesaVariables.includes(item.key)),
    [selectedYesaVariables]
  );

  const yesaChartOption = useMemo(() => {
    return {
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) => `${Number(value).toFixed(2)} %`
      },
      legend: {
        type: "scroll",
        top: 0,
        textStyle: {
          color: "#3f5675",
          fontSize: 11
        }
      },
      grid: {
        top: 58,
        left: 52,
        right: 28,
        bottom: 42
      },
      xAxis: {
        type: "category",
        data: yesaTimeline.labels,
        axisLabel: {
          color: "#4d6484",
          fontSize: 11
        },
        axisLine: {
          lineStyle: {
            color: "#b7c7dd"
          }
        }
      },
      yAxis: {
        type: "value",
        name: "Indice relativo (%)",
        nameTextStyle: {
          color: "#4d6484",
          fontSize: 11
        },
        axisLabel: {
          color: "#4d6484",
          formatter: (value) => `${Number(value).toFixed(0)}%`
        },
        splitLine: {
          lineStyle: {
            color: "#e2e9f4"
          }
        }
      },
      series: selectedYesaDefinitions.map((definition, index) => ({
        name: `${definition.sourceCode} - ${definition.shortLabel}`,
        type: "line",
        smooth: 0.28,
        showSymbol: false,
        lineStyle: {
          width: 2,
          color: definition.color,
          type: definition.color === "#6b7280"
            ? index % 3 === 1
              ? "dashed"
              : index % 3 === 2
                ? "dotted"
                : "solid"
            : "solid"
        },
        itemStyle: {
          color: definition.color
        },
        emphasis: {
          focus: "series"
        },
        data: yesaTimeline.normalizedByKey[definition.key] || []
      }))
    };
  }, [selectedYesaDefinitions, yesaTimeline.labels, yesaTimeline.normalizedByKey]);

  const yesaLatestRows = useMemo(
    () =>
      yesaVariableDefinitions.map((definition) => ({
        ...definition,
        latestValue: yesaTimeline.latestByKey[definition.key]
      })),
    [yesaTimeline.latestByKey]
  );

  const toggleYesaVariable = (variableKey) => {
    setSelectedYesaVariables((current) => {
      if (current.includes(variableKey)) {
        if (current.length === 1) {
          return current;
        }

        return current.filter((item) => item !== variableKey);
      }

      return [...current, variableKey];
    });
  };

  return (
    <section className="hydro-page">
      <article className="panel hydro-intro-panel">
        <h3>Captura de datos de confederaciones hidrograficas</h3>
        <p className="hydro-intro-text">
          Conecta con fuentes como SAIH Ebro para capturar estado de estaciones, caudal de rio,
          niveles de embalse y datos meteorologicos proximos a planta.
        </p>

        <div className="hydro-controls">
          <label className="hydro-field">
            <span>Fuente</span>
            <select
              value={selectedSourceId}
              onChange={(event) => {
                const sourceId = event.target.value;
                setSelectedSourceId(sourceId);
                const source = sources.find((item) => item.id === sourceId);
                setEndpointOverride(source?.defaultEndpointUrl || "");
              }}
              disabled={sources.length === 0}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>

          <label className="hydro-field hydro-field-wide">
            <span>Endpoint API (opcional)</span>
            <input
              type="text"
              value={endpointOverride}
              onChange={(event) => setEndpointOverride(event.target.value)}
              placeholder="https://api-proveedor/estaciones"
            />
          </label>

          <label className="hydro-field">
            <span>Maximo estaciones</span>
            <input
              type="number"
              min={1}
              max={50}
              value={maxItems}
              onChange={(event) => setMaxItems(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="hydro-run-button"
            onClick={runCapture}
            disabled={!selectedSourceId || captureMutation.isPending}
          >
            {captureMutation.isPending ? "Capturando..." : "Capturar ahora"}
          </button>
        </div>

        <p className="hydro-source-note">
          {selectedSource
            ? `Fuente seleccionada: ${selectedSource.name}.`
            : "No hay fuentes configuradas."}
          {selectedSource?.homepageUrl ? ` Referencia: ${selectedSource.homepageUrl}` : ""}
        </p>

        <section className="hydro-yesa-panel">
          <div className="hydro-yesa-head">
            <h4>Grafica Yesa por variable (A101, E029, EM29)</h4>
            <span>
              {snapshot
                ? `Base: captura ${snapshot.mode === "live" ? "en vivo" : "demo"}`
                : "Base: simulacion yesa"}
            </span>
          </div>

          <p className="hydro-yesa-note">
            La grafica compara tendencias en indice relativo (100% = valor inicial de cada variable)
            para poder visualizar juntas magnitudes hidrologicas y meteorologicas.
          </p>

          <div className="hydro-station-tags">
            {yesaStations.map((station) => (
              <span key={station.code} className="hydro-station-chip">
                <strong>{station.code}</strong> {station.name}
              </span>
            ))}
          </div>

          <div className="hydro-variable-actions">
            <button
              type="button"
              className="hydro-chip-btn"
              onClick={() =>
                setSelectedYesaVariables(
                  yesaVariableDefinitions
                    .filter((item) => item.sourceCode !== "EM29")
                    .map((item) => item.key)
                )
              }
            >
              Solo hidraulicas
            </button>
            <button
              type="button"
              className="hydro-chip-btn"
              onClick={() =>
                setSelectedYesaVariables(
                  yesaVariableDefinitions
                    .filter((item) => item.sourceCode === "EM29")
                    .map((item) => item.key)
                )
              }
            >
              Solo meteorologicas
            </button>
            <button
              type="button"
              className="hydro-chip-btn"
              onClick={() => setSelectedYesaVariables(yesaVariableDefinitions.map((item) => item.key))}
            >
              Todas
            </button>
          </div>

          <div className="hydro-variable-picker">
            {yesaVariableDefinitions.map((definition) => {
              const checked = selectedYesaVariables.includes(definition.key);

              return (
                <label
                  key={definition.key}
                  className={`hydro-variable-chip ${checked ? "hydro-variable-chip-active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleYesaVariable(definition.key)}
                  />
                  <span
                    className="hydro-variable-color"
                    style={{ backgroundColor: definition.color }}
                    aria-hidden="true"
                  />
                  <span>{`${definition.sourceCode} - ${definition.shortLabel}`}</span>
                </label>
              );
            })}
          </div>

          <div className="hydro-chart-wrap">
            <ReactECharts option={yesaChartOption} style={{ height: 380, width: "100%" }} notMerge lazyUpdate />
          </div>

          <div className="hydro-table-wrap">
            <table className="hydro-table hydro-variable-table">
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Variable</th>
                  <th>Color</th>
                  <th>Ultimo valor aprox.</th>
                </tr>
              </thead>
              <tbody>
                {yesaLatestRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.sourceCode}</td>
                    <td>{row.label}</td>
                    <td>
                      <span
                        className="hydro-variable-color-chip"
                        style={{ backgroundColor: row.color }}
                      >
                        {row.color === "#6b7280" ? "Gris" : "Color"}
                      </span>
                    </td>
                    <td>{formatMetric(row.latestValue, row.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {captureMutation.isError ? (
          <p className="hydro-feedback hydro-feedback-error">
            {captureMutation.error instanceof Error
              ? captureMutation.error.message
              : "No se pudo capturar la informacion de la fuente."}
          </p>
        ) : null}

        {snapshot ? (
          <>
            <p className="hydro-feedback hydro-feedback-info">
              Captura {snapshot.mode === "live" ? "en vivo" : "demo"} realizada el {formatTimestamp(snapshot.capturedAt)}.
              {snapshot.warning ? ` Aviso: ${snapshot.warning}` : ""}
            </p>

            <div className="hydro-kpi-grid">
              <div className="hydro-kpi-card">
                <span>Caudal medio</span>
                <strong>{formatMetric(snapshot.kpis?.riverFlowM3s, "m3/s")}</strong>
              </div>
              <div className="hydro-kpi-card">
                <span>Nivel embalse medio</span>
                <strong>{formatMetric(snapshot.kpis?.reservoirLevelPct, "%")}</strong>
              </div>
              <div className="hydro-kpi-card">
                <span>Lluvia 24h media</span>
                <strong>{formatMetric(snapshot.kpis?.rain24hMm, "mm")}</strong>
              </div>
              <div className="hydro-kpi-card">
                <span>Temperatura media</span>
                <strong>{formatMetric(snapshot.kpis?.airTemperatureC, "C")}</strong>
              </div>
            </div>

            <div className="hydro-table-wrap">
              <table className="hydro-table">
                <thead>
                  <tr>
                    <th>Estacion</th>
                    <th>Caudal (m3/s)</th>
                    <th>Nivel embalse (%)</th>
                    <th>Lluvia 24h (mm)</th>
                    <th>Temperatura (C)</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map((station) => (
                    <tr key={`${station.stationId}-${station.recordedAt}`}>
                      <td>{station.stationName}</td>
                      <td>{formatMetric(station.riverFlowM3s, "")}</td>
                      <td>{formatMetric(station.reservoirLevelPct, "")}</td>
                      <td>{formatMetric(station.rain24hMm, "")}</td>
                      <td>{formatMetric(station.airTemperatureC, "")}</td>
                      <td>{formatTimestamp(station.recordedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="hydro-feedback hydro-feedback-muted">
            Ejecuta una captura para visualizar datos hidrologicos y meteorologicos.
          </p>
        )}
      </article>
    </section>
  );
}
