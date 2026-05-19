import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHealthEventRequest,
  healthEventsRequest,
  pondsRequest,
  updateHealthEventRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./OperationsModulesPage.css";

function toDateTimeLocalInput(value = new Date()) {
  const normalized = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return normalized.toISOString().slice(0, 16);
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function statusClass(status) {
  return `module-pill module-pill-status-${status || "open"}`;
}

function severityClass(severity) {
  return `module-pill module-pill-priority-${severity || "medium"}`;
}

export function HealthBiosecurityPage({ mode = "general" }) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const lockedEventType =
    mode === "vaccination" ? "vaccination" : mode === "medication" ? "treatment" : "";
  const pageTitle =
    mode === "vaccination"
      ? "Módulo de vacunación"
      : mode === "medication"
        ? "Módulo de medicación"
        : "Módulo sanitario y bioseguridad";
  const pageIntro =
    mode === "vaccination"
      ? "Planifica y registra campañas de vacunación por piscina/lote con control de estado y seguimiento."
      : mode === "medication"
        ? "Gestiona tratamientos y medicación por piscina/lote, con dosis, estado y trazabilidad del evento."
        : "Registra eventos sanitarios, seguimientos preventivos y estados de bioseguridad por piscina/lote para reducir mortalidad y mejorar cumplimiento operativo.";

  const [statusFilter, setStatusFilter] = useState("open");
  const [severityFilter, setSeverityFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState(lockedEventType);
  const [eventForm, setEventForm] = useState({
    pondId: "",
    lotCode: "",
    eventType: lockedEventType || "treatment",
    severity: "medium",
    title: "",
    description: "",
    medicationName: "",
    dosage: "",
    biosecurityLevel: "medium",
    eventAt: toDateTimeLocalInput()
  });

  const pondsQuery = useQuery({
    queryKey: ["ponds", "health"],
    queryFn: () => pondsRequest(accessToken)
  });

  const healthEventsQuery = useQuery({
    queryKey: ["operations", "health-events", statusFilter, severityFilter, eventTypeFilter],
    queryFn: () =>
      healthEventsRequest(accessToken, {
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        eventType: eventTypeFilter || undefined,
        limit: 220
      })
  });

  const createEventMutation = useMutation({
    mutationFn: (payload) => createHealthEventRequest(accessToken, payload),
    onSuccess: () => {
      setEventForm((current) => ({
        ...current,
        lotCode: "",
        title: "",
        description: "",
        medicationName: "",
        dosage: ""
      }));
      queryClient.invalidateQueries({ queryKey: ["operations", "health-events"] });
    }
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ eventId, payload }) => updateHealthEventRequest(accessToken, eventId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations", "health-events"] });
    }
  });

  const events = healthEventsQuery.data || [];

  const unresolvedCount = useMemo(
    () => events.filter((item) => item.status !== "resolved" && item.status !== "cancelled").length,
    [events]
  );

  const handleCreateEvent = (event) => {
    event.preventDefault();

    if (!eventForm.pondId || !eventForm.title.trim()) {
      return;
    }

    createEventMutation.mutate({
      pondId: Number(eventForm.pondId),
      lotCode: eventForm.lotCode.trim() || null,
      eventType: eventForm.eventType,
      severity: eventForm.severity,
      title: eventForm.title.trim(),
      description: eventForm.description.trim() || null,
      medicationName: eventForm.medicationName.trim() || null,
      dosage: eventForm.dosage.trim() || null,
      biosecurityLevel: eventForm.biosecurityLevel,
      eventAt: toIsoOrNull(eventForm.eventAt)
    });
  };

  const markResolved = (eventId) => {
    updateEventMutation.mutate({
      eventId,
      payload: {
        status: "resolved"
      }
    });
  };

  return (
    <section className="module-page">
      <article className="panel">
        <h3>{pageTitle}</h3>
        <p className="module-intro">{pageIntro}</p>

        <div className="filters-inline">
          <div>
            <label htmlFor="healthStatusFilter">Estado</label>
            <select
              id="healthStatusFilter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos</option>
              <option value="open">open</option>
              <option value="in_progress">in_progress</option>
              <option value="blocked">blocked</option>
              <option value="resolved">resolved</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <div>
            <label htmlFor="healthSeverityFilter">Severidad</label>
            <select
              id="healthSeverityFilter"
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
            >
              <option value="">Todas</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
          </div>

          {!lockedEventType ? (
            <div>
              <label htmlFor="healthTypeFilter">Tipo</label>
              <select
                id="healthTypeFilter"
                value={eventTypeFilter}
                onChange={(event) => setEventTypeFilter(event.target.value)}
              >
                <option value="">Todos</option>
                <option value="treatment">treatment</option>
                <option value="sample">sample</option>
                <option value="mortality">mortality</option>
                <option value="quarantine">quarantine</option>
                <option value="vaccination">vaccination</option>
                <option value="inspection">inspection</option>
              </select>
            </div>
          ) : null}
        </div>

        <p className="module-inline-note">
          Eventos visibles: {events.length} | Pendientes de cierre: {unresolvedCount}
        </p>
      </article>

      <div className="module-grid">
        <article className="panel">
          <h3>Registrar evento sanitario</h3>
          <form className="stack-form" onSubmit={handleCreateEvent}>
            <label htmlFor="healthPond">Piscina</label>
            <select
              id="healthPond"
              value={eventForm.pondId}
              onChange={(event) =>
                setEventForm((current) => ({ ...current, pondId: event.target.value }))
              }
              required
            >
              <option value="">Selecciona</option>
              {(pondsQuery.data || []).map((pond) => (
                <option key={pond.id} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>

            <label htmlFor="healthLot">Lote</label>
            <input
              id="healthLot"
              type="text"
              value={eventForm.lotCode}
              onChange={(event) =>
                setEventForm((current) => ({ ...current, lotCode: event.target.value }))
              }
              placeholder="LOT-..."
            />

            {lockedEventType ? (
              <>
                <label htmlFor="healthType">Tipo</label>
                <input id="healthType" type="text" value={lockedEventType} readOnly />
              </>
            ) : (
              <>
                <label htmlFor="healthType">Tipo</label>
                <select
                  id="healthType"
                  value={eventForm.eventType}
                  onChange={(event) =>
                    setEventForm((current) => ({ ...current, eventType: event.target.value }))
                  }
                >
                  <option value="treatment">treatment</option>
                  <option value="sample">sample</option>
                  <option value="mortality">mortality</option>
                  <option value="quarantine">quarantine</option>
                  <option value="vaccination">vaccination</option>
                  <option value="inspection">inspection</option>
                </select>
              </>
            )}

            <label htmlFor="healthSeverity">Severidad</label>
            <select
              id="healthSeverity"
              value={eventForm.severity}
              onChange={(event) =>
                setEventForm((current) => ({ ...current, severity: event.target.value }))
              }
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>

            <label htmlFor="healthTitle">Título</label>
            <input
              id="healthTitle"
              type="text"
              value={eventForm.title}
              onChange={(event) =>
                setEventForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Ej. Brote puntual con seguimiento diario"
              required
            />

            <label htmlFor="healthDescription">Descripción</label>
            <textarea
              id="healthDescription"
              rows={3}
              value={eventForm.description}
              onChange={(event) =>
                setEventForm((current) => ({ ...current, description: event.target.value }))
              }
            />

            <label htmlFor="healthMedication">Medicamento</label>
            <input
              id="healthMedication"
              type="text"
              value={eventForm.medicationName}
              onChange={(event) =>
                setEventForm((current) => ({ ...current, medicationName: event.target.value }))
              }
            />

            <label htmlFor="healthDosage">Dosis</label>
            <input
              id="healthDosage"
              type="text"
              value={eventForm.dosage}
              onChange={(event) =>
                setEventForm((current) => ({ ...current, dosage: event.target.value }))
              }
              placeholder="Ej. 4 kg / día"
            />

            <label htmlFor="healthBiosecurity">Nivel bioseguridad</label>
            <select
              id="healthBiosecurity"
              value={eventForm.biosecurityLevel}
              onChange={(event) =>
                setEventForm((current) => ({ ...current, biosecurityLevel: event.target.value }))
              }
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>

            <label htmlFor="healthEventAt">Fecha del evento</label>
            <input
              id="healthEventAt"
              type="datetime-local"
              value={eventForm.eventAt}
              onChange={(event) =>
                setEventForm((current) => ({ ...current, eventAt: event.target.value }))
              }
            />

            <button type="submit" className="primary-button" disabled={createEventMutation.isPending}>
              {createEventMutation.isPending ? "Guardando..." : "Registrar evento"}
            </button>
          </form>
        </article>

        <article className="panel">
          <h3>Eventos sanitarios</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Piscina</th>
                  <th>Lote</th>
                  <th>Tipo</th>
                  <th>Severidad</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {events.length > 0 ? (
                  events.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.event_at).toLocaleString()}</td>
                      <td>{item.pond_name}</td>
                      <td>{item.lot_code || "-"}</td>
                      <td>{item.event_type}</td>
                      <td>
                        <span className={severityClass(item.severity)}>{item.severity}</span>
                      </td>
                      <td>
                        <span className={statusClass(item.status)}>{item.status}</span>
                      </td>
                      <td>{item.title}</td>
                      <td>
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => markResolved(item.id)}
                          disabled={updateEventMutation.isPending || item.status === "resolved"}
                        >
                          Resolver
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="empty-text">No hay eventos sanitarios.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}
