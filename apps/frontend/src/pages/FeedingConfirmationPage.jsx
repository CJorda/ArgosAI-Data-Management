import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import "./FeedingConfirmationPage.css";

function formatDate(dateRaw) {
  if (!dateRaw) {
    return "--";
  }

  const parsed = new Date(dateRaw);
  if (!Number.isFinite(parsed.getTime())) {
    return String(dateRaw);
  }

  return parsed.toLocaleString("es-ES");
}

export function FeedingConfirmationPage() {
  const location = useLocation();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const planDate = params.get("fecha");
  const totalKg = params.get("totalKg");
  const ponds = params.get("piscinas");
  const planId = params.get("planId");
  const [confirmedAt, setConfirmedAt] = useState(null);

  useEffect(() => {
    if (!planId || typeof window === "undefined") {
      return;
    }

    const storedValue = window.localStorage.getItem(`feeding-confirmation:${planId}`);
    if (storedValue) {
      setConfirmedAt(storedValue);
    }
  }, [planId]);

  const handleConfirm = () => {
    const timestamp = new Date().toISOString();
    setConfirmedAt(timestamp);

    if (planId && typeof window !== "undefined") {
      window.localStorage.setItem(`feeding-confirmation:${planId}`, timestamp);
    }
  };

  return (
    <main className="feeding-confirm-page">
      <section className="feeding-confirm-card">
        <p className="feeding-confirm-tag">Registro de tarea</p>
        <h1>
          {confirmedAt
            ? "Alimentación registrada correctamente"
            : "Tarea pendiente de confirmación"}
        </h1>
        <p className="feeding-confirm-subtitle">
          {confirmedAt
            ? "La tarea de dar alimento a los peces se ha marcado como completada en el sistema."
            : "Pulsa el botón para confirmar que la tarea de alimentación se ha completado."}
        </p>

        <dl className="feeding-confirm-details">
          <div>
            <dt>Plan</dt>
            <dd>{planId || "--"}</dd>
          </div>
          <div>
            <dt>Fecha del plan</dt>
            <dd>{formatDate(planDate)}</dd>
          </div>
          <div>
            <dt>Total alimento</dt>
            <dd>{totalKg ? `${totalKg} kg` : "--"}</dd>
          </div>
          <div>
            <dt>Piscinas planificadas</dt>
            <dd>{ponds || "--"}</dd>
          </div>
        </dl>

        {!confirmedAt ? (
          <button type="button" className="feeding-confirm-button" onClick={handleConfirm}>
            Confirmar alimentación realizada
          </button>
        ) : (
          <p className="feeding-confirm-done-at">
            Confirmado el {formatDate(confirmedAt)}
          </p>
        )}
      </section>
    </main>
  );
}
