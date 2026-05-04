import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  consolidationOverviewRequest,
  consolidationSitesRequest,
  createConsolidationSiteRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./ConsolidationPage.css";

const demoConsolidationSites = [
  {
    id: 901,
    code: "NORTE",
    name: "Centro Norte",
    region: "Cantabrico",
    status: "active"
  },
  {
    id: 902,
    code: "SUR",
    name: "Centro Sur",
    region: "Andalucia",
    status: "active"
  },
  {
    id: 903,
    code: "LEVANTE",
    name: "Centro Levante",
    region: "Mediterraneo",
    status: "active"
  }
];

const demoOverviewSites = [
  {
    site_id: 901,
    site_code: "NORTE",
    site_name: "Centro Norte",
    region: "Cantabrico",
    status: "active",
    ponds_count: 18,
    latest_biomass_kg: 42850,
    avg_mortality_pct: 1.18,
    operations_count: 143,
    feed_distributed_kg: 3860,
    open_alerts: 2,
    active_larval_batches: 4,
    avg_larval_survival_pct: 82.6
  },
  {
    site_id: 902,
    site_code: "SUR",
    site_name: "Centro Sur",
    region: "Andalucia",
    status: "active",
    ponds_count: 16,
    latest_biomass_kg: 39980,
    avg_mortality_pct: 1.31,
    operations_count: 136,
    feed_distributed_kg: 3488,
    open_alerts: 3,
    active_larval_batches: 5,
    avg_larval_survival_pct: 79.9
  },
  {
    site_id: 903,
    site_code: "LEVANTE",
    site_name: "Centro Levante",
    region: "Mediterraneo",
    status: "active",
    ponds_count: 15,
    latest_biomass_kg: 36240,
    avg_mortality_pct: 1.08,
    operations_count: 128,
    feed_distributed_kg: 3154,
    open_alerts: 1,
    active_larval_batches: 3,
    avg_larval_survival_pct: 84.1
  }
];

function toDateInput(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function buildConsolidationSummary(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.totalSites += 1;
      acc.totalPonds += Number(row.ponds_count) || 0;
      acc.totalBiomassKg += Number(row.latest_biomass_kg) || 0;
      acc.totalOperations += Number(row.operations_count) || 0;
      acc.totalOpenAlerts += Number(row.open_alerts) || 0;
      acc.totalLarvalBatches += Number(row.active_larval_batches) || 0;
      return acc;
    },
    {
      totalSites: 0,
      totalPonds: 0,
      totalBiomassKg: 0,
      totalOperations: 0,
      totalOpenAlerts: 0,
      totalLarvalBatches: 0
    }
  );
}

function filterOverviewRowsBySite(rows, siteFilter) {
  if (!siteFilter) {
    return rows;
  }

  const siteId = Number(siteFilter);
  return rows.filter((row) => Number(row.site_id) === siteId);
}

function normalizeSiteCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
}

export function ConsolidationPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [siteFilter, setSiteFilter] = useState("");
  const [fromDate, setFromDate] = useState(toDateInput(new Date(Date.now() - 30 * 24 * 3600 * 1000)));
  const [toDate, setToDate] = useState(toDateInput());
  const [siteFeedback, setSiteFeedback] = useState({ type: "", message: "" });
  const [isCreatingSite, setIsCreatingSite] = useState(false);
  const [siteForm, setSiteForm] = useState({
    code: "",
    name: "",
    region: "",
    status: "active"
  });

  const filters = useMemo(() => {
    const params = {
      from: new Date(`${fromDate}T00:00:00`).toISOString(),
      to: new Date(`${toDate}T23:59:59`).toISOString()
    };

    if (siteFilter) {
      params.siteId = Number(siteFilter);
    }

    return params;
  }, [fromDate, toDate, siteFilter]);

  const sitesQuery = useQuery({
    queryKey: ["consolidation", "sites"],
    queryFn: () => consolidationSitesRequest(accessToken)
  });

  const overviewQuery = useQuery({
    queryKey: ["consolidation", "overview", filters],
    queryFn: () => consolidationOverviewRequest(accessToken, filters)
  });

  const sitesState = useMemo(() => {
    const liveSites = sitesQuery.data || [];
    if (liveSites.length > 0) {
      return {
        rows: liveSites,
        isDemo: false
      };
    }

    return {
      rows: demoConsolidationSites,
      isDemo: true
    };
  }, [sitesQuery.data]);

  const overviewState = useMemo(() => {
    const liveRows = overviewQuery.data?.sites || [];
    if (liveRows.length > 0) {
      return {
        sites: liveRows,
        summary: overviewQuery.data?.summary || buildConsolidationSummary(liveRows),
        isDemo: false
      };
    }

    const scopedDemoRows = filterOverviewRowsBySite(demoOverviewSites, siteFilter);
    return {
      sites: scopedDemoRows,
      summary: buildConsolidationSummary(scopedDemoRows),
      isDemo: true
    };
  }, [overviewQuery.data, siteFilter]);

  const summary = overviewState.summary;
  const isRefreshingOverview = overviewQuery.isFetching || sitesQuery.isFetching;

  async function handleCreateSite(event) {
    event.preventDefault();
    setSiteFeedback({ type: "", message: "" });

    const code = normalizeSiteCode(siteForm.code);
    const name = String(siteForm.name || "").trim();
    const region = String(siteForm.region || "").trim();

    if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
      setSiteFeedback({
        type: "error",
        message: "El código debe tener 2-20 caracteres y usar solo letras, números o guiones."
      });
      return;
    }

    if (name.length < 3) {
      setSiteFeedback({
        type: "error",
        message: "El nombre del centro debe tener al menos 3 caracteres."
      });
      return;
    }

    if (region.length > 120) {
      setSiteFeedback({
        type: "error",
        message: "La región no puede superar 120 caracteres."
      });
      return;
    }

    setIsCreatingSite(true);

    try {
      await createConsolidationSiteRequest(accessToken, {
        code,
        name,
        region: region || null,
        status: siteForm.status
      });

      setSiteForm({
        code: "",
        name: "",
        region: "",
        status: "active"
      });
      setSiteFeedback({
        type: "success",
        message: "Centro creado correctamente."
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["consolidation", "sites"] }),
        queryClient.invalidateQueries({ queryKey: ["consolidation", "overview"] })
      ]);
    } catch (error) {
      setSiteFeedback({
        type: "error",
        message: error?.response?.data?.message || "No se pudo crear el centro"
      });
    } finally {
      setIsCreatingSite(false);
    }
  }

  return (
    <section className="consolidation-page">
      <article className="panel">
        <h3>Consolidación multi-sitio</h3>
        <p className="consolidation-intro">
          Vista centralizada para comparar centros por biomasa, operaciones, alertas y estado larval.
        </p>

        <div className="filters-inline">
          <div>
            <label htmlFor="consolidationSite">Centro</label>
            <select
              id="consolidationSite"
              value={siteFilter}
              onChange={(event) => setSiteFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {sitesState.rows.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="consolidationFrom">Desde</label>
            <input
              id="consolidationFrom"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="consolidationTo">Hasta</label>
            <input
              id="consolidationTo"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
        </div>

        <div className="consolidation-kpi-grid">
          <article className="consolidation-kpi-card">
            <p>Centros activos</p>
            <strong>{summary.totalSites}</strong>
          </article>
          <article className="consolidation-kpi-card">
            <p>Piscinas totales</p>
            <strong>{summary.totalPonds}</strong>
          </article>
          <article className="consolidation-kpi-card">
            <p>Biomasa consolidada</p>
            <strong>{summary.totalBiomassKg.toLocaleString("es-ES")} kg</strong>
          </article>
          <article className="consolidation-kpi-card">
            <p>Operaciones período</p>
            <strong>{summary.totalOperations}</strong>
          </article>
          <article className="consolidation-kpi-card">
            <p>Alertas abiertas</p>
            <strong>{summary.totalOpenAlerts}</strong>
          </article>
          <article className="consolidation-kpi-card">
            <p>Lotes larvales activos</p>
            <strong>{summary.totalLarvalBatches}</strong>
          </article>
        </div>

        {overviewState.isDemo || sitesState.isDemo ? (
          <p className="consolidation-demo-note">
            No hay datos reales suficientes en consolidación multi-sitio. Se muestran datos demo para
            mantener visibilidad operativa.
          </p>
        ) : null}

        {isRefreshingOverview ? <p className="consolidation-loading-note">Actualizando comparativa...</p> : null}
      </article>

      <article className="panel">
        <h3>Comparativa por centro</h3>
        <div className="table-wrap consolidation-table-wrap">
          <table className="consolidation-table">
            <thead>
              <tr>
                <th>Centro</th>
                <th>Región</th>
                <th>Piscinas</th>
                <th>Biomasa (kg)</th>
                <th>Mortalidad media (%)</th>
                <th>Operaciones</th>
                <th>Feed distribuido (kg)</th>
                <th>Alertas abiertas</th>
                <th>Lotes larvales</th>
                <th>Supervivencia larval (%)</th>
              </tr>
            </thead>
            <tbody>
              {overviewState.sites.length > 0 ? (
                overviewState.sites.map((site) => (
                  <tr key={site.site_id}>
                    <td>{site.site_name}</td>
                    <td>{site.region || "-"}</td>
                    <td>{site.ponds_count}</td>
                    <td>{Number(site.latest_biomass_kg).toLocaleString("es-ES")}</td>
                    <td>{Number(site.avg_mortality_pct || 0).toFixed(2)}</td>
                    <td>{site.operations_count}</td>
                    <td>{Number(site.feed_distributed_kg || 0).toLocaleString("es-ES")}</td>
                    <td>{site.open_alerts}</td>
                    <td>{site.active_larval_batches}</td>
                    <td>{Number(site.avg_larval_survival_pct || 0).toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="consolidation-table-empty">
                    No hay centros para el filtro actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <h3>Alta de nuevo centro</h3>
        <p className="consolidation-form-help">
          Usa un código corto y único por centro. Ejemplos: NORTE-2, SUR-AUX, LEVANTE-03.
        </p>
        <form className="form-grid consolidation-form" onSubmit={handleCreateSite}>
          <label>
            Código
            <input
              value={siteForm.code}
              onChange={(event) => setSiteForm((current) => ({ ...current, code: event.target.value }))}
              placeholder="NORTE-2"
              required
            />
          </label>

          <label>
            Nombre
            <input
              value={siteForm.name}
              onChange={(event) => setSiteForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Centro Atlántico"
              required
            />
          </label>

          <label>
            Región
            <input
              value={siteForm.region}
              onChange={(event) =>
                setSiteForm((current) => ({
                  ...current,
                  region: event.target.value
                }))
              }
              placeholder="Galicia"
            />
          </label>

          <label>
            Estado
            <select
              value={siteForm.status}
              onChange={(event) => setSiteForm((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="active">Activo</option>
              <option value="maintenance">Mantenimiento</option>
              <option value="inactive">Inactivo</option>
            </select>
          </label>

          <button type="submit" className="btn-primary" disabled={isCreatingSite}>
            {isCreatingSite ? "Creando..." : "Crear centro"}
          </button>
        </form>

        {siteFeedback.message ? (
          <p className={siteFeedback.type === "success" ? "consolidation-feedback consolidation-feedback-ok" : "consolidation-error"}>
            {siteFeedback.message}
          </p>
        ) : null}
      </article>
    </section>
  );
}
