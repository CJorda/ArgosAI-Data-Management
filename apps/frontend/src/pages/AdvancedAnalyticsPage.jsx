import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pondsRequest, sensorHealthOverviewRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./AdvancedAnalyticsPage.css";

const STATUS_PRIORITY = {
  critical: 4,
  warning: 3,
  ok: 2,
  disabled: 1
};

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadBlob(content, mimeType, fileName) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function scenarioLabelByScore(anomalyScore) {
  if (anomalyScore >= 80) {
    return "critico";
  }

  if (anomalyScore >= 50) {
    return "alto";
  }

  if (anomalyScore >= 25) {
    return "medio";
  }

  return "controlado";
}

function scenarioClassName(anomalyScore) {
  const label = scenarioLabelByScore(anomalyScore);
  return `analytics-pill analytics-pill-${label}`;
}

export function AdvancedAnalyticsPage() {
  const { accessToken } = useAuth();
  const [windowHours, setWindowHours] = useState("48");
  const [staleMinutes, setStaleMinutes] = useState("35");
  const [pondSearch, setPondSearch] = useState("");

  const healthParams = useMemo(() => ({
    windowHours: Math.max(4, Math.min(168, Number(windowHours) || 48)),
    staleMinutes: Math.max(5, Math.min(240, Number(staleMinutes) || 35))
  }), [windowHours, staleMinutes]);

  const pondsQuery = useQuery({
    queryKey: ["ponds", "advanced-analytics"],
    queryFn: () => pondsRequest(accessToken)
  });

  const sensorHealthQuery = useQuery({
    queryKey: ["sensor-health", "advanced-analytics", healthParams],
    queryFn: () => sensorHealthOverviewRequest(accessToken, healthParams)
  });

  const pondRows = useMemo(() => {
    const sensorRows = sensorHealthQuery.data?.sensors || [];
    const searchTerm = pondSearch.trim().toLowerCase();
    const rowsByPond = new Map();

    for (const sensor of sensorRows) {
      if (!rowsByPond.has(sensor.pondName)) {
        rowsByPond.set(sensor.pondName, {
          pondName: sensor.pondName,
          sensorCount: 0,
          enabledSensors: 0,
          warningSensors: 0,
          criticalSensors: 0,
          incidentCount: 0,
          totalHealthScore: 0,
          scoredSensors: 0,
          topStatus: "ok",
          trackedTypes: new Set()
        });
      }

      const pond = rowsByPond.get(sensor.pondName);
      pond.sensorCount += 1;
      pond.trackedTypes.add(sensor.sensorType || "unknown");

      if (sensor.enabled) {
        pond.enabledSensors += 1;
      }

      if (sensor.status === "warning") {
        pond.warningSensors += 1;
      }

      if (sensor.status === "critical") {
        pond.criticalSensors += 1;
      }

      pond.incidentCount += sensor.incidents?.length || 0;

      if (typeof sensor.healthScore === "number") {
        pond.totalHealthScore += sensor.healthScore;
        pond.scoredSensors += 1;
      }

      if (STATUS_PRIORITY[sensor.status] > STATUS_PRIORITY[pond.topStatus]) {
        pond.topStatus = sensor.status;
      }
    }

    const transformed = Array.from(rowsByPond.values()).map((item) => {
      const avgHealthScore = item.scoredSensors > 0
        ? Number((item.totalHealthScore / item.scoredSensors).toFixed(1))
        : null;
      const anomalyScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            item.criticalSensors * 22
            + item.warningSensors * 11
            + item.incidentCount * 2
            + Math.max(0, 100 - (avgHealthScore ?? 100)) * 0.35
          )
        )
      );

      return {
        pondName: item.pondName,
        sensorCount: item.sensorCount,
        enabledSensors: item.enabledSensors,
        warningSensors: item.warningSensors,
        criticalSensors: item.criticalSensors,
        incidentCount: item.incidentCount,
        avgHealthScore,
        anomalyScore,
        scenarioLabel: scenarioLabelByScore(anomalyScore),
        trackedTypes: Array.from(item.trackedTypes).sort().join(", ")
      };
    });

    const filtered = transformed.filter((row) => {
      if (!searchTerm) {
        return true;
      }

      return row.pondName.toLowerCase().includes(searchTerm);
    });

    return filtered.sort(
      (left, right) =>
        right.anomalyScore - left.anomalyScore
        || right.incidentCount - left.incidentCount
        || left.pondName.localeCompare(right.pondName)
    );
  }, [sensorHealthQuery.data, pondSearch]);

  const summary = useMemo(() => {
    const totalPonds = pondRows.length;
    const stressedPonds = pondRows.filter((row) => row.anomalyScore >= 50).length;
    const avgAnomalyScore = totalPonds > 0
      ? Number((pondRows.reduce((sum, row) => sum + row.anomalyScore, 0) / totalPonds).toFixed(1))
      : 0;

    return {
      totalPonds,
      stressedPonds,
      avgAnomalyScore
    };
  }, [pondRows]);

  const byTypeRows = sensorHealthQuery.data?.byType || [];
  const topIncidents = sensorHealthQuery.data?.topIncidents || [];

  const exportPondsCsv = () => {
    const rows = [
      [
        "piscina",
        "score_analitico",
        "escenario",
        "sensores",
        "sensores_activos",
        "warnings",
        "criticos",
        "incidentes",
        "health_score_medio",
        "tipos_sensor"
      ],
      ...pondRows.map((item) => [
        item.pondName,
        item.anomalyScore,
        item.scenarioLabel,
        item.sensorCount,
        item.enabledSensors,
        item.warningSensors,
        item.criticalSensors,
        item.incidentCount,
        item.avgHealthScore ?? "",
        item.trackedTypes
      ])
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");
    downloadBlob(csv, "text/csv;charset=utf-8", "analitica-avanzada-piscinas.csv");
  };

  return (
    <section className="analytics-page">
      <article className="panel">
        <h3>Analitica avanzada</h3>
        <p className="analytics-intro">
          Compara salud sensorial por piscina, detecta anomalias operativas y prioriza
          intervenciones con un score agregado para las proximas 24-72h.
        </p>

        <div className="filters-inline analytics-toolbar">
          <div>
            <label htmlFor="analyticsWindow">Ventana de analisis (h)</label>
            <input
              id="analyticsWindow"
              type="number"
              min="4"
              max="168"
              step="1"
              value={windowHours}
              onChange={(event) => setWindowHours(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="analyticsStale">Timeout telemetria (min)</label>
            <input
              id="analyticsStale"
              type="number"
              min="5"
              max="240"
              step="1"
              value={staleMinutes}
              onChange={(event) => setStaleMinutes(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="analyticsSearch">Buscar piscina</label>
            <input
              id="analyticsSearch"
              type="text"
              placeholder="Ej. Piscina A1"
              value={pondSearch}
              onChange={(event) => setPondSearch(event.target.value)}
            />
          </div>

          <button type="button" className="tiny-button" onClick={exportPondsCsv}>
            Exportar CSV comparativo
          </button>
        </div>

        <div className="analytics-kpi-grid">
          <article className="analytics-kpi-card">
            <span>Piscinas analizadas</span>
            <strong>{summary.totalPonds}</strong>
          </article>
          <article className="analytics-kpi-card">
            <span>Piscinas tensionadas</span>
            <strong>{summary.stressedPonds}</strong>
          </article>
          <article className="analytics-kpi-card">
            <span>Score medio de anomalia</span>
            <strong>{summary.avgAnomalyScore}</strong>
          </article>
          <article className="analytics-kpi-card">
            <span>Incidencias top</span>
            <strong>{(sensorHealthQuery.data?.summary?.incidentTotal || 0).toLocaleString("es-ES")}</strong>
          </article>
          <article className="analytics-kpi-card">
            <span>Piscinas registradas</span>
            <strong>{(pondsQuery.data || []).length}</strong>
          </article>
        </div>
      </article>

      <div className="analytics-grid">
        <article className="panel">
          <h3>Ranking de riesgo operativo por piscina</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Piscina</th>
                  <th>Score</th>
                  <th>Escenario</th>
                  <th>Incidentes</th>
                  <th>Health medio</th>
                  <th>Warn/Critical</th>
                  <th>Tipos</th>
                </tr>
              </thead>
              <tbody>
                {pondRows.length > 0 ? (
                  pondRows.map((row) => (
                    <tr key={row.pondName}>
                      <td>{row.pondName}</td>
                      <td>{row.anomalyScore}</td>
                      <td>
                        <span className={scenarioClassName(row.anomalyScore)}>{row.scenarioLabel}</span>
                      </td>
                      <td>{row.incidentCount}</td>
                      <td>{row.avgHealthScore ?? "-"}</td>
                      <td>{row.warningSensors}/{row.criticalSensors}</td>
                      <td>{row.trackedTypes || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty-text">
                      {sensorHealthQuery.isFetching
                        ? "Calculando comparativas..."
                        : "No hay datos de salud sensorial para los filtros actuales."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h3>Distribucion por tipo de sensor</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Total</th>
                  <th>OK</th>
                  <th>Warning</th>
                  <th>Critical</th>
                  <th>Disabled</th>
                </tr>
              </thead>
              <tbody>
                {byTypeRows.length > 0 ? (
                  byTypeRows.map((row) => (
                    <tr key={row.sensorType}>
                      <td>{row.sensorType}</td>
                      <td>{row.total}</td>
                      <td>{row.ok}</td>
                      <td>{row.warning}</td>
                      <td>{row.critical}</td>
                      <td>{row.disabled}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="empty-text">No hay tipos de sensor disponibles.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <article className="panel">
        <h3>Incidencias priorizadas</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Severidad</th>
                <th>Incidencia</th>
                <th>Piscina</th>
                <th>Sensor</th>
                <th>Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {topIncidents.length > 0 ? (
                topIncidents.map((item, index) => (
                  <tr key={`${item.sensorId}-${item.code}-${index}`}>
                    <td>{item.severity}</td>
                    <td>{item.code}</td>
                    <td>{item.pondName}</td>
                    <td>{item.sensorName}</td>
                    <td>{item.message}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty-text">No hay incidencias activas para la ventana elegida.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
