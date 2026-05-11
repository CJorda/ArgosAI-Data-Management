import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaintenanceTaskRequest,
  maintenancePlanRequest,
  pondsRequest,
  updateMaintenanceTaskRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./OperationsModulesPage.css";

const statusOptions = ["pending", "in_progress", "blocked", "done", "cancelled"];

function toDateTimeLocalInput(value = new Date()) {
  const normalized = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return normalized.toISOString().slice(0, 16);
}

function priorityClass(priority) {
  if (!priority) {
    return "module-pill module-pill-priority-medium";
  }

  return `module-pill module-pill-priority-${priority}`;
}

function statusClass(status) {
  if (!status) {
    return "module-pill module-pill-status-pending";
  }

  return `module-pill module-pill-status-${status}`;
}

function toPayloadDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function PreventiveMaintenancePage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [taskForm, setTaskForm] = useState({
    pondId: "",
    title: "",
    description: "",
    priority: "medium",
    dueAt: toDateTimeLocalInput(new Date(Date.now() + 24 * 3600 * 1000))
  });

  const pondsQuery = useQuery({
    queryKey: ["ponds", "preventive-maintenance"],
    queryFn: () => pondsRequest(accessToken)
  });

  const maintenanceQuery = useQuery({
    queryKey: ["operations", "maintenance-plan", statusFilter],
    queryFn: () => maintenancePlanRequest(accessToken, { status: statusFilter, limit: 180 })
  });

  const createTaskMutation = useMutation({
    mutationFn: (payload) => createMaintenanceTaskRequest(accessToken, payload),
    onSuccess: () => {
      setTaskForm((current) => ({
        ...current,
        title: "",
        description: ""
      }));
      queryClient.invalidateQueries({ queryKey: ["operations", "maintenance-plan"] });
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, payload }) => updateMaintenanceTaskRequest(accessToken, taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations", "maintenance-plan"] });
    }
  });

  const recommendations = maintenanceQuery.data?.recommendations || [];
  const tasks = maintenanceQuery.data?.tasks || [];

  const openTaskCount = useMemo(
    () => tasks.filter((task) => ["pending", "in_progress", "blocked"].includes(task.status)).length,
    [tasks]
  );

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!taskForm.title.trim()) {
      return;
    }

    createTaskMutation.mutate({
      pondId: taskForm.pondId ? Number(taskForm.pondId) : null,
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      priority: taskForm.priority,
      dueAt: toPayloadDate(taskForm.dueAt),
      source: "manual"
    });
  };

  const handleCreateRecommendation = (recommendation) => {
    createTaskMutation.mutate({
      pondId: recommendation.pondId,
      title: recommendation.suggestedTitle,
      description: recommendation.reason,
      priority: recommendation.priority,
      dueAt: recommendation.dueAt,
      source: "predictive"
    });
  };

  const handleStatusChange = (taskId, status) => {
    updateTaskMutation.mutate({
      taskId,
      payload: { status }
    });
  };

  return (
    <section className="module-page">
      <article className="panel">
        <h3>Plan de mantenimiento preventivo</h3>
        <p className="module-intro">
          Programa revisiones preventivas por piscina a partir del historial de mantenimiento y
          alertas abiertas para reducir fallos operativos y riesgos de interrupción.
        </p>
        <div className="filters-inline">
          <div>
            <label htmlFor="maintenanceStatusFilter">Estado de tareas</label>
            <select
              id="maintenanceStatusFilter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="module-inline-note">
          Tareas activas: {openTaskCount} | Recomendaciones pendientes: {recommendations.length}
        </p>
      </article>

      <div className="module-grid">
        <article className="panel">
          <h3>Generador de tareas sugeridas</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Piscina</th>
                  <th>Prioridad</th>
                  <th>Prob. fallo 7d</th>
                  <th>Ventana sugerida</th>
                  <th>Motivo</th>
                  <th>Último mantenimiento</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.length > 0 ? (
                  recommendations.map((item) => (
                    <tr key={`rec-${item.pondId}`}>
                      <td>{item.pondName}</td>
                      <td>
                        <span className={priorityClass(item.priority)}>{item.priority}</span>
                      </td>
                      <td>{item.predictedFailurePct}%</td>
                      <td>{item.recommendedWindowHours} h</td>
                      <td>{item.reason}</td>
                      <td>
                        {item.lastMaintenanceAt
                          ? new Date(item.lastMaintenanceAt).toLocaleString()
                          : "Sin registro"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => handleCreateRecommendation(item)}
                          disabled={createTaskMutation.isPending}
                        >
                          Crear tarea
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty-text">No hay recomendaciones para este filtro.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h3>Nueva tarea preventiva</h3>
          <form className="stack-form" onSubmit={handleSubmit}>
            <label htmlFor="maintenancePond">Piscina</label>
            <select
              id="maintenancePond"
              value={taskForm.pondId}
              onChange={(event) => setTaskForm((current) => ({ ...current, pondId: event.target.value }))}
            >
              <option value="">General</option>
              {(pondsQuery.data || []).map((pond) => (
                <option key={pond.id} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>

            <label htmlFor="maintenanceTitle">Título</label>
            <input
              id="maintenanceTitle"
              type="text"
              value={taskForm.title}
              onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Ej. Revisión de válvula y aireadores"
              required
            />

            <label htmlFor="maintenancePriority">Prioridad</label>
            <select
              id="maintenancePriority"
              value={taskForm.priority}
              onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>

            <label htmlFor="maintenanceDue">Fecha objetivo</label>
            <input
              id="maintenanceDue"
              type="datetime-local"
              value={taskForm.dueAt}
              onChange={(event) => setTaskForm((current) => ({ ...current, dueAt: event.target.value }))}
            />

            <label htmlFor="maintenanceDescription">Descripción</label>
            <textarea
              id="maintenanceDescription"
              rows={3}
              value={taskForm.description}
              onChange={(event) =>
                setTaskForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Checklist o detalle técnico"
            />

            <button type="submit" className="primary-button" disabled={createTaskMutation.isPending}>
              {createTaskMutation.isPending ? "Guardando..." : "Guardar tarea"}
            </button>
          </form>
        </article>
      </div>

      <article className="panel">
        <h3>Backlog de mantenimiento</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Piscina</th>
                <th>Título</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Vencimiento</th>
                <th>Acción rápida</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length > 0 ? (
                tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.id}</td>
                    <td>{task.pond_name || "General"}</td>
                    <td>{task.title}</td>
                    <td>
                      <span className={priorityClass(task.priority)}>{task.priority}</span>
                    </td>
                    <td>
                      <span className={statusClass(task.status)}>{task.status}</span>
                    </td>
                    <td>{task.due_at ? new Date(task.due_at).toLocaleString() : "-"}</td>
                    <td>
                      <div className="filters-inline">
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => handleStatusChange(task.id, "in_progress")}
                          disabled={updateTaskMutation.isPending || task.status === "in_progress"}
                        >
                          En curso
                        </button>
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => handleStatusChange(task.id, "done")}
                          disabled={updateTaskMutation.isPending || task.status === "done"}
                        >
                          Completar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty-text">No hay tareas registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
