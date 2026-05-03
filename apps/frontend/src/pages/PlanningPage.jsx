import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  activeWithdrawalsRequest,
  feedingRecommendationsRequest,
  planningForecastsRequest,
  planningPerformanceRequest,
  pondsRequest,
  weeklySheetRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./PlanningPage.css";

function toDateInput(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

export function PlanningPage() {
  const { accessToken } = useAuth();
  const [fromDate, setFromDate] = useState(toDateInput(new Date(Date.now() - 30 * 24 * 3600 * 1000)));
  const [toDate, setToDate] = useState(toDateInput());
  const [pondId, setPondId] = useState("");

  const pondsQuery = useQuery({
    queryKey: ["ponds", "planning"],
    queryFn: () => pondsRequest(accessToken)
  });

  const forecastsQuery = useQuery({
    queryKey: ["planning", "forecasts"],
    queryFn: () => planningForecastsRequest(accessToken)
  });

  const feedingQuery = useQuery({
    queryKey: ["planning", "feeding"],
    queryFn: () => feedingRecommendationsRequest(accessToken)
  });

  const activeWithdrawalsQuery = useQuery({
    queryKey: ["planning", "withdrawals"],
    queryFn: () => activeWithdrawalsRequest(accessToken)
  });

  const performanceParams = useMemo(() => {
    const params = {
      from: new Date(`${fromDate}T00:00:00`).toISOString(),
      to: new Date(`${toDate}T23:59:59`).toISOString()
    };

    if (pondId) {
      params.pondId = Number(pondId);
    }

    return params;
  }, [fromDate, toDate, pondId]);

  const performanceQuery = useQuery({
    queryKey: ["planning", "performance", performanceParams],
    queryFn: () => planningPerformanceRequest(accessToken, performanceParams)
  });

  const weeklySheetQuery = useQuery({
    queryKey: ["planning", "weekly-sheet", fromDate],
    queryFn: () => weeklySheetRequest(accessToken, { weekStart: `${fromDate}T00:00:00Z` })
  });

  return (
    <section className="planning-page">
      <article className="panel">
        <h3>Planificación productiva</h3>
        <p className="planning-intro">
          Módulo inspirado en plataformas líderes de piscicultura: previsiones de biomasa,
          recomendaciones de alimento, rendimiento por período y seguimiento de retiros sanitarios.
        </p>

        <div className="filters-inline">
          <div>
            <label htmlFor="planningPond">Piscina</label>
            <select id="planningPond" value={pondId} onChange={(event) => setPondId(event.target.value)}>
              <option value="">Todas</option>
              {(pondsQuery.data || []).map((pond) => (
                <option key={pond.id} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="planningFrom">Desde</label>
            <input
              id="planningFrom"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="planningTo">Hasta</label>
            <input
              id="planningTo"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
        </div>
      </article>

      <div className="planning-grid">
        <article className="panel">
          <h3>Previsiones de biomasa</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Piscina</th>
                  <th>Especie</th>
                  <th>Actual (kg)</th>
                  <th>30d</th>
                  <th>60d</th>
                  <th>90d</th>
                  <th>Feed diario</th>
                </tr>
              </thead>
              <tbody>
                {(forecastsQuery.data || []).map((item) => (
                  <tr key={item.pondId}>
                    <td>{item.pondName}</td>
                    <td>{item.species}</td>
                    <td>{item.currentBiomassKg}</td>
                    <td>{item.forecast30d?.projectedBiomassKg ?? "-"}</td>
                    <td>{item.forecast60d?.projectedBiomassKg ?? "-"}</td>
                    <td>{item.forecast90d?.projectedBiomassKg ?? "-"}</td>
                    <td>{item.recommendedFeedKgDay} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h3>Racionamiento recomendado</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Piscina</th>
                  <th>Especie</th>
                  <th>Peso medio</th>
                  <th>% feed</th>
                  <th>Kg/día</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {(feedingQuery.data || []).map((item) => (
                  <tr key={item.pondId}>
                    <td>{item.pondName}</td>
                    <td>{item.species}</td>
                    <td>{item.avgWeightG} g</td>
                    <td>{item.feedPct}</td>
                    <td>{item.recommendedKgDay}</td>
                    <td>{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <article className="panel">
        <h3>Rendimiento por período</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Piscina</th>
                <th>Especie</th>
                <th>Biomasa inicial</th>
                <th>Biomasa final</th>
                <th>Delta</th>
                <th>Feed total</th>
                <th>Mortalidad media</th>
              </tr>
            </thead>
            <tbody>
              {(performanceQuery.data?.pondPerformance || []).map((item) => (
                <tr key={item.pondId}>
                  <td>{item.pondName}</td>
                  <td>{item.species}</td>
                  <td>{item.biomassFirstKg} kg</td>
                  <td>{item.biomassLastKg} kg</td>
                  <td>{item.biomassDeltaKg} kg</td>
                  <td>{item.totalFeedKg} kg</td>
                  <td>{item.avgMortalityPct} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <h3>Retiros sanitarios activos</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Piscina</th>
                <th>Lote</th>
                <th>Fin de retiro</th>
                <th>Días de retiro</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {(activeWithdrawalsQuery.data || []).map((item) => (
                <tr key={item.id}>
                  <td>{item.pond_name}</td>
                  <td>{item.lot_code || "-"}</td>
                  <td>{new Date(item.withdrawal_until).toLocaleDateString()}</td>
                  <td>{item.withdrawal_days || "-"}</td>
                  <td>{item.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <h3>Ficha semanal de crianza</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Piscina</th>
                <th>Especie</th>
                <th>Operaciones</th>
                <th>Feed distribuido</th>
                <th>Tratamientos</th>
                <th>Biomasa media</th>
                <th>Mortalidad media</th>
                <th>FCR medio</th>
              </tr>
            </thead>
            <tbody>
              {(weeklySheetQuery.data?.rows || []).map((item) => (
                <tr key={item.pond_id}>
                  <td>{item.pond_name}</td>
                  <td>{item.species}</td>
                  <td>{item.operations_count}</td>
                  <td>{item.feed_distributed_kg} kg</td>
                  <td>{item.treatment_qty}</td>
                  <td>{item.avg_biomass_kg} kg</td>
                  <td>{item.avg_mortality_pct} %</td>
                  <td>{item.avg_fcr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
