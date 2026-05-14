import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  auditLogsRequest,
  planningGeneratedReportRequest,
  planningExecutiveReportRequest,
  planningReportAutomationStatusRequest,
  planningReportRunNowRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import { FEATURE_KEYS } from "../features/featureCatalog";
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

function buildTemplateReportCsv(templateReport) {
  const rows = [["seccion", "clave", "label", "valor"]];

  (templateReport?.highlights || []).forEach((item) => {
    rows.push(["highlight", item.key || "", item.label || "", item.value ?? ""]);
  });

  (templateReport?.sections || []).forEach((section) => {
    (section.rows || []).forEach((row) => {
      rows.push([
        section.key || section.title || "section",
        row.key || "",
        row.label || row.key || "",
        row.value ?? ""
      ]);
    });
  });

  (templateReport?.recommendations || []).forEach((item, index) => {
    rows.push(["recommendation", String(index + 1), `Recomendacion ${index + 1}`, item]);
  });

  return rows.map((row) => row.map(csvEscape).join(";")).join("\n");
}

function renderTemplateValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "-";
    }
  }

  return String(value);
}

export function CompliancePage() {
  const { accessToken, hasFeature } = useAuth();
  const queryClient = useQueryClient();
  const canUsePlanningReports = hasFeature(FEATURE_KEYS.PLANNING_VIEW);

  const [fromDate, setFromDate] = useState(toDateInput(new Date(Date.now() - 15 * 24 * 3600 * 1000)));
  const [toDate, setToDate] = useState(toDateInput());
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [limit, setLimit] = useState("250");
  const [reportTemplate, setReportTemplate] = useState("executive");

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
    enabled: canUsePlanningReports,
    queryFn: () => planningExecutiveReportRequest(accessToken, reportParams)
  });

  const templateReportQuery = useQuery({
    queryKey: ["planning", "generated-report", reportTemplate, reportParams],
    enabled: canUsePlanningReports,
    queryFn: () =>
      planningGeneratedReportRequest(accessToken, {
        ...reportParams,
        template: reportTemplate
      })
  });

  const reportAutomationStatusQuery = useQuery({
    queryKey: ["planning", "report-automation", "status"],
    enabled: canUsePlanningReports,
    queryFn: () => planningReportAutomationStatusRequest(accessToken)
  });

  const runManualReportMutation = useMutation({
    mutationFn: (payload) => planningReportRunNowRequest(accessToken, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning", "executive-report"] });
      queryClient.invalidateQueries({ queryKey: ["planning", "generated-report"] });
      queryClient.invalidateQueries({ queryKey: ["planning", "report-automation", "status"] });
      queryClient.invalidateQueries({ queryKey: ["operations", "audit"] });
    }
  });

  const rows = auditQuery.data?.rows || [];
  const executiveReport = executiveReportQuery.data;
  const templateReport = templateReportQuery.data;
  const schedulerStatus = reportAutomationStatusQuery.data?.scheduler || null;
  const recentReportRuns = reportAutomationStatusQuery.data?.recentRuns || [];

  const runReportNow = () => {
    if (!canUsePlanningReports) {
      return;
    }

    runManualReportMutation.mutate({
      from: reportParams.from,
      to: reportParams.to,
      frequency: schedulerStatus?.frequency || "daily",
      template: reportTemplate
    });
  };

  const downloadTemplateReportJson = () => {
    if (!templateReport) {
      return;
    }

    downloadBlob(
      JSON.stringify(templateReport, null, 2),
      "application/json;charset=utf-8",
      `informe-${reportTemplate}-${toDate}.json`
    );
  };

  const downloadTemplateReportCsv = () => {
    if (!templateReport) {
      return;
    }

    const csv = buildTemplateReportCsv(templateReport);
    downloadBlob(csv, "text/csv;charset=utf-8", `informe-${reportTemplate}-${toDate}.csv`);
  };

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

        {!canUsePlanningReports ? (
          <p className="empty-text">
            Tu perfil no tiene habilitado el modulo de planificacion para automatizar informes.
          </p>
        ) : (
          <>
            <div className="module-kpi-grid">
              <article className="module-kpi-card">
                <span>Scheduler</span>
                <strong>{schedulerStatus?.enabled ? "Activo" : "Desactivado"}</strong>
              </article>
              <article className="module-kpi-card">
                <span>Cadencia backend</span>
                <strong>{schedulerStatus?.frequency || "-"}</strong>
              </article>
              <article className="module-kpi-card">
                <span>Proxima corrida</span>
                <strong>
                  {schedulerStatus?.nextRunAt
                    ? new Date(schedulerStatus.nextRunAt).toLocaleString("es-ES")
                    : "-"}
                </strong>
              </article>
              <article className="module-kpi-card">
                <span>Corridas recientes</span>
                <strong>{recentReportRuns.length}</strong>
              </article>
            </div>

            <div className="filters-inline module-training-toolbar">
              <div>
                <label htmlFor="reportTemplate">Plantilla</label>
                <select
                  id="reportTemplate"
                  value={reportTemplate}
                  onChange={(event) => setReportTemplate(event.target.value)}
                >
                  <option value="executive">Ejecutivo</option>
                  <option value="operations">Operativo</option>
                  <option value="financial">Financiero</option>
                  <option value="compliance">Compliance</option>
                </select>
              </div>
              <button
                type="button"
                className="tiny-button"
                onClick={runReportNow}
                disabled={runManualReportMutation.isPending}
              >
                {runManualReportMutation.isPending ? "Ejecutando..." : "Ejecutar ahora"}
              </button>
              <button
                type="button"
                className="tiny-button"
                onClick={() => reportAutomationStatusQuery.refetch()}
                disabled={reportAutomationStatusQuery.isFetching}
              >
                {reportAutomationStatusQuery.isFetching ? "Actualizando scheduler..." : "Actualizar estado scheduler"}
              </button>
              <button
                type="button"
                className="tiny-button"
                onClick={() => executiveReportQuery.refetch()}
                disabled={executiveReportQuery.isFetching}
              >
                {executiveReportQuery.isFetching ? "Actualizando informe..." : "Actualizar informe"}
              </button>
              <button
                type="button"
                className="tiny-button"
                onClick={() => templateReportQuery.refetch()}
                disabled={templateReportQuery.isFetching}
              >
                {templateReportQuery.isFetching ? "Actualizando plantilla..." : "Actualizar plantilla"}
              </button>
              <button type="button" className="tiny-button" onClick={downloadExecutiveReportPdf} disabled={!executiveReport}>
                Descargar PDF
              </button>
              <button type="button" className="tiny-button" onClick={downloadExecutiveReportCsv} disabled={!executiveReport}>
                Descargar CSV
              </button>
              <button type="button" className="tiny-button" onClick={downloadExecutiveReport} disabled={!executiveReport}>
                Descargar JSON
              </button>
              <button type="button" className="tiny-button" onClick={downloadTemplateReportCsv} disabled={!templateReport}>
                CSV plantilla
              </button>
              <button type="button" className="tiny-button" onClick={downloadTemplateReportJson} disabled={!templateReport}>
                JSON plantilla
              </button>
            </div>

            {runManualReportMutation.data?.run ? (
              <p className="module-inline-note">
                Ultima ejecucion manual registrada: {new Date(runManualReportMutation.data.run.createdAt).toLocaleString("es-ES")}
                {` | Plantilla: ${runManualReportMutation.data.run.template || "executive"}`}
              </p>
            ) : null}

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
              </>
            ) : (
              <p className="empty-text">
                {executiveReportQuery.isFetching
                  ? "Generando informe ejecutivo..."
                  : "No se pudo generar el informe automático para este periodo."}
              </p>
            )}

            <h4 className="module-subtitle">Vista por plantilla: {templateReport?.templateLabel || "-"}</h4>
            {templateReport ? (
              <>
                <div className="module-kpi-grid">
                  {(templateReport.highlights || []).map((item) => (
                    <article className="module-kpi-card" key={item.key || item.label}>
                      <span>{item.label}</span>
                      <strong>{renderTemplateValue(item.value)}</strong>
                    </article>
                  ))}
                </div>

                {(templateReport.sections || []).map((section) => (
                  <div key={section.key || section.title} className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th colSpan={2}>{section.title}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(section.rows || []).map((row) => (
                          <tr key={`${section.key}-${row.key}`}>
                            <td>{row.label || row.key}</td>
                            <td>{renderTemplateValue(row.value)}</td>
                          </tr>
                        ))}
                        {(section.rows || []).length === 0 ? (
                          <tr>
                            <td colSpan={2} className="empty-text">Sin datos para esta sección.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ))}
              </>
            ) : (
              <p className="empty-text">
                {templateReportQuery.isFetching
                  ? "Generando vista por plantilla..."
                  : "No se pudo generar la plantilla seleccionada."}
              </p>
            )}

            <h4 className="module-subtitle">Historial de corridas automáticas</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Modo</th>
                    <th>Cadencia</th>
                    <th>Plantilla</th>
                    <th>Presión</th>
                    <th>Margen EUR</th>
                    <th>Recomendaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReportRuns.length > 0 ? (
                    recentReportRuns.map((run) => (
                      <tr key={run.id}>
                        <td>{new Date(run.generatedAt).toLocaleString("es-ES")}</td>
                        <td>{run.mode}</td>
                        <td>{run.frequency || "-"}</td>
                        <td>{run.template || "executive"}</td>
                        <td>{run.kpis?.operationalPressureScore ?? "-"}</td>
                        <td>
                          {run.economics?.projectedMarginEur !== undefined
                            ? Number(run.economics.projectedMarginEur).toLocaleString("es-ES")
                            : "-"}
                        </td>
                        <td>{(run.recommendations || []).length}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="empty-text">No hay corridas registradas todavía.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
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
