import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { sitesRequest, strategicForecastRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./StrategicForecastPage.css";

const demoForecastSites = [
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

const demoForecastInputs = [
  {
    siteId: 901,
    siteCode: "NORTE",
    siteName: "Centro Norte",
    pondsCount: 18,
    baseBiomassKg: 42850,
    weightedFeedPct: 1.19,
    weightedFcrTarget: 1.22,
    weightedMortalityPct: 1.1
  },
  {
    siteId: 902,
    siteCode: "SUR",
    siteName: "Centro Sur",
    pondsCount: 16,
    baseBiomassKg: 39980,
    weightedFeedPct: 1.23,
    weightedFcrTarget: 1.27,
    weightedMortalityPct: 1.3
  },
  {
    siteId: 903,
    siteCode: "LEVANTE",
    siteName: "Centro Levante",
    pondsCount: 15,
    baseBiomassKg: 36240,
    weightedFeedPct: 1.15,
    weightedFcrTarget: 1.2,
    weightedMortalityPct: 1.05
  }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

function monthLabelFromNow(monthOffset) {
  const now = new Date();
  const labelDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));

  return labelDate.toLocaleDateString("es-ES", {
    month: "short",
    year: "numeric"
  });
}

function buildDemoForecast(assumptions, siteFilter) {
  const siteId = siteFilter ? Number(siteFilter) : null;
  const scopedSites = siteId
    ? demoForecastInputs.filter((site) => Number(site.siteId) === siteId)
    : demoForecastInputs;

  const siteSeries = scopedSites.map((site) => {
    const monthlyMortalityRate =
      (site.weightedMortalityPct / 100 / 12) * Math.max(assumptions.mortalitySafetyFactor, 0.35);

    let biomass = site.baseBiomassKg;
    const series = [];

    for (let monthIndex = 1; monthIndex <= assumptions.months; monthIndex += 1) {
      const monthlyFeedKg = biomass * (site.weightedFeedPct / 100) * 30.4;
      const biomassGainKg = monthlyFeedKg / site.weightedFcrTarget;
      const mortalityLossKg = biomass * monthlyMortalityRate;

      biomass = Math.max(0, biomass + biomassGainKg - mortalityLossKg);

      const revenueEur = biomass * assumptions.salePricePerKgEur;
      const feedCostEur = monthlyFeedKg * assumptions.feedCostPerKgEur;
      const grossMarginEur = revenueEur - feedCostEur;

      series.push({
        monthIndex,
        label: monthLabelFromNow(monthIndex - 1),
        biomassKg: round(biomass, 2),
        feedKg: round(monthlyFeedKg, 2),
        revenueEur: round(revenueEur, 2),
        feedCostEur: round(feedCostEur, 2),
        grossMarginEur: round(grossMarginEur, 2)
      });
    }

    const lastPoint = series.at(-1) || {
      biomassKg: 0,
      revenueEur: 0,
      feedKg: 0,
      feedCostEur: 0,
      grossMarginEur: 0
    };

    return {
      siteId: site.siteId,
      siteCode: site.siteCode,
      siteName: site.siteName,
      pondsCount: site.pondsCount,
      inputs: {
        baseBiomassKg: round(site.baseBiomassKg, 2),
        weightedFeedPct: round(site.weightedFeedPct, 3),
        weightedFcrTarget: round(site.weightedFcrTarget, 3),
        weightedMortalityPct: round(site.weightedMortalityPct, 3)
      },
      summary: {
        finalBiomassKg: round(lastPoint.biomassKg, 2),
        finalRevenueEur: round(lastPoint.revenueEur, 2),
        finalFeedKg: round(lastPoint.feedKg, 2),
        finalFeedCostEur: round(lastPoint.feedCostEur, 2),
        finalGrossMarginEur: round(lastPoint.grossMarginEur, 2)
      },
      series
    };
  });

  const consolidatedSeries = Array.from({ length: assumptions.months }, (_, index) => {
    const row = {
      monthIndex: index + 1,
      label: monthLabelFromNow(index),
      biomassKg: 0,
      feedKg: 0,
      revenueEur: 0,
      feedCostEur: 0,
      grossMarginEur: 0
    };

    for (const site of siteSeries) {
      const point = site.series[index];
      if (!point) {
        continue;
      }

      row.biomassKg += Number(point.biomassKg || 0);
      row.feedKg += Number(point.feedKg || 0);
      row.revenueEur += Number(point.revenueEur || 0);
      row.feedCostEur += Number(point.feedCostEur || 0);
      row.grossMarginEur += Number(point.grossMarginEur || 0);
    }

    row.biomassKg = round(row.biomassKg, 2);
    row.feedKg = round(row.feedKg, 2);
    row.revenueEur = round(row.revenueEur, 2);
    row.feedCostEur = round(row.feedCostEur, 2);
    row.grossMarginEur = round(row.grossMarginEur, 2);
    return row;
  });

  return {
    assumptions,
    siteSeries,
    consolidatedSeries
  };
}

function chartOption(series) {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross"
      },
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#b8cde3",
      borderWidth: 1,
      textStyle: {
        color: "#1f3553"
      }
    },
    legend: {
      top: 2,
      left: "center",
      type: "scroll",
      itemWidth: 14,
      itemHeight: 8,
      textStyle: {
        color: "#3d5477"
      },
      data: ["Biomasa proyectada (kg)", "Margen bruto proyectado (EUR)"]
    },
    grid: {
      top: 72,
      right: 50,
      bottom: 56,
      left: 60
    },
    xAxis: {
      type: "category",
      data: series.map((item) => item.label),
      axisLabel: {
        color: "#4f6787",
        hideOverlap: true,
        rotate: series.length > 12 ? 24 : 0,
        interval: 0
      },
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.5)"
        }
      }
    },
    yAxis: [
      {
        type: "value",
        name: "kg",
        axisLabel: {
          color: "#4f6787",
          formatter: (value) => `${Number(value).toLocaleString("es-ES")}`
        },
        splitLine: {
          lineStyle: {
            color: "rgba(146, 169, 194, 0.3)",
            type: "dashed"
          }
        }
      },
      {
        type: "value",
        name: "EUR",
        axisLabel: {
          color: "#4f6787",
          formatter: (value) => `${Math.round(Number(value)).toLocaleString("es-ES")}`
        },
        splitLine: {
          show: false
        }
      }
    ],
    series: [
      {
        name: "Biomasa proyectada (kg)",
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 2.4,
          color: "#4297e1"
        },
        areaStyle: {
          color: "rgba(66, 151, 225, 0.16)"
        },
        data: series.map((item) => item.biomassKg)
      },
      {
        name: "Margen bruto proyectado (EUR)",
        type: "bar",
        yAxisIndex: 1,
        barMaxWidth: 22,
        itemStyle: {
          color: "#315d9a",
          borderRadius: [4, 4, 0, 0]
        },
        data: series.map((item) => item.grossMarginEur)
      }
    ]
  };
}

export function StrategicForecastPage() {
  const { accessToken } = useAuth();
  const [months, setMonths] = useState("24");
  const [siteFilter, setSiteFilter] = useState("");
  const [salePricePerKgEur, setSalePricePerKgEur] = useState("6.4");
  const [feedCostPerKgEur, setFeedCostPerKgEur] = useState("1.28");
  const [mortalitySafetyFactor, setMortalitySafetyFactor] = useState("1");

  function normalizeAssumptionsInputs() {
    setMonths(String(Math.round(clamp(toFiniteNumber(months, 24), 12, 36))));
    setSalePricePerKgEur(String(round(clamp(toFiniteNumber(salePricePerKgEur, 6.4), 1, 25), 2)));
    setFeedCostPerKgEur(String(round(clamp(toFiniteNumber(feedCostPerKgEur, 1.28), 0.1, 8), 2)));
    setMortalitySafetyFactor(String(round(clamp(toFiniteNumber(mortalitySafetyFactor, 1), 0.4, 2), 2)));
  }

  function resetAssumptions() {
    setMonths("24");
    setSiteFilter("");
    setSalePricePerKgEur("6.4");
    setFeedCostPerKgEur("1.28");
    setMortalitySafetyFactor("1");
  }

  const sitesQuery = useQuery({
    queryKey: ["sites", "strategic-forecast"],
    queryFn: () => sitesRequest(accessToken)
  });

  const forecastParams = useMemo(() => {
    const safeMonths = Math.round(clamp(toFiniteNumber(months, 24), 12, 36));
    const safeSalePrice = clamp(toFiniteNumber(salePricePerKgEur, 6.4), 1, 25);
    const safeFeedCost = clamp(toFiniteNumber(feedCostPerKgEur, 1.28), 0.1, 8);
    const safeMortalityRisk = clamp(toFiniteNumber(mortalitySafetyFactor, 1), 0.4, 2);

    const params = {
      months: safeMonths,
      salePricePerKgEur: safeSalePrice,
      feedCostPerKgEur: safeFeedCost,
      mortalitySafetyFactor: safeMortalityRisk
    };

    if (siteFilter) {
      params.siteId = Number(siteFilter);
    }

    return params;
  }, [months, salePricePerKgEur, feedCostPerKgEur, mortalitySafetyFactor, siteFilter]);

  const strategicForecastQuery = useQuery({
    queryKey: ["consolidation", "forecast", forecastParams],
    queryFn: () => strategicForecastRequest(accessToken, forecastParams)
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
      rows: demoForecastSites,
      isDemo: true
    };
  }, [sitesQuery.data]);

  const forecastState = useMemo(() => {
    const liveConsolidatedSeries = strategicForecastQuery.data?.consolidatedSeries || [];
    if (liveConsolidatedSeries.length > 0) {
      return {
        data: strategicForecastQuery.data,
        isDemo: false
      };
    }

    return {
      data: buildDemoForecast(forecastParams, siteFilter),
      isDemo: true
    };
  }, [strategicForecastQuery.data, forecastParams, siteFilter]);

  const consolidatedSeries = forecastState.data?.consolidatedSeries || [];
  const siteSeries = forecastState.data?.siteSeries || [];
  const isRefreshingForecast = strategicForecastQuery.isFetching || sitesQuery.isFetching;
  const lastProjection = consolidatedSeries.at(-1) || {
    biomassKg: 0,
    revenueEur: 0,
    feedCostEur: 0,
    grossMarginEur: 0
  };

  return (
    <section className="strategic-forecast-page">
      <article className="panel">
        <h3>Previsión estratégica 12-36 meses</h3>
        <p className="strategic-intro">
          Proyección multi-sitio de biomasa, coste de alimentación, ingresos y margen bruto en horizonte
          mensual.
        </p>

        <div className="strategic-head-actions">
          <p className="strategic-assumptions-note">
            Rangos sugeridos: precio 1-25 EUR/kg, pienso 0.1-8 EUR/kg y riesgo de mortalidad 0.4-2.
          </p>
          <button type="button" className="btn-primary strategic-reset" onClick={resetAssumptions}>
            Restablecer supuestos
          </button>
        </div>

        <div className="filters-inline strategic-filters-grid">
          <div>
            <label htmlFor="strategicMonths">Horizonte</label>
            <select
              id="strategicMonths"
              value={months}
              onChange={(event) => setMonths(event.target.value)}
              onBlur={normalizeAssumptionsInputs}
            >
              <option value="12">12 meses</option>
              <option value="24">24 meses</option>
              <option value="36">36 meses</option>
            </select>
          </div>

          <div>
            <label htmlFor="strategicSite">Centro</label>
            <select
              id="strategicSite"
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
            <label htmlFor="strategicSalePrice">Precio venta (EUR/kg)</label>
            <input
              id="strategicSalePrice"
              type="number"
              min="1"
              max="25"
              step="0.1"
              value={salePricePerKgEur}
              onChange={(event) => setSalePricePerKgEur(event.target.value)}
              onBlur={normalizeAssumptionsInputs}
            />
          </div>

          <div>
            <label htmlFor="strategicFeedCost">Coste pienso (EUR/kg)</label>
            <input
              id="strategicFeedCost"
              type="number"
              min="0.1"
              max="8"
              step="0.01"
              value={feedCostPerKgEur}
              onChange={(event) => setFeedCostPerKgEur(event.target.value)}
              onBlur={normalizeAssumptionsInputs}
            />
          </div>

          <div>
            <label htmlFor="strategicRisk">Factor riesgo mortalidad</label>
            <input
              id="strategicRisk"
              type="number"
              min="0.4"
              max="2"
              step="0.05"
              value={mortalitySafetyFactor}
              onChange={(event) => setMortalitySafetyFactor(event.target.value)}
              onBlur={normalizeAssumptionsInputs}
            />
          </div>
        </div>

        <p className="strategic-assumptions-current">
          Supuestos activos: horizonte {forecastParams.months} meses, venta {forecastParams.salePricePerKgEur.toFixed(2)} EUR/kg,
          pienso {forecastParams.feedCostPerKgEur.toFixed(2)} EUR/kg, factor de riesgo {forecastParams.mortalitySafetyFactor.toFixed(2)}.
        </p>

        <div className="strategic-kpi-grid">
          <article className="strategic-kpi-card">
            <p>Biomasa final estimada</p>
            <strong>{Number(lastProjection.biomassKg).toLocaleString("es-ES")} kg</strong>
          </article>
          <article className="strategic-kpi-card">
            <p>Ingresos potenciales</p>
            <strong>{Number(lastProjection.revenueEur).toLocaleString("es-ES")} EUR</strong>
          </article>
          <article className="strategic-kpi-card">
            <p>Coste de pienso mensual final</p>
            <strong>{Number(lastProjection.feedCostEur).toLocaleString("es-ES")} EUR</strong>
          </article>
          <article className="strategic-kpi-card">
            <p>Margen bruto final</p>
            <strong>{Number(lastProjection.grossMarginEur).toLocaleString("es-ES")} EUR</strong>
          </article>
        </div>

        {forecastState.isDemo || sitesState.isDemo ? (
          <p className="strategic-demo-note">
            No hay histórico suficiente para forecast real en este entorno. Se muestra una proyección
            demo editable con tus hipótesis.
          </p>
        ) : null}

        {isRefreshingForecast ? <p className="strategic-loading-note">Recalculando proyección...</p> : null}
      </article>

      <article className="panel strategic-chart-panel">
        <h3>Curva consolidada</h3>
        {consolidatedSeries.length > 0 ? (
          <div className="strategic-chart-shell">
            <ReactECharts option={chartOption(consolidatedSeries)} style={{ height: 360 }} />
          </div>
        ) : (
          <p className="empty-text">No hay datos de proyección disponibles.</p>
        )}
      </article>

      <article className="panel">
        <h3>Resultado por centro al cierre del horizonte</h3>
        <div className="table-wrap strategic-table-wrap">
          <table className="strategic-table">
            <thead>
              <tr>
                <th>Centro</th>
                <th>Piscinas</th>
                <th>Biomasa base (kg)</th>
                <th>Biomasa final (kg)</th>
                <th>Ingreso final (EUR)</th>
                <th>Feed final (kg)</th>
                <th>Coste feed final (EUR)</th>
                <th>Margen final (EUR)</th>
              </tr>
            </thead>
            <tbody>
              {siteSeries.length > 0 ? (
                siteSeries.map((site) => (
                  <tr key={site.siteId}>
                    <td>{site.siteName}</td>
                    <td>{site.pondsCount}</td>
                    <td>{Number(site.inputs.baseBiomassKg).toLocaleString("es-ES")}</td>
                    <td>{Number(site.summary.finalBiomassKg).toLocaleString("es-ES")}</td>
                    <td>{Number(site.summary.finalRevenueEur).toLocaleString("es-ES")}</td>
                    <td>{Number(site.summary.finalFeedKg).toLocaleString("es-ES")}</td>
                    <td>{Number(site.summary.finalFeedCostEur).toLocaleString("es-ES")}</td>
                    <td>{Number(site.summary.finalGrossMarginEur).toLocaleString("es-ES")}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="strategic-table-empty">No hay centros para el filtro actual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
