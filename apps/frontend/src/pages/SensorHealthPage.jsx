import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sensorHealthOverviewRequest, syncSensorHealthAlertsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import { FEATURE_KEYS } from "../features/featureCatalog";
import "./SensorHealthPage.css";

const windowOptions = [24, 48, 72, 168];

const sensorTypeLabel = {
  oxygen: "Oxigeno",
  temperature: "Temperatura",
  ph: "pH",
  salinity: "Salinidad",
  turbidity: "Turbidez"
};

const statusLabel = {
  ok: "OK",
  warning: "Warning",
  critical: "Critico",
  disabled: "Deshabilitado"
};

const incidentCodeLabel = {
  missing_signal: "Sin señal",
  out_of_range: "Fuera de rango",
  frozen_signal: "Señal congelada",
  abrupt_jump: "Salto brusco",
  quality_flag: "Calidad dudosa"
};

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatNumber(value, digits = 2) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return numeric.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function statusClass(status) {
  if (status === "critical") {
    return "sensor-health-status-chip sensor-health-status-critical";
  }

  if (status === "warning") {
    return "sensor-health-status-chip sensor-health-status-warning";
  }

  if (status === "disabled") {
    return "sensor-health-status-chip sensor-health-status-disabled";
  }

  return "sensor-health-status-chip sensor-health-status-ok";
}

function severityClass(severity) {
  if (severity === "critical") {
    return "sensor-health-incident-chip sensor-health-incident-critical";
  }

  if (severity === "warning") {
    return "sensor-health-incident-chip sensor-health-incident-warning";
  }

  return "sensor-health-incident-chip";
}

function readingValueLabel(sensor) {
  const value = sensor?.currentValue;

  if (!Number.isFinite(Number(value))) {
    return "Sin lectura";
  }

  return `${formatNumber(value, 3)} ${sensor.unit || ""}`.trim();
}

export function SensorHealthPage() {
  const { accessToken, hasFeature } = useAuth();
  const queryClient = useQueryClient();
  const [windowHours, setWindowHours] = useState(24);
  const [staleMinutes, setStaleMinutes] = useState(35);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const canSyncAlerts = hasFeature(FEATURE_KEYS.ALERTS_VIEW);

  const healthQuery = useQuery({
    queryKey: ["sensor-health", windowHours, staleMinutes],
    queryFn: () =>
      sensorHealthOverviewRequest(accessToken, {
        windowHours,
        staleMinutes
      }),
    refetchInterval: 60_000
  });

  const sensors = healthQuery.data?.sensors || [];
  const byType = healthQuery.data?.byType || [];
  const summary = healthQuery.data?.summary || {};

  const syncMutation = useMutation({
    mutationFn: () =>
      syncSensorHealthAlertsRequest(accessToken, {
        windowHours,
        staleMinutes
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["sensor-health"] });
    }
  });

  const filteredSensors = useMemo(() => {
    return sensors.filter((sensor) => {
      if (statusFilter !== "all" && sensor.status !== statusFilter) {
        return false;
      }

      if (typeFilter !== "all" && sensor.sensorType !== typeFilter) {
        return false;
      }

      return true;
    });
  }, [sensors, statusFilter, typeFilter]);

  const topIncidents = healthQuery.data?.topIncidents || [];
  const syncSummary = syncMutation.data?.summary || null;

  return (
    <section className="sensor-health-page">
      <article className="panel">
        <h3>Salud de sensores y calidad de dato</h3>
        <p className="sensor-health-intro">
          Monitorizacion de integridad de telemetria con reglas de deteccion para señal ausente, valores fuera
          de rango, congelacion y saltos bruscos.
        </p>

        <div className="sensor-health-filters filters-inline">
          <div>
            <label htmlFor="windowHours">Ventana analisis</label>
            <select
              id="windowHours"
              value={windowHours}
              onChange={(event) => setWindowHours(Number(event.target.value) || 24)}
            >
              {windowOptions.map((hours) => (
                <option key={`window-${hours}`} value={hours}>
                  Ultimas {hours}h
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="staleMinutes">Sin señal (min)</label>
            <input
              id="staleMinutes"
              type="number"
              min={5}
              max={240}
              value={staleMinutes}
              onChange={(event) => {
                const numeric = Number(event.target.value);
                setStaleMinutes(Number.isFinite(numeric) ? Math.max(5, Math.min(240, Math.round(numeric))) : 35);
              }}
            />
          </div>

          <div>
            <label htmlFor="statusFilter">Estado</label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              <option value="critical">Critico</option>
              <option value="warning">Warning</option>
              <option value="ok">OK</option>
              <option value="disabled">Deshabilitado</option>
            </select>
          </div>

          <div>
            <label htmlFor="typeFilter">Tipo sensor</label>
            <select id="typeFilter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Todos</option>
              {byType.map((item) => (
                <option key={`type-${item.sensorType}`} value={item.sensorType}>
                  {sensorTypeLabel[item.sensorType] || item.sensorType}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sensor-health-actions">
          {canSyncAlerts ? (
            <button
              type="button"
              className="btn-primary"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending
                ? "Sincronizando alertas..."
                : "Crear/actualizar alertas operativas"}
            </button>
          ) : (
            <small className="sensor-health-sync-note">
              Tu rol no tiene permisos de alertas para sincronizar incidencias.
            </small>
          )}

          {syncMutation.isError ? (
            <p className="sensor-health-error sensor-health-sync-result">
              No se pudo sincronizar incidencias con alertas operativas.
            </p>
          ) : null}

          {syncSummary ? (
            <p className="sensor-health-sync-result">
              Alertas sincronizadas: creadas {syncSummary.created ?? 0}, actualizadas {syncSummary.updated ?? 0},
              auto-resueltas {syncSummary.autoResolved ?? 0}.
            </p>
          ) : null}
        </div>

        {healthQuery.isError ? (
          <p className="sensor-health-error">No se pudo cargar la salud de sensores.</p>
        ) : null}
      </article>

      <article className="panel">
        <div className="sensor-health-kpi-grid">
          <div className="sensor-health-kpi">
            <span>Sensores activos</span>
            <strong>{summary.activeSensors ?? 0}</strong>
            <small>Total: {summary.totalSensors ?? 0}</small>
          </div>

          <div className="sensor-health-kpi">
            <span>Criticos</span>
            <strong className="sensor-health-kpi-critical">{summary.criticalSensors ?? 0}</strong>
            <small>Requieren accion inmediata</small>
          </div>

          <div className="sensor-health-kpi">
            <span>Warning</span>
            <strong className="sensor-health-kpi-warning">{summary.warningSensors ?? 0}</strong>
            <small>Seguimiento reforzado</small>
          </div>

          <div className="sensor-health-kpi">
            <span>OK</span>
            <strong className="sensor-health-kpi-ok">{summary.okSensors ?? 0}</strong>
            <small>Operacion estable</small>
          </div>

          <div className="sensor-health-kpi">
            <span>Score medio</span>
            <strong>{formatNumber(summary.overallScore, 1)}</strong>
            <small>0 a 100</small>
          </div>

          <div className="sensor-health-kpi">
            <span>Incidencias</span>
            <strong>{summary.incidentTotal ?? 0}</strong>
            <small>Reglas disparadas</small>
          </div>
        </div>
      </article>

      <article className="panel">
        <h3>Sensores monitorizados</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sensor</th>
                <th>Tipo</th>
                <th>Piscina</th>
                <th>Ultima lectura</th>
                <th>Valor</th>
                <th>Estado</th>
                <th>Score</th>
                <th>Incidencias</th>
              </tr>
            </thead>
            <tbody>
              {healthQuery.isLoading ? (
                <tr>
                  <td colSpan={8}>Cargando salud de sensores...</td>
                </tr>
              ) : null}

              {!healthQuery.isLoading && filteredSensors.length === 0 ? (
                <tr>
                  <td colSpan={8}>No hay sensores para los filtros seleccionados.</td>
                </tr>
              ) : null}

              {filteredSensors.map((sensor) => (
                <tr key={`health-sensor-${sensor.sensorId}`}>
                  <td>
                    <strong>{sensor.sensorName}</strong>
                  </td>
                  <td>{sensorTypeLabel[sensor.sensorType] || sensor.sensorType}</td>
                  <td>{sensor.pondName}</td>
                  <td>
                    {formatDate(sensor.lastReadingAt)}
                    {Number.isFinite(Number(sensor.minutesSinceLast)) ? (
                      <small className="sensor-health-minutes">{formatNumber(sensor.minutesSinceLast, 1)} min</small>
                    ) : null}
                  </td>
                  <td>{readingValueLabel(sensor)}</td>
                  <td>
                    <span className={statusClass(sensor.status)}>
                      {statusLabel[sensor.status] || sensor.status}
                    </span>
                  </td>
                  <td>{sensor.healthScore === null ? "-" : formatNumber(sensor.healthScore, 0)}</td>
                  <td>
                    {(sensor.incidents || []).length > 0 ? (
                      <div className="sensor-health-incident-stack">
                        {sensor.incidents.map((incident, index) => (
                          <span
                            key={`incident-${sensor.sensorId}-${incident.code}-${index}`}
                            className={severityClass(incident.severity)}
                            title={incident.message}
                          >
                            {incidentCodeLabel[incident.code] || incident.code}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="sensor-health-no-incidents">Sin incidencias</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <h3>Incidencias prioritarias</h3>
        {topIncidents.length === 0 ? (
          <p className="sensor-health-empty">No hay incidencias activas con las reglas actuales.</p>
        ) : (
          <div className="sensor-health-top-list">
            {topIncidents.map((incident, index) => (
              <article key={`top-incident-${incident.sensorId}-${incident.code}-${index}`} className="sensor-health-top-item">
                <div className="sensor-health-top-head">
                  <strong>{incident.sensorName}</strong>
                  <span>{incident.pondName}</span>
                </div>
                <p>{incident.message}</p>
                <span className={severityClass(incident.severity)}>
                  {incidentCodeLabel[incident.code] || incident.code}
                </span>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
