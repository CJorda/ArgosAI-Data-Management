import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  historyReadingsRequest,
  sensorsRequest,
  waterFlowOverviewRequest,
  waterQualityEmailReportRequest
} from "../api/services";
import {
  REPORT_EMAIL_TEMPLATES,
  applyEmailTemplate,
  resolveReportEmailTemplate
} from "../config/reportEmailTemplates";
import { useAuth } from "../context/AuthContext";
import "./CheDataDeliveryPage.css";

const cheWaterQualityTypes = new Set([
  "oxygen",
  "temperature",
  "ph",
  "salinity",
  "turbidity",
  "conductivity"
]);

const cheTypeLabels = {
  oxygen: "Oxigeno",
  temperature: "Temperatura",
  ph: "pH",
  salinity: "Salinidad",
  turbidity: "Turbidez",
  conductivity: "Conductividad"
};

const cheBucketLabels = {
  auto: "Automatico",
  hour: "Por hora",
  day: "Por dia"
};

const cheFormatOptions = [
  {
    value: "xlsx",
    label: "Excel (.xlsx)",
    extension: "xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  },
  {
    value: "csv",
    label: "CSV (.csv)",
    extension: "csv",
    mimeType: "text/csv"
  },
  {
    value: "json",
    label: "JSON (.json)",
    extension: "json",
    mimeType: "application/json"
  }
];

const defaultCheTimes = "08:00,15:00,20:00";

function toDateInput(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatFileTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}`;
}

function parseRecipientEmails(rawValue) {
  return Array.from(
    new Set(
      String(rawValue || "")
        .split(/[;,\s]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function normalizeDailyTimeToken(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDailyScheduleTimes(rawValue) {
  const tokens = String(rawValue || "")
    .split(/[\s,;]+/)
    .map((item) => normalizeDailyTimeToken(item))
    .filter(Boolean);

  return Array.from(new Set(tokens));
}

function resolveDateRange(fromDateValue, toDateValue) {
  const fromDate = new Date(`${fromDateValue}T00:00:00`);
  const toDate = new Date(`${toDateValue}T23:59:59.999`);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error("Selecciona un rango de fechas valido.");
  }

  if (toDate.getTime() < fromDate.getTime()) {
    throw new Error("La fecha fin debe ser mayor o igual que la fecha inicio.");
  }

  return {
    fromDate,
    toDate,
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString()
  };
}

function toFiniteNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(3)) : null;
}

function csvEscape(value) {
  const normalized = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function buildCsvFromRows(rows, headers) {
  const headerLine = headers.map((header) => csvEscape(header)).join(",");
  const bodyLines = rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","));
  return [headerLine, ...bodyLines].join("\n");
}

function toArrayBufferFromString(value) {
  return new TextEncoder().encode(String(value || "")).buffer;
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return window.btoa(binary);
}

function downloadBlobFile(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

function flowWindowHours(fromDate, toDate) {
  const elapsedHours = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 3_600_000));
  if (elapsedHours <= 24) {
    return 24;
  }
  if (elapsedHours <= 48) {
    return 48;
  }
  if (elapsedHours <= 72) {
    return 72;
  }

  return 168;
}

export function CheDataDeliveryPage() {
  const { accessToken, user } = useAuth();
  const schedulerKeyRef = useRef("");

  const [fromDate, setFromDate] = useState(() => {
    const from = new Date();
    from.setDate(from.getDate() - 1);
    return toDateInput(from);
  });
  const [toDate, setToDate] = useState(() => toDateInput(new Date()));
  const [bucket, setBucket] = useState("hour");
  const [format, setFormat] = useState("xlsx");
  const [deliveryMode, setDeliveryMode] = useState("email");
  const [recipientEmails, setRecipientEmails] = useState(user?.email || "");
  const [includeWaterQuality, setIncludeWaterQuality] = useState(true);
  const [includeWaterFlow, setIncludeWaterFlow] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("cumplimiento-che");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTimesText, setScheduleTimesText] = useState(defaultCheTimes);
  const [lastScheduledAt, setLastScheduledAt] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState({
    tone: "info",
    message: "Configura rango, datasets y destinatarios para enviar a CHE."
  });
  const [history, setHistory] = useState([]);

  const sensorsQuery = useQuery({
    queryKey: ["sensors", "che-delivery"],
    queryFn: () => sensorsRequest(accessToken)
  });

  const waterQualitySensors = useMemo(
    () =>
      (sensorsQuery.data || []).filter((sensor) =>
        cheWaterQualityTypes.has(String(sensor.type || "").toLowerCase())
      ),
    [sensorsQuery.data]
  );

  const selectedFormat = useMemo(
    () => cheFormatOptions.find((option) => option.value === format) || cheFormatOptions[0],
    [format]
  );

  const recipients = useMemo(() => parseRecipientEmails(recipientEmails), [recipientEmails]);
  const selectedTemplate = useMemo(
    () => resolveReportEmailTemplate(selectedTemplateId),
    [selectedTemplateId]
  );
  const scheduleTimes = useMemo(() => parseDailyScheduleTimes(scheduleTimesText), [scheduleTimesText]);

  const applyTemplateToDraft = () => {
    const templateContext = {
      fromDate,
      toDate,
      bucket: cheBucketLabels[bucket] || "Automatico",
      format: selectedFormat.label,
      rowCount: "n/d",
      sensorCount: waterQualitySensors.length,
      generatedAt: new Date().toLocaleString("es-ES"),
      requestedBy: user?.email || "usuario"
    };

    setSubjectDraft(applyEmailTemplate(selectedTemplate.subjectTemplate, templateContext));
    setMessageDraft(applyEmailTemplate(selectedTemplate.bodyTemplate, templateContext));
  };

  const sendCheDataset = useCallback(
    async ({ trigger = "manual" } = {}) => {
      if (isSending) {
        return;
      }

      const shouldEmail = deliveryMode === "email" || deliveryMode === "both";
      const shouldDownload = deliveryMode === "download" || deliveryMode === "both";

      setIsSending(true);
      setFeedback({
        tone: "info",
        message: trigger === "scheduled" ? "Ejecutando envio programado a CHE..." : "Preparando envio a CHE..."
      });

      try {
        if (!includeWaterQuality && !includeWaterFlow) {
          throw new Error("Activa al menos un dataset para enviar (calidad o caudal).");
        }

        if (shouldEmail && recipients.length === 0) {
          throw new Error("Indica al menos un destinatario para envio por correo.");
        }

        const { fromDate: fromDt, toDate: toDt, fromIso, toIso } = resolveDateRange(fromDate, toDate);

        let qualityRows = [];
        let qualitySensorErrors = 0;

        if (includeWaterQuality) {
          const responses = await Promise.allSettled(
            waterQualitySensors.map((sensor) =>
              historyReadingsRequest(accessToken, {
                sensorId: sensor.id,
                from: fromIso,
                to: toIso,
                bucket
              })
            )
          );

          for (let index = 0; index < responses.length; index += 1) {
            const response = responses[index];
            const sensor = waterQualitySensors[index];

            if (response.status !== "fulfilled") {
              qualitySensorErrors += 1;
              continue;
            }

            const payload = response.value || {};
            const sensorType = String(sensor.type || payload.sensor?.type || "").toLowerCase();

            for (const point of payload.series || []) {
              const bucketDate = point.bucket_start ? new Date(point.bucket_start) : null;
              const bucketIso =
                bucketDate && !Number.isNaN(bucketDate.getTime()) ? bucketDate.toISOString() : "";

              qualityRows.push({
                Fecha: bucketIso ? new Date(bucketIso).toLocaleString("es-ES") : "",
                Piscina: sensor.pond_name || `Piscina ${sensor.pond_id || "-"}`,
                Sensor: sensor.name || `Sensor ${sensor.id}`,
                Parametro: cheTypeLabels[sensorType] || sensorType || "Sensor",
                Unidad: sensor.unit || payload.sensor?.unit || "",
                Bucket: cheBucketLabels[payload.bucket] || cheBucketLabels[bucket] || "Automatico",
                Promedio: toFiniteNumberOrNull(point.avg_value),
                Minimo: toFiniteNumberOrNull(point.min_value),
                Maximo: toFiniteNumberOrNull(point.max_value),
                Muestras: Number(point.samples) || 0
              });
            }
          }
        }

        let flowRows = [];
        let flowSummary = null;

        if (includeWaterFlow) {
          const requestedHours = flowWindowHours(fromDt, toDt);
          const flowOverview = await waterFlowOverviewRequest(accessToken, {
            hours: requestedHours,
            year: toDt.getFullYear()
          });

          flowRows = (flowOverview.hourlySeries || []).map((point) => ({
            Timestamp: point.timestamp ? new Date(point.timestamp).toLocaleString("es-ES") : "",
            EntranteM3h: toFiniteNumberOrNull(point.incomingCalibrated),
            SalienteM3h: toFiniteNumberOrNull(point.outgoingCalibrated),
            RecirculadoM3h: toFiniteNumberOrNull(point.recirculatedCalibrated),
            BalanceNetoM3h: toFiniteNumberOrNull(point.netPlantBalance),
            CalidadVertidoPct: toFiniteNumberOrNull(point.dischargeQualityPct)
          }));

          const yearlyRows = flowOverview.yearlyRows || [];
          const annualIncoming = yearlyRows.reduce(
            (acc, item) => acc + (Number(item.incomingM3) || 0),
            0
          );
          const annualOutgoing = yearlyRows.reduce(
            (acc, item) => acc + (Number(item.outgoingM3) || 0),
            0
          );

          flowSummary = {
            requestedHours,
            annualIncomingM3: toFiniteNumberOrNull(annualIncoming),
            annualOutgoingM3: toFiniteNumberOrNull(annualOutgoing),
            openAlerts: (flowOverview.alerts || []).length
          };
        }

        if (qualityRows.length === 0 && flowRows.length === 0) {
          throw new Error("No hay datos disponibles para el rango seleccionado.");
        }

        const summaryRows = [
          ["Exportado en", new Date().toLocaleString("es-ES")],
          ["Rango desde", fromDt.toLocaleString("es-ES")],
          ["Rango hasta", toDt.toLocaleString("es-ES")],
          ["Agrupacion", cheBucketLabels[bucket] || "Automatico"],
          ["Formato", selectedFormat.label],
          ["Incluye calidad", includeWaterQuality ? "Si" : "No"],
          ["Incluye caudal", includeWaterFlow ? "Si" : "No"],
          ["Filas calidad", qualityRows.length],
          ["Filas caudal", flowRows.length],
          ["Errores sensores calidad", qualitySensorErrors]
        ];

        if (flowSummary) {
          summaryRows.push(["Caudal anual entrante (m3)", flowSummary.annualIncomingM3 ?? "--"]);
          summaryRows.push(["Caudal anual saliente (m3)", flowSummary.annualOutgoingM3 ?? "--"]);
          summaryRows.push(["Alertas caudal abiertas", flowSummary.openAlerts ?? 0]);
        }

        const fileBase = `che-entrega-${formatFileTimestamp(fromDt)}-${formatFileTimestamp(toDt)}`;
        const fileName = `${fileBase}.${selectedFormat.extension}`;
        let attachmentBuffer = null;

        if (selectedFormat.value === "xlsx") {
          const XLSX = await import("xlsx");
          const workbook = XLSX.utils.book_new();

          if (qualityRows.length > 0) {
            const qualityHeaders = [
              "Fecha",
              "Piscina",
              "Sensor",
              "Parametro",
              "Unidad",
              "Bucket",
              "Promedio",
              "Minimo",
              "Maximo",
              "Muestras"
            ];
            const qualitySheet = XLSX.utils.json_to_sheet(qualityRows, { header: qualityHeaders });
            XLSX.utils.book_append_sheet(workbook, qualitySheet, "CalidadAgua");
          }

          if (flowRows.length > 0) {
            const flowHeaders = [
              "Timestamp",
              "EntranteM3h",
              "SalienteM3h",
              "RecirculadoM3h",
              "BalanceNetoM3h",
              "CalidadVertidoPct"
            ];
            const flowSheet = XLSX.utils.json_to_sheet(flowRows, { header: flowHeaders });
            XLSX.utils.book_append_sheet(workbook, flowSheet, "Caudal");
          }

          const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
          XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");

          if (shouldDownload) {
            XLSX.writeFile(workbook, fileName);
          }

          if (shouldEmail) {
            attachmentBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
          }
        } else if (selectedFormat.value === "csv") {
          const sections = [];

          if (qualityRows.length > 0) {
            sections.push("# Calidad de agua");
            sections.push(
              buildCsvFromRows(qualityRows, [
                "Fecha",
                "Piscina",
                "Sensor",
                "Parametro",
                "Unidad",
                "Bucket",
                "Promedio",
                "Minimo",
                "Maximo",
                "Muestras"
              ])
            );
            sections.push("");
          }

          if (flowRows.length > 0) {
            sections.push("# Caudal");
            sections.push(
              buildCsvFromRows(flowRows, [
                "Timestamp",
                "EntranteM3h",
                "SalienteM3h",
                "RecirculadoM3h",
                "BalanceNetoM3h",
                "CalidadVertidoPct"
              ])
            );
            sections.push("");
          }

          sections.push("# Resumen");
          sections.push(buildCsvFromRows(summaryRows.map(([clave, valor]) => ({ Clave: clave, Valor: valor })), ["Clave", "Valor"]));

          const csvText = sections.join("\n");

          if (shouldDownload) {
            downloadBlobFile(new Blob([csvText], { type: "text/csv;charset=utf-8;" }), fileName);
          }

          if (shouldEmail) {
            attachmentBuffer = toArrayBufferFromString(csvText);
          }
        } else {
          const payload = {
            generatedAt: new Date().toISOString(),
            from: fromDt.toISOString(),
            to: toDt.toISOString(),
            bucket,
            includeWaterQuality,
            includeWaterFlow,
            summary: Object.fromEntries(summaryRows.map((item) => [item[0], item[1]])),
            waterQualityRows: qualityRows,
            waterFlowRows: flowRows,
            waterFlowSummary: flowSummary
          };
          const jsonText = JSON.stringify(payload, null, 2);

          if (shouldDownload) {
            downloadBlobFile(new Blob([jsonText], { type: "application/json;charset=utf-8;" }), fileName);
          }

          if (shouldEmail) {
            attachmentBuffer = toArrayBufferFromString(jsonText);
          }
        }

        if (shouldEmail) {
          if (!attachmentBuffer || attachmentBuffer.byteLength === 0) {
            throw new Error("No se pudo construir el adjunto para CHE.");
          }

          if (attachmentBuffer.byteLength > 8 * 1024 * 1024) {
            throw new Error("El adjunto supera 8 MB. Reduce el rango o el formato.");
          }

          const totalRows = qualityRows.length + flowRows.length;
          const templateContext = {
            fromDate,
            toDate,
            bucket: cheBucketLabels[bucket] || "Automatico",
            format: selectedFormat.label,
            rowCount: totalRows,
            sensorCount: includeWaterQuality ? waterQualitySensors.length : 0,
            generatedAt: new Date().toLocaleString("es-ES"),
            requestedBy: user?.email || "usuario"
          };

          await waterQualityEmailReportRequest(accessToken, {
            recipients,
            from: fromDt.toISOString(),
            to: toDt.toISOString(),
            bucket,
            fileName,
            attachmentBase64: arrayBufferToBase64(attachmentBuffer),
            mimeType: selectedFormat.mimeType,
            subject: subjectDraft.trim() || applyEmailTemplate(selectedTemplate.subjectTemplate, templateContext),
            message: messageDraft.trim() || applyEmailTemplate(selectedTemplate.bodyTemplate, templateContext)
          });
        }

        if (trigger === "scheduled") {
          setLastScheduledAt(new Date().toISOString());
        }

        setHistory((current) => {
          const next = {
            id: `che-${Date.now()}`,
            at: new Date().toISOString(),
            trigger,
            format: selectedFormat.value,
            deliveryMode,
            rows: qualityRows.length + flowRows.length,
            recipients: shouldEmail ? recipients.length : 0,
            templateId: shouldEmail ? selectedTemplate.id : null
          };

          return [next, ...current].slice(0, 20);
        });

        setFeedback({
          tone: "success",
          message: shouldEmail && shouldDownload
            ? `Entrega a CHE completada: correo + descarga (${selectedFormat.label}).`
            : shouldEmail
              ? `Entrega a CHE enviada por correo (${recipients.length} destinatario/s).`
              : `Entrega a CHE descargada localmente (${selectedFormat.label}).`
        });
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "No se pudo completar el envio a CHE."
        });
      } finally {
        setIsSending(false);
      }
    },
    [
      accessToken,
      bucket,
      deliveryMode,
      format,
      fromDate,
      includeWaterFlow,
      includeWaterQuality,
      isSending,
      messageDraft,
      recipients,
      selectedFormat,
      selectedTemplate,
      subjectDraft,
      toDate,
      user?.email,
      waterQualitySensors
    ]
  );

  useEffect(() => {
    if (!scheduleEnabled) {
      schedulerKeyRef.current = "";
      return undefined;
    }

    if (scheduleTimes.length === 0) {
      return undefined;
    }

    const requiresRecipients = deliveryMode === "email" || deliveryMode === "both";
    if (requiresRecipients && recipients.length === 0) {
      return undefined;
    }

    const tick = () => {
      const now = new Date();
      const timeToken = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      if (!scheduleTimes.includes(timeToken)) {
        return;
      }

      const runKey = `${toDateInput(now)} ${timeToken}`;
      if (schedulerKeyRef.current === runKey) {
        return;
      }

      schedulerKeyRef.current = runKey;
      void sendCheDataset({ trigger: "scheduled" });
    };

    tick();
    const timerId = window.setInterval(tick, 30_000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [deliveryMode, recipients, scheduleEnabled, scheduleTimes, sendCheDataset]);

  return (
    <section className="che-page">
      <article className="panel che-panel">
        <header className="che-head">
          <h3>Subseccion: envio de datos a CHE</h3>
          <p>
            Prepara y remite datasets de calidad de agua y caudal entrante/saliente con plantillas
            de correo, formatos multiples y programacion por horas fijas.
          </p>
        </header>

        <div className="che-controls">
          <label className="che-field">
            <span>Fecha inicio</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>

          <label className="che-field">
            <span>Fecha fin</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>

          <label className="che-field">
            <span>Agrupacion calidad</span>
            <select value={bucket} onChange={(event) => setBucket(event.target.value)}>
              <option value="auto">Automatico</option>
              <option value="hour">Por hora</option>
              <option value="day">Por dia</option>
            </select>
          </label>

          <label className="che-field">
            <span>Formato</span>
            <select value={format} onChange={(event) => setFormat(event.target.value)}>
              {cheFormatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="che-field">
            <span>Destino</span>
            <select value={deliveryMode} onChange={(event) => setDeliveryMode(event.target.value)}>
              <option value="email">Correo CHE</option>
              <option value="both">Correo + descarga</option>
              <option value="download">Solo descarga local</option>
            </select>
          </label>

          <label className="che-field">
            <span>Plantilla</span>
            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
              {REPORT_EMAIL_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(deliveryMode === "email" || deliveryMode === "both") ? (
          <label className="che-field che-field-wide">
            <span>Destinatarios</span>
            <input
              type="text"
              value={recipientEmails}
              onChange={(event) => setRecipientEmails(event.target.value)}
              placeholder="che@organismo.es, tecnicos@confederacion.es"
            />
          </label>
        ) : null}

        <div className="che-toggles">
          <label>
            <input
              type="checkbox"
              checked={includeWaterQuality}
              onChange={(event) => setIncludeWaterQuality(event.target.checked)}
            />
            <span>Incluir calidad de agua</span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={includeWaterFlow}
              onChange={(event) => setIncludeWaterFlow(event.target.checked)}
            />
            <span>Incluir caudal entrante/saliente</span>
          </label>
        </div>

        {(deliveryMode === "email" || deliveryMode === "both") ? (
          <div className="che-email-panel">
            <div className="che-email-head">
              <h4>Contenido del correo</h4>
              <button type="button" className="che-inline-btn" onClick={applyTemplateToDraft}>
                Aplicar plantilla
              </button>
            </div>

            <label className="che-field">
              <span>Asunto (opcional)</span>
              <input
                type="text"
                value={subjectDraft}
                onChange={(event) => setSubjectDraft(event.target.value)}
                placeholder="Si esta vacio, se usa plantilla"
              />
            </label>

            <label className="che-field">
              <span>Mensaje (opcional)</span>
              <textarea
                rows={5}
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                placeholder="Si esta vacio, se usa plantilla"
              />
            </label>

            <p className="che-help">
              Variables disponibles: &#123;&#123;fromDate&#125;&#125;, &#123;&#123;toDate&#125;&#125;, &#123;&#123;bucket&#125;&#125;,
              &#123;&#123;format&#125;&#125;, &#123;&#123;sensorCount&#125;&#125;, &#123;&#123;rowCount&#125;&#125;,
              &#123;&#123;generatedAt&#125;&#125;, &#123;&#123;requestedBy&#125;&#125;.
            </p>
          </div>
        ) : null}

        <div className="che-scheduler">
          <label className="che-toggle">
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(event) => setScheduleEnabled(event.target.checked)}
            />
            <span>Programacion por horas fijas</span>
          </label>

          <label className="che-field che-field-wide">
            <span>Horas (HH:mm)</span>
            <input
              type="text"
              value={scheduleTimesText}
              onChange={(event) => setScheduleTimesText(event.target.value)}
              disabled={!scheduleEnabled}
              placeholder="08:00,15:00,20:00"
            />
          </label>

          <button
            type="button"
            className="che-inline-btn"
            onClick={() => setScheduleTimesText(defaultCheTimes)}
          >
            Cargar 08:00, 15:00, 20:00
          </button>
        </div>

        <div className="che-actions">
          <button
            type="button"
            className="che-run-btn"
            onClick={() => {
              void sendCheDataset({ trigger: "manual" });
            }}
            disabled={
              isSending
              || sensorsQuery.isLoading
              || ((deliveryMode === "email" || deliveryMode === "both") && recipients.length === 0)
            }
          >
            {isSending ? "Procesando..." : "Enviar ahora"}
          </button>

          <button
            type="button"
            className="che-run-btn che-run-btn-secondary"
            onClick={() => {
              void sendCheDataset({ trigger: "scheduled" });
            }}
            disabled={
              isSending
              || ((deliveryMode === "email" || deliveryMode === "both") && recipients.length === 0)
            }
          >
            Ejecutar como programado
          </button>
        </div>

        <p className="che-note">
          Sensores de calidad disponibles: {waterQualitySensors.length}. Horas programadas:
          {scheduleTimes.length > 0 ? ` ${scheduleTimes.join(", ")}` : " ninguna valida"}.
          {lastScheduledAt ? ` Ultima ejecucion automatica: ${new Date(lastScheduledAt).toLocaleString("es-ES")}.` : ""}
        </p>

        <p className={`che-feedback che-feedback-${feedback.tone}`}>{feedback.message}</p>

        {history.length > 0 ? (
          <div className="che-history">
            <h4>Ultimos envios</h4>
            <ul>
              {history.slice(0, 8).map((entry) => (
                <li key={entry.id}>
                  <strong>{new Date(entry.at).toLocaleString("es-ES")}</strong>
                  <span>
                    {entry.trigger === "scheduled" ? "Programado" : "Manual"} · {entry.deliveryMode} · {entry.format}
                    · filas {entry.rows}
                    {entry.recipients ? ` · destinatarios ${entry.recipients}` : ""}
                    {entry.templateId ? ` · plantilla ${entry.templateId}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>
    </section>
  );
}
