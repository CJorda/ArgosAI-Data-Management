import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import {
  resolveWaterFlowAlertRequest,
  updateWaterFlowConfigRequest,
  waterFlowOverviewRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./PlantWaterFlowPage.css";

const HOUR_WINDOWS = [24, 48, 72, 168];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = clamp((p / 100) * (sorted.length - 1), 0, sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) {
    return sorted[lower];
  }

  const ratio = position - lower;
  return sorted[lower] * (1 - ratio) + sorted[upper] * ratio;
}

function formatAxisTimestamp(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");

  return `${day}/${month}\n${hour}:00`;
}

function formatNumber(value, digits = 1) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return numeric.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function channelLabel(channelKey) {
  const normalized = String(channelKey || "").toLowerCase();

  if (normalized === "incoming") {
    return "Entrante";
  }

  if (normalized === "outgoing") {
    return "Saliente";
  }

  if (normalized === "recirculated") {
    return "Recirculacion";
  }

  return "Canal";
}

function flowTrendOption(series) {
  const labels = series.map((point) => point.axisLabel);

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross"
      }
    },
    legend: {
      top: 4,
      textStyle: {
        color: "#39597f"
      },
      data: ["Entrante calibrado", "Saliente calibrado", "Entrante medido"]
    },
    grid: {
      top: 54,
      right: 16,
      bottom: 42,
      left: 62
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: {
        color: "#506e92",
        interval: labels.length > 48 ? Math.ceil(labels.length / 24) : Math.ceil(labels.length / 18)
      },
      axisLine: {
        lineStyle: {
          color: "rgba(92, 121, 158, 0.45)"
        }
      }
    },
    yAxis: {
      type: "value",
      name: "m3/h",
      nameTextStyle: {
        color: "#506e92"
      },
      axisLabel: {
        color: "#506e92"
      },
      splitLine: {
        lineStyle: {
          color: "rgba(123, 149, 182, 0.26)",
          type: "dashed"
        }
      }
    },
    series: [
      {
        name: "Entrante calibrado",
        type: "line",
        smooth: 0.25,
        showSymbol: false,
        lineStyle: {
          color: "#1c79c0",
          width: 2.5
        },
        areaStyle: {
          color: "rgba(28, 121, 192, 0.15)"
        },
        data: series.map((point) => Number(point.incomingCalibrated.toFixed(2)))
      },
      {
        name: "Saliente calibrado",
        type: "line",
        smooth: 0.25,
        showSymbol: false,
        lineStyle: {
          color: "#ef7f4e",
          width: 2.3
        },
        data: series.map((point) => Number(point.outgoingCalibrated.toFixed(2)))
      },
      {
        name: "Entrante medido",
        type: "line",
        smooth: 0.18,
        showSymbol: false,
        lineStyle: {
          color: "#5ba15d",
          width: 1.6,
          type: "dashed"
        },
        data: series.map((point) => Number(point.incomingMeasured.toFixed(2)))
      }
    ]
  };
}

function balanceAndQualityOption(series) {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis"
    },
    legend: {
      top: 4,
      textStyle: {
        color: "#39597f"
      },
      data: ["Balance neto", "Recirculado", "Indice calidad descarga"]
    },
    grid: {
      top: 54,
      right: 54,
      bottom: 40,
      left: 62
    },
    xAxis: {
      type: "category",
      data: series.map((point) => point.axisLabel),
      axisLabel: {
        color: "#506e92",
        interval: series.length > 48 ? Math.ceil(series.length / 24) : Math.ceil(series.length / 18)
      },
      axisLine: {
        lineStyle: {
          color: "rgba(92, 121, 158, 0.45)"
        }
      }
    },
    yAxis: [
      {
        type: "value",
        name: "m3/h",
        nameTextStyle: {
          color: "#506e92"
        },
        axisLabel: {
          color: "#506e92"
        },
        splitLine: {
          lineStyle: {
            color: "rgba(123, 149, 182, 0.26)",
            type: "dashed"
          }
        }
      },
      {
        type: "value",
        min: 0,
        max: 100,
        name: "%",
        nameTextStyle: {
          color: "#506e92"
        },
        axisLabel: {
          color: "#506e92"
        },
        splitLine: {
          show: false
        }
      }
    ],
    series: [
      {
        name: "Balance neto",
        type: "bar",
        barMaxWidth: 16,
        itemStyle: {
          color: "#2167ad",
          borderRadius: [4, 4, 0, 0]
        },
        data: series.map((point) => Number(point.netPlantBalance.toFixed(2)))
      },
      {
        name: "Recirculado",
        type: "line",
        smooth: 0.25,
        showSymbol: false,
        lineStyle: {
          color: "#58a387",
          width: 2
        },
        data: series.map((point) => Number(point.recirculated.toFixed(2)))
      },
      {
        name: "Indice calidad descarga",
        type: "line",
        yAxisIndex: 1,
        smooth: 0.22,
        showSymbol: false,
        lineStyle: {
          color: "#8a63c9",
          width: 2.2
        },
        data: series.map((point) => Number(point.dischargeQualityIndex.toFixed(2)))
      }
    ]
  };
}

function annualConcessionOption(rows, annualConcessionM3) {
  const safeConcession = Math.max(1, Number(annualConcessionM3) || 1);

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis"
    },
    legend: {
      top: 4,
      textStyle: {
        color: "#39597f"
      },
      data: ["m3 entrantes/mes", "% concesion acumulada", "% objetivo lineal"]
    },
    grid: {
      top: 54,
      right: 56,
      bottom: 40,
      left: 66
    },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.monthLabel),
      axisLabel: {
        color: "#506e92"
      },
      axisLine: {
        lineStyle: {
          color: "rgba(92, 121, 158, 0.45)"
        }
      }
    },
    yAxis: [
      {
        type: "value",
        name: "m3/mes",
        nameTextStyle: {
          color: "#506e92"
        },
        axisLabel: {
          color: "#506e92",
          formatter: (value) => formatNumber(value, 0)
        },
        splitLine: {
          lineStyle: {
            color: "rgba(123, 149, 182, 0.26)",
            type: "dashed"
          }
        }
      },
      {
        type: "value",
        min: 0,
        max: Math.max(105, (rows[rows.length - 1]?.cumulativeIncoming / safeConcession) * 100 + 10),
        name: "% acumulado",
        nameTextStyle: {
          color: "#506e92"
        },
        axisLabel: {
          color: "#506e92",
          formatter: (value) => `${formatNumber(value, 0)}%`
        },
        splitLine: {
          show: false
        }
      }
    ],
    series: [
      {
        name: "m3 entrantes/mes",
        type: "bar",
        barMaxWidth: 18,
        itemStyle: {
          color: "#2f7fd1",
          borderRadius: [5, 5, 0, 0]
        },
        data: rows.map((row) => Number(row.incomingM3.toFixed(2)))
      },
      {
        name: "% concesion acumulada",
        type: "line",
        yAxisIndex: 1,
        smooth: 0.2,
        showSymbol: false,
        lineStyle: {
          color: "#e07b39",
          width: 2.4
        },
        data: rows.map((row) => Number(row.concessionUsedPct.toFixed(2)))
      },
      {
        name: "% objetivo lineal",
        type: "line",
        yAxisIndex: 1,
        smooth: false,
        showSymbol: false,
        lineStyle: {
          color: "#79879c",
          width: 1.8,
          type: "dashed"
        },
        data: rows.map((_row, index) => Number((((index + 1) / 12) * 100).toFixed(2)))
      }
    ]
  };
}

export function PlantWaterFlowPage() {
  const currentYear = new Date().getFullYear();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [windowHours, setWindowHours] = useState(72);
  const [annualConcessionDraft, setAnnualConcessionDraft] = useState(8_500_000);
  const [meterDraftById, setMeterDraftById] = useState({});
  const [selectedCalibrationMeterId, setSelectedCalibrationMeterId] = useState(null);
  const [isConfigDirty, setIsConfigDirty] = useState(false);
  const [manualReference, setManualReference] = useState("710");
  const [manualMeterReading, setManualMeterReading] = useState("675");

  const overviewQuery = useQuery({
    queryKey: ["water-flow", "overview", windowHours, selectedYear],
    queryFn: () =>
      waterFlowOverviewRequest(accessToken, {
        hours: windowHours,
        year: selectedYear
      }),
    enabled: Boolean(accessToken),
    refetchInterval: 30_000
  });

  useEffect(() => {
    const config = overviewQuery.data?.config;

    if (!config || isConfigDirty) {
      return;
    }

    const normalizedMeters = (config.meters || []).map((meter) => ({
      ...meter,
      id: Number(meter.id)
    }));

    setAnnualConcessionDraft(Number(config.annualConcessionM3 || 8_500_000));
    const mappedDrafts = Object.fromEntries(
      normalizedMeters.map((meter) => [meter.id, Number(meter.calibrationK || 1)])
    );
    setMeterDraftById(mappedDrafts);
    setSelectedCalibrationMeterId((current) => {
      if (current && normalizedMeters.some((meter) => meter.id === current)) {
        return current;
      }

      return normalizedMeters[0]?.id ?? null;
    });
  }, [overviewQuery.data?.config, isConfigDirty]);

  const installedMeters = useMemo(
    () =>
      (overviewQuery.data?.config?.meters || []).map((meter) => ({
        ...meter,
        id: Number(meter.id)
      })),
    [overviewQuery.data?.config?.meters]
  );

  const configuredMeters = useMemo(
    () =>
      installedMeters.map((meter) => ({
        ...meter,
        draftCalibrationK: Number(meterDraftById[meter.id] ?? meter.calibrationK ?? 1)
      })),
    [installedMeters, meterDraftById]
  );

  const selectedCalibrationMeter = useMemo(
    () =>
      configuredMeters.find((meter) => meter.id === selectedCalibrationMeterId)
      || configuredMeters[0]
      || null,
    [configuredMeters, selectedCalibrationMeterId]
  );

  const saveConfigMutation = useMutation({
    mutationFn: (payload) => updateWaterFlowConfigRequest(accessToken, payload),
    onSuccess: async (response) => {
      const config = response?.config;

      if (config) {
        setAnnualConcessionDraft(Number(config.annualConcessionM3 || 8_500_000));
        setMeterDraftById(
          Object.fromEntries(
            (config.meters || []).map((meter) => [Number(meter.id), Number(meter.calibrationK || 1)])
          )
        );
      }

      setIsConfigDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["water-flow", "overview"] });
      await overviewQuery.refetch();
    }
  });

  const resolveAlertMutation = useMutation({
    mutationFn: (alertId) => resolveWaterFlowAlertRequest(accessToken, alertId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["water-flow", "overview"] });
    }
  });

  const yearlyOptions = useMemo(
    () => [currentYear - 2, currentYear - 1, currentYear, currentYear + 1],
    [currentYear]
  );

  const hourlySeries = useMemo(() => {
    const rows = overviewQuery.data?.hourlySeries || [];

    return rows.map((point) => {
      const timestamp = new Date(point.timestamp);

      return {
        ...point,
        timestamp,
        axisLabel: formatAxisTimestamp(timestamp)
      };
    });
  }, [overviewQuery.data?.hourlySeries]);

  const yearlyRows = useMemo(() => overviewQuery.data?.yearlyRows || [], [overviewQuery.data?.yearlyRows]);

  const activeAlerts = useMemo(() => overviewQuery.data?.alerts || [], [overviewQuery.data?.alerts]);

  const latest = hourlySeries[hourlySeries.length - 1] || null;
  const annualConcessionM3 = Number(overviewQuery.data?.config?.annualConcessionM3 || annualConcessionDraft);

  const flowStats = useMemo(() => {
    if (hourlySeries.length === 0 || yearlyRows.length === 0) {
      return {
        incomingAverage: 0,
        outgoingAverage: 0,
        netAverage: 0,
        incomingP95: 0,
        outgoingP95: 0,
        dailyIncomingM3: 0,
        dailyOutgoingM3: 0,
        annualIncomingM3: 0,
        annualOutgoingM3: 0,
        remainingM3: annualConcessionM3,
        autonomyDays: 0,
        recirculationRatioPct: 0,
        dischargeQualityAvg: 0,
        concessionUsedPct: 0
      };
    }

    const incomingValues = hourlySeries.map((point) => point.incomingCalibrated);
    const outgoingValues = hourlySeries.map((point) => point.outgoingCalibrated);
    const netValues = hourlySeries.map((point) => point.netPlantBalance);

    const incomingAverage = incomingValues.reduce((acc, value) => acc + value, 0) / Math.max(1, incomingValues.length);
    const outgoingAverage = outgoingValues.reduce((acc, value) => acc + value, 0) / Math.max(1, outgoingValues.length);
    const netAverage = netValues.reduce((acc, value) => acc + value, 0) / Math.max(1, netValues.length);

    const dailyIncomingM3 = incomingAverage * 24;
    const dailyOutgoingM3 = outgoingAverage * 24;

    const annualIncomingM3 = yearlyRows.reduce((acc, row) => acc + row.incomingM3, 0);
    const annualOutgoingM3 = yearlyRows.reduce((acc, row) => acc + row.outgoingM3, 0);

    const remainingM3 = Number(annualConcessionM3) - annualIncomingM3;
    const autonomyDays = dailyIncomingM3 > 0 ? remainingM3 / dailyIncomingM3 : 0;

    return {
      incomingAverage,
      outgoingAverage,
      netAverage,
      incomingP95: percentile(incomingValues, 95),
      outgoingP95: percentile(outgoingValues, 95),
      dailyIncomingM3,
      dailyOutgoingM3,
      annualIncomingM3,
      annualOutgoingM3,
      remainingM3,
      autonomyDays,
      recirculationRatioPct: incomingAverage > 0
        ? (hourlySeries.reduce((acc, point) => acc + point.recirculated, 0) / Math.max(1, hourlySeries.length) / incomingAverage) * 100
        : 0,
      dischargeQualityAvg: hourlySeries.reduce((acc, point) => acc + point.dischargeQualityIndex, 0) / Math.max(1, hourlySeries.length),
      concessionUsedPct: Number(annualConcessionM3) > 0
        ? (annualIncomingM3 / Number(annualConcessionM3)) * 100
        : 0
    };
  }, [hourlySeries, yearlyRows, annualConcessionM3]);

  const recommendedK = useMemo(() => {
    const reference = Number(manualReference);
    const meter = Number(manualMeterReading);

    if (!Number.isFinite(reference) || !Number.isFinite(meter) || meter <= 0) {
      return null;
    }

    return Math.max(0, reference / meter);
  }, [manualReference, manualMeterReading]);

  const hasOverviewData = Boolean(overviewQuery.data);

  const saveConfig = () => {
    if (!isConfigDirty || saveConfigMutation.isPending) {
      return;
    }

    const meterPayload = configuredMeters.map((meter) => ({
      id: Number(meter.id),
      calibrationK: Math.max(0, Number(meter.draftCalibrationK) || 0),
      enabled: Boolean(meter.enabled)
    }));

    saveConfigMutation.mutate({
      annualConcessionM3: Math.max(10_000, Number(annualConcessionDraft) || 10_000),
      meters: meterPayload
    });
  };

  if (overviewQuery.isLoading && !hasOverviewData) {
    return (
      <section className="flow-page">
        <article className="panel">
          <h3>Caudal de agua a planta</h3>
          <p className="flow-intro">Cargando datos de caudal...</p>
        </article>
      </section>
    );
  }

  if (overviewQuery.isError && !hasOverviewData) {
    return (
      <section className="flow-page">
        <article className="panel">
          <h3>Caudal de agua a planta</h3>
          <p className="flow-error">No se pudieron cargar los datos de caudal. Intenta de nuevo en unos segundos.</p>
        </article>
      </section>
    );
  }

  return (
    <section className="flow-page">
      <article className="panel">
        <h3>Caudal de agua a planta</h3>
        <p className="flow-intro">
          Monitor de caudal entrante y saliente con calibracion por caudalimetro instalado (K), balance hidrico
          y control anual de concesion en m3.
        </p>

        {overviewQuery.data?.flags?.syntheticData ? (
          <p className="flow-warning">
            No hay lecturas reales recientes. Se muestra una serie estimada hasta recibir datos de campo.
          </p>
        ) : null}

        {overviewQuery.isError ? (
          <p className="flow-error">No se pudo refrescar la telemetria de caudal. Mostrando ultimo estado disponible.</p>
        ) : null}

        <div className="filters-inline flow-filters">
          <div>
            <label htmlFor="flow-window-hours">Ventana de analisis</label>
            <select
              id="flow-window-hours"
              value={windowHours}
              onChange={(event) => setWindowHours(Number(event.target.value))}
            >
              {HOUR_WINDOWS.map((hours) => (
                <option key={hours} value={hours}>{`${hours}h`}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="flow-year">Ano de concesion</label>
            <select
              id="flow-year"
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {yearlyOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="flow-concession">Concesion anual (m3)</label>
            <input
              id="flow-concession"
              type="number"
              min={10000}
              step={10000}
              value={annualConcessionDraft}
              onChange={(event) => {
                setAnnualConcessionDraft(Math.max(10_000, Number(event.target.value) || 10_000));
                setIsConfigDirty(true);
              }}
            />
          </div>

          <div className="flow-config-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={!isConfigDirty || saveConfigMutation.isPending}
              onClick={saveConfig}
            >
              {saveConfigMutation.isPending ? "Guardando..." : "Guardar configuracion"}
            </button>
            {saveConfigMutation.isError ? (
              <p className="flow-error">No se pudo guardar la configuracion.</p>
            ) : null}
          </div>

          <div className="flow-meter-editor">
            <label>K por caudalimetro</label>
            {configuredMeters.length === 0 ? (
              <p className="flow-chart-caption">No hay caudalimetros configurados.</p>
            ) : (
              <div className="flow-meter-grid">
                {configuredMeters.map((meter) => (
                  <div key={meter.id} className="flow-meter-row">
                    <span>{meter.label || `${channelLabel(meter.channelKey)} ${meter.deviceCode || ""}`.trim()}</span>
                    <input
                      type="number"
                      min={0}
                      step={0.001}
                      value={meter.draftCalibrationK}
                      onBlur={() => {
                        saveConfig();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveConfig();
                        }
                      }}
                      onChange={(event) => {
                        const nextValue = Math.max(0, Number(event.target.value) || 0);
                        setMeterDraftById((previous) => ({
                          ...previous,
                          [meter.id]: nextValue
                        }));
                        setIsConfigDirty(true);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flow-kpi-grid">
          <div className="flow-kpi">
            <span>Entrante actual</span>
            <strong>{formatNumber(latest?.incomingCalibrated, 1)} m3/h</strong>
          </div>
          <div className="flow-kpi">
            <span>Saliente actual</span>
            <strong>{formatNumber(latest?.outgoingCalibrated, 1)} m3/h</strong>
          </div>
          <div className="flow-kpi">
            <span>Balance neto actual</span>
            <strong>{formatNumber(latest?.netPlantBalance, 1)} m3/h</strong>
          </div>
          <div className="flow-kpi">
            <span>Concesion usada</span>
            <strong>{formatNumber(flowStats.concessionUsedPct, 1)}%</strong>
          </div>
          <div className="flow-kpi">
            <span>P95 entrante</span>
            <strong>{formatNumber(flowStats.incomingP95, 1)} m3/h</strong>
          </div>
          <div className="flow-kpi">
            <span>P95 saliente</span>
            <strong>{formatNumber(flowStats.outgoingP95, 1)} m3/h</strong>
          </div>
          <div className="flow-kpi">
            <span>Recirculacion media</span>
            <strong>{formatNumber(flowStats.recirculationRatioPct, 1)}%</strong>
          </div>
          <div className="flow-kpi">
            <span>Calidad media descarga</span>
            <strong>{formatNumber(flowStats.dischargeQualityAvg, 1)}%</strong>
          </div>
        </div>
      </article>

      <article className="panel flow-alerts-panel">
        <h3>Alarmas automaticas de caudal</h3>
        <p className="flow-chart-caption">
          Motor de alertas por desviacion entrante/saliente y sobreconsumo de concesion anual.
        </p>

        {activeAlerts.length === 0 ? (
          <p className="flow-alert-empty">Sin alarmas activas en este momento.</p>
        ) : (
          <div className="flow-alert-list">
            {activeAlerts.map((alert) => (
              <article
                key={alert.id}
                className={`flow-alert-item ${alert.severity === "critical" ? "flow-alert-critical" : "flow-alert-warning"}`.trim()}
              >
                <div className="flow-alert-row">
                  <span
                    className={`flow-alert-chip ${alert.severity === "critical" ? "flow-alert-chip-critical" : "flow-alert-chip-warning"}`.trim()}
                  >
                    {alert.severity === "critical" ? "Critica" : "Advertencia"}
                  </span>
                  <strong>{alert.title}</strong>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={resolveAlertMutation.isPending}
                    onClick={() => resolveAlertMutation.mutate(alert.id)}
                  >
                    Resolver
                  </button>
                </div>
                <p>{alert.description}</p>
                <p className="flow-alert-meta">
                  Valor: {formatNumber(alert.metricValue, 2)} | Umbral: {formatNumber(alert.thresholdValue, 2)} | Alta: {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : "-"}
                </p>
              </article>
            ))}
          </div>
        )}
      </article>

      <article className="panel flow-calibration-panel">
        <h3>Calibracion puntual de caudalimetro</h3>
        <p>
          Ajusta K del caudalimetro seleccionado con contraste de referencia de campo para reducir
          sesgo entre lectura del equipo y medida real en canal.
        </p>

        <div className="form-grid">
          <label htmlFor="flow-meter-target">
            Caudalimetro objetivo
            <select
              id="flow-meter-target"
              value={selectedCalibrationMeter?.id || ""}
              onChange={(event) => setSelectedCalibrationMeterId(Number(event.target.value))}
            >
              {configuredMeters.map((meter) => (
                <option key={meter.id} value={meter.id}>
                  {meter.label || `${channelLabel(meter.channelKey)} ${meter.deviceCode || ""}`.trim()}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="flow-reference">
            Medida de referencia (m3/h)
            <input
              id="flow-reference"
              type="number"
              min={1}
              value={manualReference}
              onChange={(event) => setManualReference(event.target.value)}
            />
          </label>

          <label htmlFor="flow-meter-reading">
            Lectura caudalimetro (m3/h)
            <input
              id="flow-meter-reading"
              type="number"
              min={1}
              value={manualMeterReading}
              onChange={(event) => setManualMeterReading(event.target.value)}
            />
          </label>
        </div>

        <div className="flow-calibration-footer">
          <div>
            <span>K recomendado</span>
            <strong>{recommendedK === null ? "-" : formatNumber(recommendedK, 3)}</strong>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={recommendedK === null || !selectedCalibrationMeter}
            onClick={() => {
              if (recommendedK !== null && selectedCalibrationMeter) {
                setMeterDraftById((previous) => ({
                  ...previous,
                  [selectedCalibrationMeter.id]: Number(recommendedK.toFixed(3))
                }));
                setIsConfigDirty(true);
              }
            }}
          >
            Aplicar K recomendado al caudalimetro
          </button>
        </div>
      </article>

      <div className="flow-charts-grid">
        <article className="panel">
          <h3>Caudal entrante y saliente</h3>
          <p className="flow-chart-caption">
            Evolucion de caudal con comparativa de lectura calibrada frente a lectura medida.
          </p>
          <ReactECharts option={flowTrendOption(hourlySeries)} style={{ height: 350 }} />
        </article>

        <article className="panel">
          <h3>Balance de planta y calidad de descarga</h3>
          <p className="flow-chart-caption">
            Balance neto horario (entrante - saliente), agua recirculada e indice de calidad de salida.
          </p>
          <ReactECharts option={balanceAndQualityOption(hourlySeries)} style={{ height: 350 }} />
        </article>
      </div>

      <article className="panel">
        <h3>Concesion anual de agua (m3)</h3>
        <p className="flow-chart-caption">
          Seguimiento mensual del consumo entrante y progreso acumulado sobre la concesion otorgada.
        </p>
        <ReactECharts option={annualConcessionOption(yearlyRows, annualConcessionM3)} style={{ height: 360 }} />

        <div className="flow-kpi-grid flow-kpi-grid-summary">
          <div className="flow-kpi">
            <span>m3 anuales entrantes</span>
            <strong>{formatNumber(flowStats.annualIncomingM3, 0)} m3</strong>
          </div>
          <div className="flow-kpi">
            <span>m3 anuales salientes</span>
            <strong>{formatNumber(flowStats.annualOutgoingM3, 0)} m3</strong>
          </div>
          <div className="flow-kpi">
            <span>m3 restantes concesion</span>
            <strong>{formatNumber(flowStats.remainingM3, 0)} m3</strong>
          </div>
          <div className="flow-kpi">
            <span>Autonomia estimada</span>
            <strong>{formatNumber(flowStats.autonomyDays, 1)} dias</strong>
          </div>
        </div>

        <div className="flow-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Entrante (m3)</th>
                <th>Saliente (m3)</th>
                <th>Recirculado (m3)</th>
                <th>Acumulado (%)</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {yearlyRows.map((row) => {
                const state = row.concessionUsedPct >= 100
                  ? "Exceso"
                  : row.concessionUsedPct >= ((row.monthIndex + 1) / 12) * 100 + 4
                    ? "Vigilancia"
                    : row.estimated
                      ? "Estimado"
                      : "Controlado";

                return (
                  <tr key={row.monthLabel}>
                    <td>{row.monthLabel}</td>
                    <td>{formatNumber(row.incomingM3, 0)}</td>
                    <td>{formatNumber(row.outgoingM3, 0)}</td>
                    <td>{formatNumber(row.recirculatedM3, 0)}</td>
                    <td>{formatNumber(row.concessionUsedPct, 1)}%</td>
                    <td>{state}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
