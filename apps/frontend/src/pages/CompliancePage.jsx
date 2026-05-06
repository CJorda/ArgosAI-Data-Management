import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditLogsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./OperationsModulesPage.css";

function toDateInput(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function safeJsonPreview(payload) {
  if (!payload) {
    return "{}";
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "{}";
  }
}

export function CompliancePage() {
  const { accessToken } = useAuth();

  const [fromDate, setFromDate] = useState(toDateInput(new Date(Date.now() - 15 * 24 * 3600 * 1000)));
  const [toDate, setToDate] = useState(toDateInput());
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [limit, setLimit] = useState("250");

  const queryParams = useMemo(
    () => ({
      from: new Date(`${fromDate}T00:00:00`).toISOString(),
      to: new Date(`${toDate}T23:59:59`).toISOString(),
      action: actionFilter.trim() || undefined,
      entity: entityFilter.trim() || undefined,
      limit: Number(limit) || 250
    }),
    [fromDate, toDate, actionFilter, entityFilter, limit]
  );

  const auditQuery = useQuery({
    queryKey: ["operations", "audit", queryParams],
    queryFn: () => auditLogsRequest(accessToken, queryParams)
  });

  const rows = auditQuery.data?.rows || [];

  return (
    <section className="module-page">
      <article className="panel">
        <h3>Auditoría y compliance</h3>
        <p className="module-intro">
          Consolida bitácora auditable de acciones operativas para inspección interna, cumplimiento
          normativo y análisis de responsabilidades por usuario/entidad.
        </p>

        <div className="filters-inline">
          <div>
            <label htmlFor="auditFrom">Desde</label>
            <input
              id="auditFrom"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="auditTo">Hasta</label>
            <input id="auditTo" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </div>

          <div>
            <label htmlFor="auditAction">Acción</label>
            <input
              id="auditAction"
              type="text"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              placeholder="Ej. inventory.movement.create"
            />
          </div>

          <div>
            <label htmlFor="auditEntity">Entidad</label>
            <input
              id="auditEntity"
              type="text"
              value={entityFilter}
              onChange={(event) => setEntityFilter(event.target.value)}
              placeholder="Ej. harvest_plans"
            />
          </div>

          <div>
            <label htmlFor="auditLimit">Límite</label>
            <input
              id="auditLimit"
              type="number"
              min="50"
              max="600"
              step="10"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </div>
        </div>

        <p className="module-inline-note">Registros encontrados: {rows.length}</p>
      </article>

      <article className="panel">
        <h3>Registro de actividad</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Id entidad</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>{row.user_name || row.user_email || "Sistema"}</td>
                    <td>
                      <span className="module-pill module-pill-status-in_progress">{row.action}</span>
                    </td>
                    <td>{row.entity}</td>
                    <td>{row.entity_id || "-"}</td>
                    <td>
                      <pre className="module-audit-payload">{safeJsonPreview(row.payload)}</pre>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-text">No hay registros para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
