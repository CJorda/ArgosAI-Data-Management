import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { verifyPublicTraceabilityCertificateRequest } from "../api/services";
import "./TraceabilityPublicVerifyPage.css";

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString();
}

export function TraceabilityPublicVerifyPage() {
  const { publicId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const signature = String(searchParams.get("sig") || "").trim();

  const verifyQuery = useQuery({
    queryKey: ["public", "traceability-verify", publicId, signature],
    enabled: Boolean(publicId && signature),
    queryFn: () => verifyPublicTraceabilityCertificateRequest(publicId, signature)
  });

  const timelineStats = useMemo(() => {
    const timelineRows = verifyQuery.data?.certificate?.payload?.timeline || [];
    const total = timelineRows.length;
    const operations = timelineRows.filter((row) => row.source === "operation").length;
    const biomass = timelineRows.filter((row) => row.source === "biomass").length;

    return {
      total,
      operations,
      biomass
    };
  }, [verifyQuery.data]);

  return (
    <section className="trace-public-page">
      <article className="trace-public-card">
        <h1>Verificacion publica de trazabilidad</h1>

        {!publicId || !signature ? (
          <p className="trace-public-error">Faltan parametros de verificacion (id y firma).</p>
        ) : null}

        {verifyQuery.isLoading ? <p>Verificando certificado...</p> : null}

        {verifyQuery.error ? (
          <p className="trace-public-error">
            No se pudo verificar el certificado. Revisa el enlace o la firma.
          </p>
        ) : null}

        {verifyQuery.data ? (
          <div className="trace-public-content">
            <div className="trace-public-status-grid">
              <div>
                <span>Estado del certificado</span>
                <strong>{verifyQuery.data.certificate.status}</strong>
              </div>
              <div>
                <span>Firma</span>
                <strong>{verifyQuery.data.verification.signatureValid ? "Valida" : "Invalida"}</strong>
              </div>
              <div>
                <span>Integridad</span>
                <strong>{verifyQuery.data.verification.integrityValid ? "Correcta" : "Comprometida"}</strong>
              </div>
              <div>
                <span>Verificado en</span>
                <strong>{formatDateTime(verifyQuery.data.verification.verifiedAt)}</strong>
              </div>
            </div>

            <div className="trace-public-meta">
              <p>
                <b>Lote:</b> {verifyQuery.data.certificate.lotCode}
              </p>
              <p>
                <b>ID certificado:</b> {verifyQuery.data.certificate.publicId}
              </p>
              <p>
                <b>Emitido:</b> {formatDateTime(verifyQuery.data.certificate.createdAt)}
              </p>
            </div>

            <div className="trace-public-meta">
              <p>
                <b>Eventos:</b> {timelineStats.total}
              </p>
              <p>
                <b>Operaciones:</b> {timelineStats.operations}
              </p>
              <p>
                <b>Muestras biomasa:</b> {timelineStats.biomass}
              </p>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}
