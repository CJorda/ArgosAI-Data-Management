import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { alertsRequest, resolveAlertRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./AlertsPage.css";

export function AlertsPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");

  const alertsQuery = useQuery({
    queryKey: ["alerts", status],
    queryFn: () => alertsRequest(accessToken, status)
  });

  const resolveMutation = useMutation({
    mutationFn: (alertId) => resolveAlertRequest(accessToken, alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  return (
    <section className="alerts-page">
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
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {(alertsQuery.data || []).map((alert) => (
                <tr key={alert.id}>
                  <td>{new Date(alert.created_at).toLocaleString()}</td>
                  <td>{alert.pond_name}</td>
                  <td>{alert.sensor_name}</td>
                  <td>{alert.message}</td>
                  <td>{alert.severity}</td>
                  <td>{alert.status}</td>
                  <td>
                    {alert.status === "open" ? (
                      <button
                        type="button"
                        className="tiny-button"
                        onClick={() => resolveMutation.mutate(alert.id)}
                      >
                        Resolver
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
