import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  alertsRequest,
  alertsRiskForecastRequest,
  resolveAlertRequest,
  updateAlertProtocolRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./AlertsPage.css";

const protocolStatusLabel = {
  pending: "Pendiente",
  acknowledged: "Reconocida",
  in_progress: "En ejecucion",
  blocked: "Bloqueada",
  resolved: "Cerrada"
};

const riskLevelLabel = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  critical: "Critico"
};

const sensorTypeLabel = {
  oxygen: "Oxigeno",
  temperature: "Temperatura",
  ph: "pH",
  salinity: "Salinidad",
  turbidity: "Turbidez"
};

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function toDatetimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function riskAction(level) {
  if (level === "critical") {
    return "Escalar inmediatamente y activar protocolo preventivo.";
  }

  if (level === "high") {
    return "Asignar responsable y reforzar monitoreo operativo.";
  }

  if (level === "medium") {
    return "Revisar consignas y programar verificacion en turno.";
  }

  return "Mantener seguimiento estandar.";
}

export function AlertsPage() {
  const location = useLocation();
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [expandedAlertId, setExpandedAlertId] = useState(null);
  const [notesDraftById, setNotesDraftById] = useState({});
  const [deadlineDraftById, setDeadlineDraftById] = useState({});
  const alertsSection = location.pathname.endsWith("/prediccion-riesgo") ? "risk" : "alerts";

  const alertsQuery = useQuery({
    queryKey: ["alerts", status],
    queryFn: () => alertsRequest(accessToken, status),
    enabled: alertsSection === "alerts"
  });

  const riskForecastQuery = useQuery({
    queryKey: ["alerts", "risk-forecast"],
    queryFn: () => alertsRiskForecastRequest(accessToken),
    enabled: alertsSection === "risk",
    refetchInterval: 60000
  });

  const alerts = alertsQuery.data || [];
  const riskRows = riskForecastQuery.data?.ponds || [];

  const resolveMutation = useMutation({
    mutationFn: (alertId) => resolveAlertRequest(accessToken, alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["alerts", "open"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  const protocolMutation = useMutation({
    mutationFn: ({ alertId, payload }) => updateAlertProtocolRequest(accessToken, alertId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["alerts", "open"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  const isWorking = resolveMutation.isPending || protocolMutation.isPending;

  const protocolProgressById = useMemo(() => {
    const map = new Map();

    for (const alert of alerts) {
      const steps = Array.isArray(alert.protocol_steps) ? alert.protocol_steps : [];
      const completed = steps.filter((step) => step.done).length;
      map.set(alert.id, {
        completed,
        total: steps.length
      });
    }

    return map;
  }, [alerts]);

  const updateProtocol = (alertId, payload) => {
    protocolMutation.mutate({ alertId, payload });
  };

  const handleAssignMe = (alert) => {
    if (!user?.id) {
      return;
    }

    const payload = {
      protocolOwnerId: user.id,
      protocolStatus: alert.protocol_status === "pending" ? "acknowledged" : alert.protocol_status
    };

    updateProtocol(alert.id, payload);
  };

  const handleStatusChange = (alert, nextStatus) => {
    updateProtocol(alert.id, {
      protocolStatus: nextStatus
    });
  };

  const handleStepToggle = (alert, stepId, done) => {
    const nextSteps = (alert.protocol_steps || []).map((step) =>
      step.id === stepId ? { ...step, done } : step
    );

    updateProtocol(alert.id, {
      protocolSteps: nextSteps
    });
  };

  const handleSaveNotes = (alert) => {
    const nextNotes = notesDraftById[alert.id] ?? alert.protocol_notes ?? "";

    updateProtocol(alert.id, {
      protocolNotes: nextNotes.trim() || null
    });
  };

  const handleSaveDeadline = (alert) => {
    const localValue = deadlineDraftById[alert.id] ?? toDatetimeLocalValue(alert.escalation_deadline);

    updateProtocol(alert.id, {
      escalationDeadline: localValue ? new Date(localValue).toISOString() : null
    });
  };

  const toggleExpanded = (alert) => {
    setExpandedAlertId((current) => (current === alert.id ? null : alert.id));

    setNotesDraftById((current) => {
      if (Object.prototype.hasOwnProperty.call(current, alert.id)) {
        return current;
      }

      return {
        ...current,
        [alert.id]: alert.protocol_notes || ""
      };
    });

    setDeadlineDraftById((current) => {
      if (Object.prototype.hasOwnProperty.call(current, alert.id)) {
        return current;
      }

      return {
        ...current,
        [alert.id]: toDatetimeLocalValue(alert.escalation_deadline)
      };
    });
  };

  return (
    <section className="alerts-page">
      {alertsSection === "alerts" ? (
        <article className="panel">
          <div className="filters-inline">
            <label htmlFor="alertStatus">Estado</label>
            <select id="alertStatus" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">Todas</option>
              <option value="open">Abiertas</option>
              <option value="resolved">Resueltas</option>
            </select>
          </div>
        </article>
      ) : null}

      {alertsSection === "risk" ? (
        <article className="panel">
          <h3>Prediccion de riesgo 24-72h</h3>
          <p className="alerts-intro">
            Estimacion por piscina basada en tendencia, variabilidad y alertas activas de los ultimos dias.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Piscina</th>
                  <th>24h</th>
                  <th>48h</th>
                  <th>72h</th>
                  <th>Sensores prioritarios</th>
                  <th>Accion sugerida</th>
                </tr>
              </thead>
              <tbody>
                {riskRows.map((row) => (
                  <tr key={`risk-${row.pondId}`}>
                    <td>{row.pondName}</td>
                    <td>
                      <span className={`risk-pill risk-pill-${row.risk24.level}`}>
                        {riskLevelLabel[row.risk24.level] || row.risk24.level} ({row.risk24.score})
                      </span>
                    </td>
                    <td>
                      <span className={`risk-pill risk-pill-${row.risk48.level}`}>
                        {riskLevelLabel[row.risk48.level] || row.risk48.level} ({row.risk48.score})
                      </span>
                    </td>
                    <td>
                      <span className={`risk-pill risk-pill-${row.risk72.level}`}>
                        {riskLevelLabel[row.risk72.level] || row.risk72.level} ({row.risk72.score})
                      </span>
                    </td>
                    <td>
                      {(row.criticalSensors || []).length > 0
                        ? row.criticalSensors
                            .slice(0, 2)
                            .map((item) => `${sensorTypeLabel[item.sensorType] || item.sensorType} (${item.score})`)
                            .join(", ")
                        : "Sin riesgo alto"}
                    </td>
                    <td>{riskAction(row.risk72.level)}</td>
                  </tr>
                ))}
                {riskRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>Sin suficientes datos historicos para proyectar riesgo.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {alertsSection === "alerts" ? (
        <article className="panel">
        <h3>Alertas</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Piscina</th>
                <th>Sensor</th>
                <th>Mensaje</th>
                <th>Severidad</th>
                <th>Estado</th>
                <th>Protocolo</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => {
                const isExpanded = expandedAlertId === alert.id;
                const progress = protocolProgressById.get(alert.id) || { completed: 0, total: 0 };

                return (
                  <Fragment key={alert.id}>
                    <tr>
                      <td>{formatDate(alert.created_at)}</td>
                      <td>{alert.pond_name}</td>
                      <td>{alert.sensor_name}</td>
                      <td>{alert.message}</td>
                      <td>{alert.severity}</td>
                      <td>{alert.status}</td>
                      <td>
                        <div className="protocol-chip-stack">
                          <span className={`protocol-status protocol-status-${alert.protocol_status}`}>
                            {protocolStatusLabel[alert.protocol_status] || alert.protocol_status}
                          </span>
                          <small>
                            {progress.total > 0
                              ? `${progress.completed}/${progress.total} pasos`
                              : "Sin pasos"}
                          </small>
                          <small>
                            {alert.protocol_owner_name
                              ? `Resp: ${alert.protocol_owner_name}`
                              : "Resp: sin asignar"}
                          </small>
                        </div>
                      </td>
                      <td>
                        <div className="alert-actions">
                          <button
                            type="button"
                            className="tiny-button"
                            onClick={() => toggleExpanded(alert)}
                          >
                            {isExpanded ? "Ocultar" : "Protocolo"}
                          </button>

                          {alert.status === "open" ? (
                            <>
                              <button
                                type="button"
                                className="tiny-button"
                                onClick={() => handleAssignMe(alert)}
                                disabled={!user?.id || isWorking}
                              >
                                Asignarme
                              </button>
                              <button
                                type="button"
                                className="tiny-button"
                                onClick={() => resolveMutation.mutate(alert.id)}
                                disabled={isWorking}
                              >
                                Resolver
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr className="alert-protocol-row">
                        <td colSpan={8}>
                          <div className="alert-protocol-card">
                            <div className="alert-protocol-header">
                              <strong>Checklist operativo</strong>
                              <div className="alert-protocol-inline-fields">
                                <label htmlFor={`status-${alert.id}`}>Estado protocolo</label>
                                <select
                                  id={`status-${alert.id}`}
                                  value={alert.protocol_status || "pending"}
                                  onChange={(event) => handleStatusChange(alert, event.target.value)}
                                  disabled={isWorking || alert.status !== "open"}
                                >
                                  <option value="pending">Pendiente</option>
                                  <option value="acknowledged">Reconocida</option>
                                  <option value="in_progress">En ejecucion</option>
                                  <option value="blocked">Bloqueada</option>
                                  <option value="resolved">Cerrada</option>
                                </select>

                                <label htmlFor={`deadline-${alert.id}`}>Escalado antes de</label>
                                <input
                                  id={`deadline-${alert.id}`}
                                  type="datetime-local"
                                  value={
                                    deadlineDraftById[alert.id] ?? toDatetimeLocalValue(alert.escalation_deadline)
                                  }
                                  onChange={(event) =>
                                    setDeadlineDraftById((current) => ({
                                      ...current,
                                      [alert.id]: event.target.value
                                    }))
                                  }
                                  disabled={isWorking || alert.status !== "open"}
                                />
                                <button
                                  type="button"
                                  className="tiny-button"
                                  onClick={() => handleSaveDeadline(alert)}
                                  disabled={isWorking || alert.status !== "open"}
                                >
                                  Guardar fecha
                                </button>
                              </div>
                            </div>

                            <ul className="alert-protocol-steps">
                              {(alert.protocol_steps || []).map((step) => (
                                <li key={`${alert.id}-${step.id}`}>
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(step.done)}
                                      onChange={(event) =>
                                        handleStepToggle(alert, step.id, event.target.checked)
                                      }
                                      disabled={isWorking || alert.status !== "open"}
                                    />
                                    <span>{step.title}</span>
                                  </label>
                                  {step.description ? <small>{step.description}</small> : null}
                                </li>
                              ))}
                            </ul>

                            <div className="alert-protocol-notes">
                              <label htmlFor={`notes-${alert.id}`}>Notas de ejecucion</label>
                              <textarea
                                id={`notes-${alert.id}`}
                                value={notesDraftById[alert.id] ?? alert.protocol_notes ?? ""}
                                onChange={(event) =>
                                  setNotesDraftById((current) => ({
                                    ...current,
                                    [alert.id]: event.target.value
                                  }))
                                }
                                placeholder="Registrar acciones, observaciones y resultado de la intervencion..."
                                rows={3}
                                disabled={isWorking}
                              />
                              <div className="alert-protocol-notes-footer">
                                <small>
                                  Inicio: {formatDate(alert.protocol_started_at)} | Actualizado: {formatDate(alert.protocol_updated_at)}
                                </small>
                                <button
                                  type="button"
                                  className="tiny-button"
                                  onClick={() => handleSaveNotes(alert)}
                                  disabled={isWorking}
                                >
                                  Guardar nota
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </article>
      ) : null}
    </section>
  );
}
