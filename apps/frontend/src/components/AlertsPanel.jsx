import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resolveAlertRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import { useRealtimeStore } from "../store/realtimeStore";
import "./AlertsPanel.css";

function formatDate(value) {
  return new Date(value).toLocaleString();
}

export function AlertsPanel({ isOpen, onClose }) {
  const { accessToken } = useAuth();
  const alerts = useRealtimeStore((state) => state.openAlerts);
  const queryClient = useQueryClient();

  const resolveMutation = useMutation({
    mutationFn: (alertId) => resolveAlertRequest(accessToken, alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  return (
    <aside className={`alerts-panel ${isOpen ? "alerts-panel-open" : ""}`} aria-hidden={!isOpen}>
      <div className="panel-header">
        <h3>Alertas Abiertas</h3>
        <div className="panel-header-actions">
          <span>{alerts.length}</span>
          <button
            type="button"
            className="alerts-close-button"
            onClick={onClose}
            aria-label="Cerrar panel de alertas"
          >
            x
          </button>
        </div>
      </div>

      <div className="panel-list">
        {alerts.length === 0 ? <p className="empty-text">No hay alertas activas.</p> : null}

        {alerts.map((alert) => (
          <article key={alert.id} className="alert-card">
            <div className="alert-main">
              <strong>{alert.severity}</strong>
              <p>{alert.message}</p>
              <small>{formatDate(alert.created_at)}</small>
            </div>
            <button
              type="button"
              className="tiny-button"
              onClick={() => resolveMutation.mutate(alert.id)}
            >
              Resolver
            </button>
          </article>
        ))}
      </div>
    </aside>
  );
}
