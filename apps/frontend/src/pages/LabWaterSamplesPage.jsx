import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLabWaterSampleRequest,
  labWaterSamplePdfRequest,
  labWaterSamplesRequest,
  pondsRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./LabWaterSamplesPage.css";

const maxPdfBytes = 12 * 1024 * 1024;
const defaultLimit = 120;

const metricFields = [
  { key: "oxygenMgL", sampleKey: "oxygen_mg_l", label: "Oxigeno disuelto (mg/L)", step: "0.01" },
  { key: "temperatureC", sampleKey: "temperature_c", label: "Temperatura (C)", step: "0.01" },
  { key: "ph", sampleKey: "ph", label: "pH", step: "0.01" },
  { key: "salinityPpt", sampleKey: "salinity_ppt", label: "Salinidad (ppt)", step: "0.01" },
  { key: "turbidityNtu", sampleKey: "turbidity_ntu", label: "Turbidez (NTU)", step: "0.01" },
  { key: "ammoniaMgL", sampleKey: "ammonia_mg_l", label: "Amoniaco (mg/L)", step: "0.001" },
  { key: "nitriteMgL", sampleKey: "nitrite_mg_l", label: "Nitrito (mg/L)", step: "0.001" },
  { key: "nitrateMgL", sampleKey: "nitrate_mg_l", label: "Nitrato (mg/L)", step: "0.001" },
  { key: "alkalinityMgL", sampleKey: "alkalinity_mg_l", label: "Alcalinidad (mg/L)", step: "0.1" },
  { key: "hardnessMgL", sampleKey: "hardness_mg_l", label: "Dureza (mg/L)", step: "0.1" },
  { key: "conductivityUsCm", sampleKey: "conductivity_us_cm", label: "Conductividad (uS/cm)", step: "1" }
];

function base64ToBlobUrl(base64Payload, mimeType = "application/pdf") {
  try {
    const binary = atob(String(base64Payload || ""));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const blob = new Blob([bytes], { type: mimeType || "application/pdf" });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function buildA4PreviewSrc(url) {
  if (!url) {
    return null;
  }

  // Ask browser PDF viewers to fit full page in viewport and hide side UI.
  return `${url}#page=1&view=Fit&zoom=page-fit&toolbar=0&navpanes=0&scrollbar=0`;
}

function toDatetimeLocalValue(date = new Date()) {
  const current = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return current.toISOString().slice(0, 16);
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMetric(value, fractionDigits = 3) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return numeric.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits
  });
}

function parseMetricInput(rawValue) {
  const normalized = String(rawValue || "").trim().replace(",", ".");

  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);

  if (!Number.isFinite(numeric)) {
    return Number.NaN;
  }

  return numeric;
}

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function initialForm() {
  return {
    pondId: "",
    sampledAtLocal: toDatetimeLocalValue(),
    sourceLabel: "",
    technicianName: "",
    analysisType: "laboratorio",
    notes: "",
    pdfFileName: "",
    pdfMimeType: "application/pdf",
    pdfBase64: "",
    oxygenMgL: "",
    temperatureC: "",
    ph: "",
    salinityPpt: "",
    turbidityNtu: "",
    ammoniaMgL: "",
    nitriteMgL: "",
    nitrateMgL: "",
    alkalinityMgL: "",
    hardnessMgL: "",
    conductivityUsCm: ""
  };
}

export function LabWaterSamplesPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm());
  const [uiError, setUiError] = useState("");
  const [selectedSampleId, setSelectedSampleId] = useState(null);
  const [draftPdfUrl, setDraftPdfUrl] = useState(null);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState(null);
  const [filters, setFilters] = useState({
    pondId: "",
    from: "",
    to: "",
    limit: defaultLimit
  });

  const pondsQuery = useQuery({
    queryKey: ["ponds", token],
    enabled: Boolean(token),
    queryFn: () => pondsRequest(token)
  });

  const samplesQuery = useQuery({
    queryKey: ["lab-water-samples", token, filters],
    enabled: Boolean(token),
    queryFn: () =>
      labWaterSamplesRequest(token, {
        pondId: filters.pondId || undefined,
        from: filters.from ? new Date(filters.from).toISOString() : undefined,
        to: filters.to ? new Date(filters.to).toISOString() : undefined,
        limit: filters.limit
      })
  });

  const samples = Array.isArray(samplesQuery.data) ? samplesQuery.data : [];

  const selectedSample = useMemo(() => {
    if (!samples.length) {
      return null;
    }

    if (selectedSampleId) {
      const found = samples.find((item) => Number(item.id) === Number(selectedSampleId));
      if (found) {
        return found;
      }
    }

    return samples[0];
  }, [samples, selectedSampleId]);

  const selectedSampleHasPdf = Boolean(selectedSample?.has_pdf);

  const samplePdfQuery = useQuery({
    queryKey: ["lab-water-sample-pdf", token, selectedSample?.id],
    enabled: Boolean(token && selectedSample?.id && selectedSampleHasPdf),
    queryFn: () => labWaterSamplePdfRequest(token, selectedSample.id)
  });

  const createSampleMutation = useMutation({
    mutationFn: (payload) => createLabWaterSampleRequest(token, payload),
    onSuccess: (createdSample) => {
      setUiError("");
      setForm((current) => ({
        ...initialForm(),
        pondId: current.pondId || "",
        analysisType: current.analysisType || "laboratorio"
      }));
      queryClient.invalidateQueries({ queryKey: ["lab-water-samples", token] });
      setSelectedSampleId(createdSample?.id || null);
    }
  });

  const draftPdfPreviewSrc = useMemo(() => buildA4PreviewSrc(draftPdfUrl), [draftPdfUrl]);
  const selectedPdfPreviewSrc = useMemo(() => buildA4PreviewSrc(selectedPdfUrl), [selectedPdfUrl]);

  useEffect(() => {
    if (!form.pdfBase64) {
      setDraftPdfUrl(null);
      return undefined;
    }

    const blobUrl = base64ToBlobUrl(form.pdfBase64, form.pdfMimeType || "application/pdf");
    setDraftPdfUrl(blobUrl);

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [form.pdfBase64, form.pdfMimeType]);

  useEffect(() => {
    if (!samplePdfQuery.data?.pdfBase64) {
      setSelectedPdfUrl(null);
      return undefined;
    }

    const blobUrl = base64ToBlobUrl(
      samplePdfQuery.data.pdfBase64,
      samplePdfQuery.data.mimeType || "application/pdf"
    );
    setSelectedPdfUrl(blobUrl);

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [samplePdfQuery.data?.pdfBase64, samplePdfQuery.data?.mimeType]);

  const handleFilterChange = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleInputChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handlePdfSelected = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.type !== "application/pdf") {
      setUiError("El archivo adjunto debe ser PDF.");
      event.target.value = "";
      return;
    }

    if (file.size > maxPdfBytes) {
      setUiError("El PDF supera 12 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const parts = result.split(",");
      const base64 = parts.length > 1 ? parts[1] : "";

      if (!base64) {
        setUiError("No se pudo leer el PDF.");
        return;
      }

      setUiError("");
      setForm((current) => ({
        ...current,
        pdfFileName: file.name,
        pdfMimeType: file.type || "application/pdf",
        pdfBase64: base64
      }));
    };

    reader.onerror = () => {
      setUiError("No se pudo procesar el archivo PDF.");
    };

    reader.readAsDataURL(file);
  };

  const clearAttachedPdf = () => {
    setForm((current) => ({
      ...current,
      pdfFileName: "",
      pdfMimeType: "application/pdf",
      pdfBase64: ""
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const sampledAtDate = form.sampledAtLocal ? new Date(form.sampledAtLocal) : new Date();

    if (Number.isNaN(sampledAtDate.getTime())) {
      setUiError("La fecha/hora de muestreo no es valida.");
      return;
    }

    const payload = {
      pondId: form.pondId ? Number(form.pondId) : null,
      sampledAt: sampledAtDate.toISOString(),
      sourceLabel: String(form.sourceLabel || "").trim() || null,
      technicianName: String(form.technicianName || "").trim() || null,
      analysisType: String(form.analysisType || "laboratorio").trim() || "laboratorio",
      notes: String(form.notes || "").trim() || null
    };

    for (const field of metricFields) {
      const parsed = parseMetricInput(form[field.key]);

      if (Number.isNaN(parsed)) {
        setUiError(`Valor invalido para ${field.label}`);
        return;
      }

      payload[field.key] = parsed;
    }

    if (form.pdfBase64) {
      payload.pdfFileName = form.pdfFileName || "muestra-laboratorio.pdf";
      payload.pdfMimeType = form.pdfMimeType || "application/pdf";
      payload.pdfBase64 = form.pdfBase64;
    }

    setUiError("");
    createSampleMutation.mutate(payload);
  };

  return (
    <section className="lab-samples-page">
      <header className="lab-samples-header">
        <div>
          <h1>Muestras de laboratorio de agua</h1>
          <p>
            Registra resultados manuales para historico analitico y carga el PDF del laboratorio
            para consultarlo en paralelo.
          </p>
        </div>
      </header>

      <section className="lab-samples-filter-bar">
        <label>
          Piscina
          <select
            value={filters.pondId}
            onChange={(event) => handleFilterChange("pondId", event.target.value)}
          >
            <option value="">Todas</option>
            {(pondsQuery.data || []).map((pond) => (
              <option key={pond.id} value={pond.id}>
                {pond.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input
            type="datetime-local"
            value={filters.from}
            onChange={(event) => handleFilterChange("from", event.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            type="datetime-local"
            value={filters.to}
            onChange={(event) => handleFilterChange("to", event.target.value)}
          />
        </label>
        <label>
          Limite
          <input
            type="number"
            min={1}
            max={500}
            value={filters.limit}
            onChange={(event) => handleFilterChange("limit", Number(event.target.value) || defaultLimit)}
          />
        </label>
      </section>

      <div className="lab-samples-layout">
        <article className="lab-samples-card">
          <h2>Nueva muestra manual</h2>
          <form className="lab-sample-form" onSubmit={handleSubmit}>
            <div className="lab-sample-form-grid">
              <label>
                Piscina
                <select
                  value={form.pondId}
                  onChange={(event) => handleInputChange("pondId", event.target.value)}
                >
                  <option value="">Sin asociar</option>
                  {(pondsQuery.data || []).map((pond) => (
                    <option key={pond.id} value={pond.id}>
                      {pond.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha/hora muestreo
                <input
                  type="datetime-local"
                  value={form.sampledAtLocal}
                  onChange={(event) => handleInputChange("sampledAtLocal", event.target.value)}
                  required
                />
              </label>
              <label>
                Origen de muestra
                <input
                  type="text"
                  value={form.sourceLabel}
                  onChange={(event) => handleInputChange("sourceLabel", event.target.value)}
                  placeholder="Canal de entrada, salida, tanque..."
                />
              </label>
              <label>
                Tecnico
                <input
                  type="text"
                  value={form.technicianName}
                  onChange={(event) => handleInputChange("technicianName", event.target.value)}
                  placeholder="Nombre del tecnico"
                />
              </label>
            </div>

            <div className="lab-sample-metrics-grid">
              {metricFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    type="number"
                    step={field.step}
                    value={form[field.key]}
                    onChange={(event) => handleInputChange(field.key, event.target.value)}
                  />
                </label>
              ))}
            </div>

            <label>
              Notas
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) => handleInputChange("notes", event.target.value)}
                placeholder="Observaciones para trazabilidad del analisis"
              />
            </label>

            <div className="lab-sample-pdf-uploader">
              <label className="lab-sample-pdf-input">
                Adjuntar informe PDF (opcional)
                <input type="file" accept="application/pdf" onChange={handlePdfSelected} />
              </label>
              {form.pdfBase64 ? (
                <div className="lab-sample-pdf-chip">
                  <span>{form.pdfFileName}</span>
                  <button type="button" onClick={clearAttachedPdf}>
                    Quitar
                  </button>
                </div>
              ) : (
                <p className="lab-sample-muted">Sin PDF adjunto.</p>
              )}
            </div>

            <div className="lab-sample-form-actions">
              <button type="submit" disabled={createSampleMutation.isPending}>
                {createSampleMutation.isPending ? "Guardando..." : "Guardar muestra"}
              </button>
            </div>

            {uiError ? <p className="lab-sample-feedback lab-sample-feedback--error">{uiError}</p> : null}
            {createSampleMutation.isError ? (
              <p className="lab-sample-feedback lab-sample-feedback--error">
                {errorMessage(createSampleMutation.error, "No se pudo guardar la muestra")}
              </p>
            ) : null}
            {createSampleMutation.isSuccess ? (
              <p className="lab-sample-feedback lab-sample-feedback--ok">
                Muestra guardada correctamente.
              </p>
            ) : null}
          </form>
        </article>

        <article className="lab-samples-card">
          <h2>Historico de muestras ({samples.length})</h2>

          {draftPdfUrl ? (
            <div className="lab-sample-inline-preview">
              <h3>Previsualizacion inmediata (archivo adjunto)</h3>
              <p className="lab-sample-muted">{form.pdfFileName || "informe-laboratorio.pdf"}</p>
              <iframe
                className="lab-sample-pdf-viewer"
                title="pdf-draft-preview"
                src={draftPdfPreviewSrc || undefined}
                scrolling="no"
              />
            </div>
          ) : null}

          <div className="lab-samples-list">
            {samples.map((sample) => (
              <button
                type="button"
                key={sample.id}
                className={`lab-sample-item ${
                  Number(selectedSample?.id) === Number(sample.id) ? "is-selected" : ""
                }`}
                onClick={() => setSelectedSampleId(sample.id)}
              >
                <div className="lab-sample-item-main">
                  <strong>{sample.pond_name || "Sin piscina"}</strong>
                  <span>{formatTimestamp(sample.sampled_at)}</span>
                </div>
                <div className="lab-sample-item-metrics">
                  <span>O2: {formatMetric(sample.oxygen_mg_l, 2)}</span>
                  <span>Temp: {formatMetric(sample.temperature_c, 2)}</span>
                  <span>pH: {formatMetric(sample.ph, 2)}</span>
                </div>
                <div className="lab-sample-item-tags">
                  {sample.has_pdf ? <span className="lab-tag lab-tag--pdf">PDF</span> : null}
                  {sample.source_label ? <span className="lab-tag">{sample.source_label}</span> : null}
                </div>
              </button>
            ))}

            {!samples.length && !samplesQuery.isLoading ? (
              <p className="lab-sample-muted">No hay muestras para el filtro actual.</p>
            ) : null}
          </div>

          {selectedSample ? (
            <div className="lab-sample-detail-grid">
              <div className="lab-sample-detail-card">
                <h3>Detalle de muestra #{selectedSample.id}</h3>
                <p>
                  <strong>Fecha:</strong> {formatTimestamp(selectedSample.sampled_at)}
                </p>
                <p>
                  <strong>Piscina:</strong> {selectedSample.pond_name || "Sin asociar"}
                </p>
                <p>
                  <strong>Tecnico:</strong> {selectedSample.technician_name || "-"}
                </p>
                <p>
                  <strong>Tipo:</strong> {selectedSample.analysis_type || "laboratorio"}
                </p>
                <p>
                  <strong>Notas:</strong> {selectedSample.notes || "-"}
                </p>

                <div className="lab-sample-detail-metrics">
                  {metricFields.map((field) => (
                    <div key={field.key}>
                      <span>{field.label}</span>
                      <strong>{formatMetric(selectedSample[field.sampleKey || field.key], 3)}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lab-sample-detail-card">
                <h3>Informe PDF</h3>
                {selectedSampleHasPdf ? (
                  <>
                    <p className="lab-sample-muted">
                      {selectedSample.pdf_file_name || samplePdfQuery.data?.fileName || "informe.pdf"}
                    </p>
                    {samplePdfQuery.isLoading ? <p className="lab-sample-muted">Cargando PDF...</p> : null}
                    {samplePdfQuery.isError ? (
                      <p className="lab-sample-feedback lab-sample-feedback--error">
                        {errorMessage(samplePdfQuery.error, "No se pudo cargar el PDF")}
                      </p>
                    ) : null}
                    {selectedPdfUrl ? (
                      <iframe
                        className="lab-sample-pdf-viewer"
                        title={`pdf-sample-${selectedSample.id}`}
                        src={selectedPdfPreviewSrc || undefined}
                        scrolling="no"
                      />
                    ) : null}
                    {!samplePdfQuery.isLoading && !samplePdfQuery.isError && !selectedPdfUrl ? (
                      <p className="lab-sample-muted">
                        No se pudo renderizar el PDF en el visor integrado.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="lab-sample-muted">
                    Esta muestra no tiene PDF adjunto. Puedes subirlo al crear una nueva entrada.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </article>
      </div>

      {samplesQuery.isError ? (
        <p className="lab-sample-feedback lab-sample-feedback--error">
          {errorMessage(samplesQuery.error, "No se pudieron cargar las muestras")}
        </p>
      ) : null}
    </section>
  );
}
