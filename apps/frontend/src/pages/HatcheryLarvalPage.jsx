import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHatcheryBroodstockRequest,
  createHatcheryLarvalBatchRequest,
  createHatcheryLayingRequest,
  hatcheryBroodstockRequest,
  hatcheryLarvalBatchesRequest,
  hatcheryLayingsRequest,
  hatcherySummaryRequest,
  sitesRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./HatcheryLarvalPage.css";

const demoSites = [
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

function toIsoDaysAgo(daysAgo, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function toDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

const demoBroodstock = [
  {
    id: 9101,
    site_id: 901,
    site_name: "Centro Norte",
    tag_code: "NORTE-BR-001",
    species: "dorada",
    sex: "female",
    hatch_date: toDateDaysAgo(820),
    avg_weight_g: 3410,
    status: "active",
    origin: "Nucleo genetico Cantabrico",
    note: "Reproductora en ciclo principal",
    created_at: toIsoDaysAgo(45)
  },
  {
    id: 9102,
    site_id: 901,
    site_name: "Centro Norte",
    tag_code: "NORTE-BR-002",
    species: "dorada",
    sex: "male",
    hatch_date: toDateDaysAgo(790),
    avg_weight_g: 3620,
    status: "active",
    origin: "Nucleo genetico Cantabrico",
    note: "Macho seleccionado por fertilidad",
    created_at: toIsoDaysAgo(43)
  },
  {
    id: 9201,
    site_id: 902,
    site_name: "Centro Sur",
    tag_code: "SUR-BR-005",
    species: "lubina",
    sex: "female",
    hatch_date: toDateDaysAgo(760),
    avg_weight_g: 2870,
    status: "active",
    origin: "Programa Sur",
    note: "Lote con alto indice de eclosion",
    created_at: toIsoDaysAgo(39)
  },
  {
    id: 9202,
    site_id: 902,
    site_name: "Centro Sur",
    tag_code: "SUR-BR-006",
    species: "lubina",
    sex: "male",
    hatch_date: toDateDaysAgo(735),
    avg_weight_g: 3010,
    status: "active",
    origin: "Programa Sur",
    note: "Macho de reposicion",
    created_at: toIsoDaysAgo(37)
  },
  {
    id: 9301,
    site_id: 903,
    site_name: "Centro Levante",
    tag_code: "LEVANTE-BR-003",
    species: "trucha",
    sex: "female",
    hatch_date: toDateDaysAgo(680),
    avg_weight_g: 2580,
    status: "resting",
    origin: "Programa Levante",
    note: "En descanso pospuesta",
    created_at: toIsoDaysAgo(31)
  }
];

const demoLayings = [
  {
    id: 9501,
    site_id: 901,
    site_name: "Centro Norte",
    female_broodstock_id: 9101,
    female_tag_code: "NORTE-BR-001",
    male_broodstock_id: 9102,
    male_tag_code: "NORTE-BR-002",
    laying_code: "NORTE-PUESTA-08",
    laid_at: toIsoDaysAgo(18, 6),
    egg_count: 162000,
    fertilization_pct: 88.4,
    hatch_rate_pct: 81.9,
    created_at: toIsoDaysAgo(18, 7)
  },
  {
    id: 9502,
    site_id: 902,
    site_name: "Centro Sur",
    female_broodstock_id: 9201,
    female_tag_code: "SUR-BR-005",
    male_broodstock_id: 9202,
    male_tag_code: "SUR-BR-006",
    laying_code: "SUR-PUESTA-05",
    laid_at: toIsoDaysAgo(12, 7),
    egg_count: 141500,
    fertilization_pct: 84.1,
    hatch_rate_pct: 78.2,
    created_at: toIsoDaysAgo(12, 9)
  },
  {
    id: 9503,
    site_id: 903,
    site_name: "Centro Levante",
    female_broodstock_id: 9301,
    female_tag_code: "LEVANTE-BR-003",
    male_broodstock_id: null,
    male_tag_code: "-",
    laying_code: "LEVANTE-PUESTA-03",
    laid_at: toIsoDaysAgo(6, 8),
    egg_count: 98200,
    fertilization_pct: 76.8,
    hatch_rate_pct: 69.5,
    created_at: toIsoDaysAgo(6, 9)
  }
];

const demoLarvalBatches = [
  {
    id: 9701,
    site_id: 901,
    site_name: "Centro Norte",
    laying_id: 9501,
    laying_code: "NORTE-PUESTA-08",
    batch_code: "NORTE-PUESTA-08-L1",
    stage: "larva",
    initial_count: 72800,
    current_count: 61120,
    survival_pct: 83.96,
    density_larvae_l: 65.4,
    status: "active",
    started_at: toIsoDaysAgo(16, 11)
  },
  {
    id: 9702,
    site_id: 902,
    site_name: "Centro Sur",
    laying_id: 9502,
    laying_code: "SUR-PUESTA-05",
    batch_code: "SUR-PUESTA-05-L2",
    stage: "pre-engorde",
    initial_count: 65890,
    current_count: 53340,
    survival_pct: 80.95,
    density_larvae_l: 58.2,
    status: "transition",
    started_at: toIsoDaysAgo(9, 12)
  },
  {
    id: 9703,
    site_id: 903,
    site_name: "Centro Levante",
    laying_id: 9503,
    laying_code: "LEVANTE-PUESTA-03",
    batch_code: "LEVANTE-PUESTA-03-L1",
    stage: "larva",
    initial_count: 41200,
    current_count: 32790,
    survival_pct: 79.59,
    density_larvae_l: 46.3,
    status: "active",
    started_at: toIsoDaysAgo(4, 10)
  }
];

const demoSummary = {
  total_broodstock: demoBroodstock.length,
  active_broodstock: demoBroodstock.filter((item) => item.status === "active").length,
  layings_30d: demoLayings.length,
  avg_fertilization_pct: 83.1,
  avg_hatch_rate_pct: 76.5,
  total_larval_batches: demoLarvalBatches.length,
  active_larval_batches: demoLarvalBatches.filter((item) => item.status !== "closed").length,
  avg_survival_pct: 81.5,
  speciesMix: [
    { species: "dorada", total: 2 },
    { species: "lubina", total: 2 },
    { species: "trucha", total: 1 }
  ]
};

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toDateInput(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("es-ES");
}

function formatPercent(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return `${numeric.toFixed(digits)}%`;
}

function filterRowsBySite(rows, siteFilter) {
  if (!siteFilter) {
    return rows;
  }

  const siteId = Number(siteFilter);
  return rows.filter((item) => Number(item.site_id) === siteId);
}

function isPercentInRange(value) {
  if (value === null) {
    return true;
  }

  return value >= 0 && value <= 100;
}

export function HatcheryLarvalPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [siteFilter, setSiteFilter] = useState("");
  const [broodstockFeedback, setBroodstockFeedback] = useState({ type: "", message: "" });
  const [layingFeedback, setLayingFeedback] = useState({ type: "", message: "" });
  const [batchFeedback, setBatchFeedback] = useState({ type: "", message: "" });
  const [broodstockForm, setBroodstockForm] = useState({
    siteId: "",
    tagCode: "",
    species: "dorada",
    sex: "female",
    hatchDate: toDateInput(new Date(Date.now() - 520 * 24 * 3600 * 1000)),
    avgWeightG: "",
    origin: "",
    note: ""
  });
  const [layingForm, setLayingForm] = useState({
    siteId: "",
    femaleBroodstockId: "",
    maleBroodstockId: "",
    layingCode: "",
    eggCount: "",
    fertilizationPct: "",
    hatchRatePct: ""
  });
  const [batchForm, setBatchForm] = useState({
    siteId: "",
    layingId: "",
    batchCode: "",
    stage: "larva",
    initialCount: "",
    currentCount: "",
    survivalPct: "",
    avgWeightMg: "",
    densityLarvaeL: "",
    feedType: ""
  });

  const siteParams = useMemo(() => {
    if (!siteFilter) {
      return undefined;
    }

    return {
      siteId: Number(siteFilter)
    };
  }, [siteFilter]);

  const sitesQuery = useQuery({
    queryKey: ["sites", "hatchery"],
    queryFn: () => sitesRequest(accessToken)
  });

  const hatcherySummaryQuery = useQuery({
    queryKey: ["hatchery", "summary"],
    queryFn: () => hatcherySummaryRequest(accessToken)
  });

  const broodstockQuery = useQuery({
    queryKey: ["hatchery", "broodstock", siteParams],
    queryFn: () => hatcheryBroodstockRequest(accessToken, siteParams)
  });

  const layingsQuery = useQuery({
    queryKey: ["hatchery", "layings", siteParams],
    queryFn: () => hatcheryLayingsRequest(accessToken, siteParams)
  });

  const larvalQuery = useQuery({
    queryKey: ["hatchery", "larval", siteParams],
    queryFn: () => hatcheryLarvalBatchesRequest(accessToken, siteParams)
  });

  const liveSites = sitesQuery.data || [];
  const filterSites = liveSites.length > 0 ? liveSites : demoSites;
  const liveBroodstockRows = broodstockQuery.data || [];
  const liveLayingsRows = layingsQuery.data || [];
  const liveLarvalRows = larvalQuery.data || [];

  const broodstockState = useMemo(() => {
    if (liveBroodstockRows.length > 0) {
      return {
        rows: liveBroodstockRows,
        isDemo: false
      };
    }

    return {
      rows: filterRowsBySite(demoBroodstock, siteFilter),
      isDemo: true
    };
  }, [liveBroodstockRows, siteFilter]);

  const layingsState = useMemo(() => {
    if (liveLayingsRows.length > 0) {
      return {
        rows: liveLayingsRows,
        isDemo: false
      };
    }

    return {
      rows: filterRowsBySite(demoLayings, siteFilter),
      isDemo: true
    };
  }, [liveLayingsRows, siteFilter]);

  const larvalState = useMemo(() => {
    if (liveLarvalRows.length > 0) {
      return {
        rows: liveLarvalRows,
        isDemo: false
      };
    }

    return {
      rows: filterRowsBySite(demoLarvalBatches, siteFilter),
      isDemo: true
    };
  }, [liveLarvalRows, siteFilter]);

  const summaryState = hatcherySummaryQuery.data
    ? {
        value: hatcherySummaryQuery.data,
        isDemo: false
      }
    : {
        value: demoSummary,
        isDemo: true
      };

  const females = useMemo(
    () => liveBroodstockRows.filter((item) => item.sex === "female"),
    [liveBroodstockRows]
  );

  const males = useMemo(
    () => liveBroodstockRows.filter((item) => item.sex === "male"),
    [liveBroodstockRows]
  );

  async function refreshHatcheryQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hatchery", "summary"] }),
      queryClient.invalidateQueries({ queryKey: ["hatchery", "broodstock"] }),
      queryClient.invalidateQueries({ queryKey: ["hatchery", "layings"] }),
      queryClient.invalidateQueries({ queryKey: ["hatchery", "larval"] })
    ]);
  }

  async function handleCreateBroodstock(event) {
    event.preventDefault();

    setBroodstockFeedback({ type: "", message: "" });
    const normalizedTagCode = String(broodstockForm.tagCode || "").trim().toUpperCase();
    const normalizedSpecies = String(broodstockForm.species || "").trim().toLowerCase();
    const avgWeight = asNumber(broodstockForm.avgWeightG);

    if (normalizedTagCode.length < 3) {
      setBroodstockFeedback({
        type: "error",
        message: "El código del reproductor debe tener al menos 3 caracteres."
      });
      return;
    }

    if (normalizedSpecies.length < 2) {
      setBroodstockFeedback({
        type: "error",
        message: "La especie es obligatoria y debe tener al menos 2 caracteres."
      });
      return;
    }

    if (broodstockForm.avgWeightG !== "" && avgWeight === null) {
      setBroodstockFeedback({
        type: "error",
        message: "El peso medio debe ser un número válido mayor que 0."
      });
      return;
    }

    try {
      await createHatcheryBroodstockRequest(accessToken, {
        siteId: broodstockForm.siteId ? Number(broodstockForm.siteId) : null,
        tagCode: normalizedTagCode,
        species: normalizedSpecies,
        sex: broodstockForm.sex,
        hatchDate: broodstockForm.hatchDate || null,
        avgWeightG: avgWeight,
        origin: broodstockForm.origin || null,
        note: broodstockForm.note || null
      });

      setBroodstockForm((current) => ({
        ...current,
        tagCode: "",
        avgWeightG: "",
        origin: "",
        note: ""
      }));
      setBroodstockFeedback({
        type: "success",
        message: "Reproductor creado correctamente."
      });
      await refreshHatcheryQueries();
    } catch (error) {
      setBroodstockFeedback({
        type: "error",
        message: error?.response?.data?.message || "No se pudo crear el reproductor"
      });
    }
  }

  async function handleCreateLaying(event) {
    event.preventDefault();

    setLayingFeedback({ type: "", message: "" });
    const normalizedLayingCode = String(layingForm.layingCode || "").trim().toUpperCase();
    const eggCount = Number(layingForm.eggCount);
    const fertilizationPct = asNumber(layingForm.fertilizationPct);
    const hatchRatePct = asNumber(layingForm.hatchRatePct);

    if (normalizedLayingCode.length < 3) {
      setLayingFeedback({
        type: "error",
        message: "El código de puesta debe tener al menos 3 caracteres."
      });
      return;
    }

    if (!Number.isInteger(eggCount) || eggCount <= 0) {
      setLayingFeedback({
        type: "error",
        message: "El número de huevos debe ser un entero positivo."
      });
      return;
    }

    if (!isPercentInRange(fertilizationPct)) {
      setLayingFeedback({
        type: "error",
        message: "La fertilización debe estar entre 0 y 100%."
      });
      return;
    }

    if (!isPercentInRange(hatchRatePct)) {
      setLayingFeedback({
        type: "error",
        message: "La eclosión debe estar entre 0 y 100%."
      });
      return;
    }

    if (
      layingForm.femaleBroodstockId &&
      layingForm.maleBroodstockId &&
      layingForm.femaleBroodstockId === layingForm.maleBroodstockId
    ) {
      setLayingFeedback({
        type: "error",
        message: "Hembra y macho no pueden ser el mismo reproductor."
      });
      return;
    }

    try {
      await createHatcheryLayingRequest(accessToken, {
        siteId: layingForm.siteId ? Number(layingForm.siteId) : null,
        femaleBroodstockId: layingForm.femaleBroodstockId ? Number(layingForm.femaleBroodstockId) : null,
        maleBroodstockId: layingForm.maleBroodstockId ? Number(layingForm.maleBroodstockId) : null,
        layingCode: normalizedLayingCode,
        eggCount,
        fertilizationPct,
        hatchRatePct
      });

      setLayingForm((current) => ({
        ...current,
        layingCode: "",
        eggCount: "",
        fertilizationPct: "",
        hatchRatePct: ""
      }));
      setLayingFeedback({
        type: "success",
        message: "Puesta registrada correctamente."
      });
      await refreshHatcheryQueries();
    } catch (error) {
      setLayingFeedback({
        type: "error",
        message: error?.response?.data?.message || "No se pudo crear la puesta"
      });
    }
  }

  async function handleCreateLarvalBatch(event) {
    event.preventDefault();

    setBatchFeedback({ type: "", message: "" });
    const normalizedBatchCode = String(batchForm.batchCode || "").trim().toUpperCase();
    const normalizedStage = String(batchForm.stage || "").trim().toLowerCase();
    const initialCount = Number(batchForm.initialCount);
    const currentCount = asNumber(batchForm.currentCount);
    const survivalPct = asNumber(batchForm.survivalPct);
    const avgWeightMg = asNumber(batchForm.avgWeightMg);
    const densityLarvaeL = asNumber(batchForm.densityLarvaeL);

    if (normalizedBatchCode.length < 3) {
      setBatchFeedback({
        type: "error",
        message: "El código del lote debe tener al menos 3 caracteres."
      });
      return;
    }

    if (normalizedStage.length < 2) {
      setBatchFeedback({
        type: "error",
        message: "La etapa del lote es obligatoria."
      });
      return;
    }

    if (!Number.isInteger(initialCount) || initialCount <= 0) {
      setBatchFeedback({
        type: "error",
        message: "Las larvas iniciales deben ser un entero positivo."
      });
      return;
    }

    if (currentCount !== null && currentCount > initialCount) {
      setBatchFeedback({
        type: "error",
        message: "El conteo actual no puede superar al inicial."
      });
      return;
    }

    if (!isPercentInRange(survivalPct)) {
      setBatchFeedback({
        type: "error",
        message: "La supervivencia debe estar entre 0 y 100%."
      });
      return;
    }

    try {
      await createHatcheryLarvalBatchRequest(accessToken, {
        siteId: batchForm.siteId ? Number(batchForm.siteId) : null,
        layingId: batchForm.layingId ? Number(batchForm.layingId) : null,
        batchCode: normalizedBatchCode,
        stage: normalizedStage,
        initialCount,
        currentCount,
        survivalPct,
        avgWeightMg,
        densityLarvaeL,
        feedType: batchForm.feedType || null
      });

      setBatchForm((current) => ({
        ...current,
        batchCode: "",
        initialCount: "",
        currentCount: "",
        survivalPct: "",
        avgWeightMg: "",
        densityLarvaeL: "",
        feedType: ""
      }));
      setBatchFeedback({
        type: "success",
        message: "Lote larval creado correctamente."
      });
      await refreshHatcheryQueries();
    } catch (error) {
      setBatchFeedback({
        type: "error",
        message: error?.response?.data?.message || "No se pudo crear el lote larval"
      });
    }
  }

  const summary = summaryState.value;
  const isDemoMode =
    summaryState.isDemo ||
    broodstockState.isDemo ||
    layingsState.isDemo ||
    larvalState.isDemo ||
    liveSites.length === 0;
  const isRefreshing =
    hatcherySummaryQuery.isFetching ||
    broodstockQuery.isFetching ||
    layingsQuery.isFetching ||
    larvalQuery.isFetching;

  return (
    <section className="hatchery-page">
      <article className="panel hatchery-hero-panel">
        <h3>Hatchery / Larval</h3>
        <p className="hatchery-intro">
          Seguimiento de reproductores, puestas e incubación larval con trazabilidad por centro.
        </p>

        <div className="filters-inline">
          <div>
            <label htmlFor="hatcherySiteFilter">Centro</label>
            <select
              id="hatcherySiteFilter"
              value={siteFilter}
              onChange={(event) => setSiteFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {filterSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="hatchery-kpi-grid">
          <article className="hatchery-kpi-card">
            <p>Reproductores activos</p>
            <strong>{summary.active_broodstock ?? 0}</strong>
          </article>
          <article className="hatchery-kpi-card">
            <p>Puestas (30 días)</p>
            <strong>{summary.layings_30d ?? 0}</strong>
          </article>
          <article className="hatchery-kpi-card">
            <p>Lotes larvales activos</p>
            <strong>{summary.active_larval_batches ?? 0}</strong>
          </article>
          <article className="hatchery-kpi-card">
            <p>Supervivencia media</p>
            <strong>{summary.avg_survival_pct ?? 0}%</strong>
          </article>
        </div>

        {isDemoMode ? (
          <p className="hatchery-demo-note">
            No hay registros reales suficientes en Hatchery/Larval. Se muestran datos demo para visualizar
            la operativa completa.
          </p>
        ) : null}

        {isRefreshing && !isDemoMode ? <p className="hatchery-loading-note">Actualizando datos...</p> : null}

      </article>

      <div className="hatchery-form-grid">
        <article className="panel hatchery-form-panel">
          <h3>Alta de reproductor</h3>
          <p className="hatchery-form-help">
            Recomendación: usa códigos trazables por centro, por ejemplo NORTE-BR-011.
          </p>
          <form className="form-grid" onSubmit={handleCreateBroodstock}>
            <label>
              Centro
              <select
                value={broodstockForm.siteId}
                onChange={(event) =>
                  setBroodstockForm((current) => ({ ...current, siteId: event.target.value }))
                }
              >
                <option value="">Sin centro</option>
                {liveSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Código
              <input
                value={broodstockForm.tagCode}
                onChange={(event) =>
                  setBroodstockForm((current) => ({ ...current, tagCode: event.target.value }))
                }
                placeholder="NORTE-BR-011"
                required
              />
            </label>

            <label>
              Especie
              <input
                value={broodstockForm.species}
                onChange={(event) =>
                  setBroodstockForm((current) => ({ ...current, species: event.target.value }))
                }
                placeholder="dorada"
                required
              />
            </label>

            <label>
              Sexo
              <select
                value={broodstockForm.sex}
                onChange={(event) =>
                  setBroodstockForm((current) => ({ ...current, sex: event.target.value }))
                }
              >
                <option value="female">Hembra</option>
                <option value="male">Macho</option>
                <option value="unknown">No definido</option>
              </select>
            </label>

            <label>
              Nacimiento
              <input
                type="date"
                value={broodstockForm.hatchDate}
                onChange={(event) =>
                  setBroodstockForm((current) => ({ ...current, hatchDate: event.target.value }))
                }
              />
            </label>

            <label>
              Peso medio (g)
              <input
                type="number"
                min="0"
                step="0.1"
                value={broodstockForm.avgWeightG}
                onChange={(event) =>
                  setBroodstockForm((current) => ({ ...current, avgWeightG: event.target.value }))
                }
                placeholder="3200"
              />
            </label>

            <button type="submit" className="btn-primary">Crear reproductor</button>
          </form>

          {broodstockFeedback.message ? (
            <p
              className={
                broodstockFeedback.type === "success" ? "hatchery-feedback hatchery-feedback-ok" : "hatchery-error"
              }
            >
              {broodstockFeedback.message}
            </p>
          ) : null}
        </article>

        <article className="panel hatchery-form-panel">
          <h3>Registrar puesta</h3>
          <p className="hatchery-form-help">
            Introduce huevos y porcentajes para calcular tasas de fertilización y eclosión de forma comparable.
          </p>
          <form className="form-grid" onSubmit={handleCreateLaying}>
            <label>
              Centro
              <select
                value={layingForm.siteId}
                onChange={(event) =>
                  setLayingForm((current) => ({ ...current, siteId: event.target.value }))
                }
              >
                <option value="">Sin centro</option>
                {liveSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Hembra
              <select
                value={layingForm.femaleBroodstockId}
                onChange={(event) =>
                  setLayingForm((current) => ({ ...current, femaleBroodstockId: event.target.value }))
                }
              >
                <option value="">Seleccionar</option>
                {females.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.tag_code} ({item.species})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Macho
              <select
                value={layingForm.maleBroodstockId}
                onChange={(event) =>
                  setLayingForm((current) => ({ ...current, maleBroodstockId: event.target.value }))
                }
              >
                <option value="">Seleccionar</option>
                {males.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.tag_code} ({item.species})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Código de puesta
              <input
                value={layingForm.layingCode}
                onChange={(event) =>
                  setLayingForm((current) => ({ ...current, layingCode: event.target.value }))
                }
                placeholder="SUR-PUESTA-09"
                required
              />
            </label>

            <label>
              Huevos
              <input
                type="number"
                min="1"
                value={layingForm.eggCount}
                onChange={(event) =>
                  setLayingForm((current) => ({ ...current, eggCount: event.target.value }))
                }
                placeholder="150000"
                required
              />
            </label>

            <label>
              Fertilización (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={layingForm.fertilizationPct}
                onChange={(event) =>
                  setLayingForm((current) => ({ ...current, fertilizationPct: event.target.value }))
                }
                placeholder="85.5"
              />
            </label>

            <label>
              Eclosión (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={layingForm.hatchRatePct}
                onChange={(event) =>
                  setLayingForm((current) => ({ ...current, hatchRatePct: event.target.value }))
                }
                placeholder="78.2"
              />
            </label>

            <button type="submit" className="btn-primary">Registrar puesta</button>
          </form>

          {layingFeedback.message ? (
            <p
              className={
                layingFeedback.type === "success" ? "hatchery-feedback hatchery-feedback-ok" : "hatchery-error"
              }
            >
              {layingFeedback.message}
            </p>
          ) : null}
        </article>

        <article className="panel hatchery-form-panel">
          <h3>Crear lote larval</h3>
          <p className="hatchery-form-help">
            Mantén coherencia entre conteo inicial y actual para que la supervivencia sea fiable.
          </p>
          <form className="form-grid" onSubmit={handleCreateLarvalBatch}>
            <label>
              Centro
              <select
                value={batchForm.siteId}
                onChange={(event) =>
                  setBatchForm((current) => ({ ...current, siteId: event.target.value }))
                }
              >
                <option value="">Sin centro</option>
                {liveSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Puesta
              <select
                value={batchForm.layingId}
                onChange={(event) =>
                  setBatchForm((current) => ({ ...current, layingId: event.target.value }))
                }
              >
                <option value="">Seleccionar</option>
                {liveLayingsRows.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.laying_code}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Código lote
              <input
                value={batchForm.batchCode}
                onChange={(event) =>
                  setBatchForm((current) => ({ ...current, batchCode: event.target.value }))
                }
                placeholder="NORTE-PUESTA-08-L2"
                required
              />
            </label>

            <label>
              Etapa
              <input
                value={batchForm.stage}
                onChange={(event) =>
                  setBatchForm((current) => ({ ...current, stage: event.target.value }))
                }
                placeholder="larva"
                required
              />
            </label>

            <label>
              Larvas iniciales
              <input
                type="number"
                min="1"
                value={batchForm.initialCount}
                onChange={(event) =>
                  setBatchForm((current) => ({ ...current, initialCount: event.target.value }))
                }
                placeholder="60000"
                required
              />
            </label>

            <label>
              Larvas actuales
              <input
                type="number"
                min="0"
                value={batchForm.currentCount}
                onChange={(event) =>
                  setBatchForm((current) => ({ ...current, currentCount: event.target.value }))
                }
                placeholder="52000"
              />
            </label>

            <label>
              Supervivencia (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={batchForm.survivalPct}
                onChange={(event) =>
                  setBatchForm((current) => ({ ...current, survivalPct: event.target.value }))
                }
                placeholder="83.0"
              />
            </label>

            <button type="submit" className="btn-primary">Crear lote</button>
          </form>

          {batchFeedback.message ? (
            <p
              className={batchFeedback.type === "success" ? "hatchery-feedback hatchery-feedback-ok" : "hatchery-error"}
            >
              {batchFeedback.message}
            </p>
          ) : null}
        </article>
      </div>

      <article className="panel">
        <h3>Puestas recientes</h3>
        <div className="table-wrap hatchery-table-wrap">
          <table className="hatchery-table">
            <thead>
              <tr>
                <th>Centro</th>
                <th>Código</th>
                <th>Hembra</th>
                <th>Macho</th>
                <th>Huevos</th>
                <th>Fertilización</th>
                <th>Eclosión</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {layingsState.rows.length > 0 ? (
                layingsState.rows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.site_name || "-"}</td>
                    <td>{item.laying_code}</td>
                    <td>{item.female_tag_code || "-"}</td>
                    <td>{item.male_tag_code || "-"}</td>
                    <td>{item.egg_count}</td>
                    <td>{formatPercent(item.fertilization_pct, 1)}</td>
                    <td>{formatPercent(item.hatch_rate_pct, 1)}</td>
                    <td>{formatDateTime(item.laid_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="hatchery-table-empty">No hay puestas para el filtro actual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <h3>Lotes larvales</h3>
        <div className="table-wrap hatchery-table-wrap">
          <table className="hatchery-table">
            <thead>
              <tr>
                <th>Centro</th>
                <th>Lote</th>
                <th>Etapa</th>
                <th>Inicial</th>
                <th>Actual</th>
                <th>Supervivencia</th>
                <th>Densidad (larvas/L)</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {larvalState.rows.length > 0 ? (
                larvalState.rows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.site_name || "-"}</td>
                    <td>{item.batch_code}</td>
                    <td>{item.stage}</td>
                    <td>{item.initial_count}</td>
                    <td>{item.current_count ?? "-"}</td>
                    <td>{formatPercent(item.survival_pct, 1)}</td>
                    <td>{item.density_larvae_l ?? "-"}</td>
                    <td>{item.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="hatchery-table-empty">
                    No hay lotes larvales para el filtro actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
