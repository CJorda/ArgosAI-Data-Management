import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  planningAutoCostAssumptionsRequest,
  planningCostMarginRequest,
  pondsRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./OperationsModulesPage.css";

function toDateInput(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(numeric);
}

function formatNumber(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return numeric.toFixed(digits);
}

function formatConfidence(confidence) {
  if (confidence === "high") {
    return "Alta";
  }

  if (confidence === "medium") {
    return "Media";
  }

  if (confidence === "low") {
    return "Baja";
  }

  return "-";
}

export function CostMarginPage() {
  const { accessToken } = useAuth();
  const [pondId, setPondId] = useState("");
  const [fromDate, setFromDate] = useState(toDateInput(new Date(Date.now() - 45 * 24 * 3600 * 1000)));
  const [toDate, setToDate] = useState(toDateInput());
  const [feedCostPerKg, setFeedCostPerKg] = useState("1.28");
  const [treatmentCostPerUnit, setTreatmentCostPerUnit] = useState("6.2");
  const [maintenanceCostPerUnit, setMaintenanceCostPerUnit] = useState("35");
  const [salePricePerKg, setSalePricePerKg] = useState("6.7");

  const pondsQuery = useQuery({
    queryKey: ["ponds", "cost-margin"],
    queryFn: () => pondsRequest(accessToken)
  });

  const autoAssumptionParams = useMemo(() => {
    const params = {
      from: new Date(`${fromDate}T00:00:00`).toISOString(),
      to: new Date(`${toDate}T23:59:59`).toISOString()
    };

    if (pondId) {
      params.pondId = Number(pondId);
    }

    return params;
  }, [fromDate, toDate, pondId]);

  const autoCostAssumptionsQuery = useQuery({
    queryKey: ["planning", "cost-assumptions", autoAssumptionParams],
    queryFn: () => planningAutoCostAssumptionsRequest(accessToken, autoAssumptionParams)
  });

  const queryParams = useMemo(() => {
    const params = {
      from: new Date(`${fromDate}T00:00:00`).toISOString(),
      to: new Date(`${toDate}T23:59:59`).toISOString(),
      feedCostPerKg: Number(feedCostPerKg),
      treatmentCostPerUnit: Number(treatmentCostPerUnit),
      maintenanceCostPerUnit: Number(maintenanceCostPerUnit),
      salePricePerKg: Number(salePricePerKg)
    };

    if (pondId) {
      params.pondId = Number(pondId);
    }

    return params;
  }, [
    fromDate,
    toDate,
    feedCostPerKg,
    treatmentCostPerUnit,
    maintenanceCostPerUnit,
    salePricePerKg,
    pondId
  ]);

  const costMarginQuery = useQuery({
    queryKey: ["planning", "cost-margin", queryParams],
    queryFn: () => planningCostMarginRequest(accessToken, queryParams)
  });

  const autoAssumptions = autoCostAssumptionsQuery.data?.assumptions;
  const autoSources = autoCostAssumptionsQuery.data?.sources;

  const applyAutomaticAssumptions = () => {
    if (!autoAssumptions) {
      return;
    }

    setFeedCostPerKg(String(autoAssumptions.feedCostPerKg));
    setTreatmentCostPerUnit(String(autoAssumptions.treatmentCostPerUnit));
    setMaintenanceCostPerUnit(String(autoAssumptions.maintenanceCostPerUnit));
    setSalePricePerKg(String(autoAssumptions.salePricePerKg));
  };

  const rows = costMarginQuery.data?.rows || [];
  const summary = costMarginQuery.data?.summary || {
    totalBiomassKg: 0,
    totalCostEur: 0,
    totalRevenueEur: 0,
    totalMarginEur: 0,
    globalMarginPct: null
  };

  return (
    <section className="module-page">
      <article className="panel">
        <h3>Coste y margen por piscina/lote</h3>
        <p className="module-intro">
          Modelo económico operacional con trazabilidad por piscina y lote para visualizar costes,
          ingreso proyectado y margen unitario por kg.
        </p>

        <div className="filters-inline">
          <div>
            <label htmlFor="costMarginPond">Piscina</label>
            <select id="costMarginPond" value={pondId} onChange={(event) => setPondId(event.target.value)}>
              <option value="">Todas</option>
              {(pondsQuery.data || []).map((pond) => (
                <option key={pond.id} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="costMarginFrom">Desde</label>
            <input
              id="costMarginFrom"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="costMarginTo">Hasta</label>
            <input
              id="costMarginTo"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="costFeed">Coste feed €/kg</label>
            <input
              id="costFeed"
              type="number"
              min="0"
              step="0.0001"
              value={feedCostPerKg}
              onChange={(event) => setFeedCostPerKg(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="costTreat">Coste tratamiento €/u</label>
            <input
              id="costTreat"
              type="number"
              min="0"
              step="0.0001"
              value={treatmentCostPerUnit}
              onChange={(event) => setTreatmentCostPerUnit(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="costMaintenance">Coste mantto €/u</label>
            <input
              id="costMaintenance"
              type="number"
              min="0"
              step="0.0001"
              value={maintenanceCostPerUnit}
              onChange={(event) => setMaintenanceCostPerUnit(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="salePrice">Precio venta €/kg</label>
            <input
              id="salePrice"
              type="number"
              min="0"
              step="0.0001"
              value={salePricePerKg}
              onChange={(event) => setSalePricePerKg(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="applyAutoCosts">Costes automáticos</label>
            <button
              id="applyAutoCosts"
              type="button"
              className="tiny-button"
              onClick={applyAutomaticAssumptions}
              disabled={autoCostAssumptionsQuery.isFetching || !autoAssumptions}
            >
              {autoCostAssumptionsQuery.isFetching ? "Calculando..." : "Aplicar costes reales"}
            </button>
          </div>
        </div>

        {autoAssumptions ? (
          <p className="module-inline-note">
            Sugerencia automática (inventario): feed {formatNumber(autoAssumptions.feedCostPerKg, 4)} €/kg
            ({formatConfidence(autoSources?.feed?.confidence)}), tratamiento {formatNumber(
              autoAssumptions.treatmentCostPerUnit,
              4
            )} €/u ({formatConfidence(autoSources?.treatment?.confidence)}), mantto {formatNumber(
              autoAssumptions.maintenanceCostPerUnit,
              4
            )} €/u ({formatConfidence(autoSources?.maintenance?.confidence)}).
          </p>
        ) : null}
      </article>

      <div className="module-kpi-grid">
        <article className="module-kpi-card">
          <span>Biomasa analizada</span>
          <strong>{formatNumber(summary.totalBiomassKg)} kg</strong>
        </article>
        <article className="module-kpi-card">
          <span>Coste total</span>
          <strong>{formatMoney(summary.totalCostEur)}</strong>
        </article>
        <article className="module-kpi-card">
          <span>Ingreso proyectado</span>
          <strong>{formatMoney(summary.totalRevenueEur)}</strong>
        </article>
        <article className="module-kpi-card">
          <span>Margen global</span>
          <strong>
            {formatMoney(summary.totalMarginEur)}
            {summary.globalMarginPct !== null ? ` (${formatNumber(summary.globalMarginPct)}%)` : ""}
          </strong>
        </article>
      </div>

      <article className="panel">
        <h3>Detalle por piscina y lote</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Piscina</th>
                <th>Lote</th>
                <th>Biomasa</th>
                <th>Feed</th>
                <th>Tratamientos</th>
                <th>Mantto</th>
                <th>Coste total</th>
                <th>Coste/kg</th>
                <th>Ingreso</th>
                <th>Margen</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={`${row.pondId}-${row.lotCode}`}>
                    <td>{row.pondName}</td>
                    <td>{row.lotCode}</td>
                    <td>{formatNumber(row.biomassKg)} kg</td>
                    <td>{formatNumber(row.feedKg)} kg</td>
                    <td>{formatNumber(row.treatmentQty)}</td>
                    <td>{formatNumber(row.maintenanceQty)}</td>
                    <td>{formatMoney(row.totalCostEur)}</td>
                    <td>{row.costPerKgEur !== null ? `${formatNumber(row.costPerKgEur, 3)} €/kg` : "-"}</td>
                    <td>{formatMoney(row.projectedRevenueEur)}</td>
                    <td>
                      {formatMoney(row.marginEur)}
                      {row.marginPct !== null ? ` (${formatNumber(row.marginPct)}%)` : ""}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="empty-text">No hay datos para el rango seleccionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
