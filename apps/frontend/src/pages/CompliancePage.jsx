import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { auditLogsRequest, planningExecutiveReportRequest } from "../api/services";
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

function downloadBlob(content, mimeType, fileName) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildExecutiveReportCsv(executiveReport) {
  const economics = executiveReport?.report?.economics || {};
  const rows = [
    ["seccion", "metrica", "valor"],
    ["kpi", "operationalPressureScore", executiveReport?.kpis?.operationalPressureScore ?? 0],
    ["kpi", "openAlerts", executiveReport?.kpis?.openAlerts ?? 0],
    ["kpi", "severeOpenAlerts", executiveReport?.kpis?.severeOpenAlerts ?? 0],
    ["kpi", "openMaintenanceTasks", executiveReport?.kpis?.openMaintenanceTasks ?? 0],
    ["economics", "currentBiomassKg", economics.currentBiomassKg ?? 0],
    ["economics", "projectedCostEur", economics.projectedCostEur ?? 0],
    ["economics", "projectedRevenueEur", economics.projectedRevenueEur ?? 0],
    ["economics", "projectedMarginEur", economics.projectedMarginEur ?? 0],
    ["economics", "projectedMarginPct", economics.projectedMarginPct ?? ""],
    ["period", "from", executiveReport?.period?.from || ""],
    ["period", "to", executiveReport?.period?.to || ""]
  ];

  (executiveReport?.recommendations || []).forEach((item, index) => {
    rows.push(["recommendation", String(index + 1), item]);
  });

  return rows.map((row) => row.map(csvEscape).join(";")).join("\n");
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

  const reportParams = useMemo(
    () => ({
      from: new Date(`${fromDate}T00:00:00`).toISOString(),
      to: new Date(`${toDate}T23:59:59`).toISOString()
    }),
    [fromDate, toDate]
  );

  const auditQuery = useQuery({
    queryKey: ["operations", "audit", queryParams],
    queryFn: () => auditLogsRequest(accessToken, queryParams)
  });

  const executiveReportQuery = useQuery({
    queryKey: ["planning", "executive-report", reportParams],
    queryFn: () => planningExecutiveReportRequest(accessToken, reportParams)
  });

  const rows = auditQuery.data?.rows || [];
  const executiveReport = executiveReportQuery.data;

  const downloadExecutiveReport = () => {
    if (!executiveReport) {
      return;
    }

    downloadBlob(
      JSON.stringify(executiveReport, null, 2),
      "application/json;charset=utf-8",
      `informe-ejecutivo-${toDate}.json`
    );
  };

  const downloadExecutiveReportCsv = () => {
    if (!executiveReport) {
      return;
    }

    const csv = buildExecutiveReportCsv(executiveReport);
    downloadBlob(csv, "text/csv;charset=utf-8", `informe-ejecutivo-${toDate}.csv`);
  };

  const downloadExecutiveReportPdf = () => {
    if (!executiveReport) {
      return;
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    doc.setFillColor(16, 48, 86);
    doc.rect(0, 0, 210, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Informe ejecutivo automático", 14, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text(`Periodo: ${fromDate} a ${toDate}`, 14, 20);

    doc.setTextColor(30, 52, 82);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(`Generado: ${new Date(executiveReport.generatedAt).toLocaleString("es-ES")}`, 14, 33);

    autoTable(doc, {
      startY: 38,
      head: [["Indicador", "Valor"]],
      body: [
        ["Presión operativa", executiveReport.kpis?.operationalPressureScore ?? 0],
        ["Alertas abiertas", executiveReport.kpis?.openAlerts ?? 0],
        ["Alertas severas", executiveReport.kpis?.severeOpenAlerts ?? 0],
        ["Tareas mantenimiento abiertas", executiveReport.kpis?.openMaintenanceTasks ?? 0],
        ["Margen proyectado EUR", executiveReport.report?.economics?.projectedMarginEur ?? 0],
        ["Margen proyectado %", executiveReport.report?.economics?.projectedMarginPct ?? "-"]
      ],
      styles: {
        fontSize: 10,
        cellPadding: 2.8,
        textColor: [40, 58, 84],
        lineColor: [213, 225, 241],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [18, 88, 144],
        textColor: [255, 255, 255],
        fontStyle: "bold"
      },
      columnStyles: {
        0: { cellWidth: 96 },
        1: { cellWidth: 84 }
      }
    });

    const recommendations = executiveReport.recommendations || [];
    autoTable(doc, {
      startY: (doc.lastAutoTable?.finalY || 80) + 8,
      head: [["#", "Recomendación"]],
      body: recommendations.length > 0
        ? recommendations.map((item, index) => [index + 1, item])
        : [["-", "Sin recomendaciones generadas para este periodo"]],
      styles: {
        fontSize: 10,
        cellPadding: 2.6,
        textColor: [40, 58, 84],
        lineColor: [213, 225, 241],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [227, 238, 252],
        textColor: [29, 70, 110],
        fontStyle: "bold"
      },
      columnStyles: {
        0: { cellWidth: 14, halign: "center" },
        1: { cellWidth: 166 }
      }
    });

    doc.save(`informe-ejecutivo-${toDate}.pdf`);
  };

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
        <h3>Informe ejecutivo automático</h3>
        <p className="module-intro">
          Resumen operacional multi-módulo con riesgo, mantenimiento, logística y margen proyectado
          para revisión de dirección y cumplimiento.
        </p>

        {executiveReport ? (
          <>
            <div className="module-kpi-grid">
              <article className="module-kpi-card">
                <span>Presión operativa</span>
                <strong>{executiveReport.kpis?.operationalPressureScore ?? 0}</strong>
              </article>
              <article className="module-kpi-card">
                <span>Alertas abiertas</span>
                <strong>{executiveReport.kpis?.openAlerts ?? 0}</strong>
              </article>
              <article className="module-kpi-card">
                <span>Mantenimiento abierto</span>
                <strong>{executiveReport.kpis?.openMaintenanceTasks ?? 0}</strong>
              </article>
              <article className="module-kpi-card">
                <span>Margen proyectado</span>
                <strong>
                  {(executiveReport.report?.economics?.projectedMarginEur ?? 0).toLocaleString("es-ES")} EUR
                </strong>
              </article>
            </div>

            <p className="module-inline-note">
              Cadencia sugerida: {executiveReport.cadenceSuggestion?.frequency || "daily"}
              {executiveReport.cadenceSuggestion?.nextRunAt
                ? ` | Próxima ejecución sugerida: ${new Date(executiveReport.cadenceSuggestion.nextRunAt).toLocaleString()}`
                : ""}
            </p>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Recomendación</th>
                  </tr>
                </thead>
                <tbody>
                  {(executiveReport.recommendations || []).map((item, index) => (
                    <tr key={`rec-${index + 1}`}>
                      <td>{index + 1}</td>
                      <td>{item}</td>
                    </tr>
                  ))}
                  {(executiveReport.recommendations || []).length === 0 ? (
                    <tr>
                      <td colSpan={2} className="empty-text">No hay recomendaciones generadas.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="filters-inline">
              <button
                type="button"
                className="tiny-button"
                onClick={() => executiveReportQuery.refetch()}
                disabled={executiveReportQuery.isFetching}
              >
                {executiveReportQuery.isFetching ? "Actualizando..." : "Actualizar informe"}
              </button>
              <button type="button" className="tiny-button" onClick={downloadExecutiveReportPdf}>
                Descargar PDF
              </button>
              <button type="button" className="tiny-button" onClick={downloadExecutiveReportCsv}>
                Descargar CSV
              </button>
              <button type="button" className="tiny-button" onClick={downloadExecutiveReport}>
                Descargar JSON
              </button>
            </div>
          </>
        ) : (
          <p className="empty-text">
            {executiveReportQuery.isFetching
              ? "Generando informe ejecutivo..."
              : "No se pudo generar el informe automático para este periodo."}
          </p>
        )}
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
