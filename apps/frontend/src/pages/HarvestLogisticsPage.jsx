import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearHarvestTrainingScenariosRequest,
  createHarvestTrainingScenarioRequest,
  createHarvestPlanRequest,
  createHarvestShipmentRequest,
  harvestTrainingScenariosRequest,
  harvestSimulatorRequest,
  harvestPlansRequest,
  harvestShipmentsRequest,
  pondsRequest,
  updateHarvestPlanStatusRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./OperationsModulesPage.css";

function toDateTimeLocalInput(value = new Date()) {
  const normalized = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return normalized.toISOString().slice(0, 16);
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function statusClass(status) {
  return `module-pill module-pill-status-${status || "planned"}`;
}

function riskClass(riskLevel) {
  if (riskLevel === "critical") {
    return "module-pill module-pill-priority-critical";
  }

  if (riskLevel === "high") {
    return "module-pill module-pill-priority-high";
  }

  if (riskLevel === "medium") {
    return "module-pill module-pill-priority-medium";
  }

  return "module-pill module-pill-priority-low";
}

function deltaClassName(delta) {
  if (delta > 0.01) {
    return "module-delta-positive";
  }

  if (delta < -0.01) {
    return "module-delta-negative";
  }

  return "module-delta-neutral";
}

export function HarvestLogisticsPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [planForm, setPlanForm] = useState({
    pondId: "",
    lotCode: "",
    targetWeightG: "",
    plannedBiomassKg: "",
    windowStart: toDateTimeLocalInput(new Date(Date.now() + 2 * 24 * 3600 * 1000)),
    windowEnd: toDateTimeLocalInput(new Date(Date.now() + 3 * 24 * 3600 * 1000)),
    destination: "",
    logisticsProvider: "",
    notes: ""
  });

  const [shipmentForm, setShipmentForm] = useState({
    planId: "",
    dispatchCode: "",
    truckPlate: "",
    driverName: "",
    departureAt: toDateTimeLocalInput(),
    arrivalEta: toDateTimeLocalInput(new Date(Date.now() + 6 * 3600 * 1000)),
    status: "scheduled"
  });

  const [simulatorForm, setSimulatorForm] = useState({
    pondId: "",
    lotCode: "",
    windowDays: "21",
    feedCostPerKg: "1.28",
    salePricePerKg: "6.7",
    logisticsCostPerKg: "0.55",
    riskPenaltyPct: "4.5",
    mortalityStressFactor: "1"
  });
  const [trainingBaselineId, setTrainingBaselineId] = useState("");

  const pondsQuery = useQuery({
    queryKey: ["ponds", "harvest"],
    queryFn: () => pondsRequest(accessToken)
  });

  const plansQuery = useQuery({
    queryKey: ["operations", "harvest", "plans"],
    queryFn: () => harvestPlansRequest(accessToken)
  });

  const shipmentsQuery = useQuery({
    queryKey: ["operations", "harvest", "shipments"],
    queryFn: () => harvestShipmentsRequest(accessToken, { limit: 220 })
  });

  const simulatorParams = useMemo(() => {
    const params = {
      windowDays: Number(simulatorForm.windowDays) || 21,
      feedCostPerKg: Number(simulatorForm.feedCostPerKg) || 1.28,
      salePricePerKg: Number(simulatorForm.salePricePerKg) || 6.7,
      logisticsCostPerKg: Number(simulatorForm.logisticsCostPerKg) || 0.55,
      riskPenaltyPct: Number(simulatorForm.riskPenaltyPct) || 4.5,
      mortalityStressFactor: Number(simulatorForm.mortalityStressFactor) || 1
    };

    if (simulatorForm.pondId) {
      params.pondId = Number(simulatorForm.pondId);
    }

    if (simulatorForm.lotCode.trim()) {
      params.lotCode = simulatorForm.lotCode.trim().toUpperCase();
    }

    return params;
  }, [simulatorForm]);

  const harvestSimulatorQuery = useQuery({
    queryKey: ["planning", "harvest-simulator", simulatorParams],
    queryFn: () => harvestSimulatorRequest(accessToken, simulatorParams)
  });

  const trainingScenariosQuery = useQuery({
    queryKey: ["planning", "harvest-simulator", "training-scenarios"],
    queryFn: () => harvestTrainingScenariosRequest(accessToken, { limit: 80 })
  });

  const createPlanMutation = useMutation({
    mutationFn: (payload) => createHarvestPlanRequest(accessToken, payload),
    onSuccess: () => {
      setPlanForm((current) => ({
        ...current,
        lotCode: "",
        targetWeightG: "",
        plannedBiomassKg: "",
        destination: "",
        logisticsProvider: "",
        notes: ""
      }));
      queryClient.invalidateQueries({ queryKey: ["operations", "harvest", "plans"] });
    }
  });

  const updatePlanStatusMutation = useMutation({
    mutationFn: ({ planId, status }) => updateHarvestPlanStatusRequest(accessToken, planId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations", "harvest", "plans"] });
    }
  });

  const createShipmentMutation = useMutation({
    mutationFn: ({ planId, payload }) => createHarvestShipmentRequest(accessToken, planId, payload),
    onSuccess: () => {
      setShipmentForm((current) => ({
        ...current,
        dispatchCode: "",
        truckPlate: "",
        driverName: ""
      }));
      queryClient.invalidateQueries({ queryKey: ["operations", "harvest", "shipments"] });
      queryClient.invalidateQueries({ queryKey: ["operations", "harvest", "plans"] });
    }
  });

  const createTrainingScenarioMutation = useMutation({
    mutationFn: (payload) => createHarvestTrainingScenarioRequest(accessToken, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["planning", "harvest-simulator", "training-scenarios"]
      });
    }
  });

  const clearTrainingScenariosMutation = useMutation({
    mutationFn: () => clearHarvestTrainingScenariosRequest(accessToken),
    onSuccess: () => {
      setTrainingBaselineId("");
      queryClient.invalidateQueries({
        queryKey: ["planning", "harvest-simulator", "training-scenarios"]
      });
    }
  });

  const plans = plansQuery.data || [];
  const shipments = shipmentsQuery.data || [];
  const trainingScenarios = trainingScenariosQuery.data || [];
  const simulatorRows = harvestSimulatorQuery.data?.scenarios || [];
  const simulatorSummary = harvestSimulatorQuery.data?.summary || {
    totalCurrentBiomassKg: 0,
    totalProjectedBiomassKg: 0,
    totalProjectedRevenueEur: 0,
    totalProjectedCostEur: 0,
    totalMarginEur: 0,
    globalMarginPct: null
  };

  const activePlanCount = useMemo(
    () => plans.filter((plan) => ["planned", "ready", "in_transit"].includes(plan.status)).length,
    [plans]
  );

  useEffect(() => {
    if (trainingScenarios.length === 0) {
      if (trainingBaselineId) {
        setTrainingBaselineId("");
      }
      return;
    }

    const hasBaseline = trainingScenarios.some((scenario) => scenario.id === trainingBaselineId);
    if (!hasBaseline) {
      setTrainingBaselineId(trainingScenarios[0].id);
    }
  }, [trainingScenarios, trainingBaselineId]);

  const simulatorRiskBreakdown = useMemo(() => {
    return simulatorRows.reduce(
      (acc, row) => {
        acc.totalReadiness += Number(row.readinessScore) || 0;

        if (row.riskLevel === "critical") {
          acc.critical += 1;
        } else if (row.riskLevel === "high") {
          acc.high += 1;
        } else if (row.riskLevel === "medium") {
          acc.medium += 1;
        } else {
          acc.low += 1;
        }

        return acc;
      },
      {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        totalReadiness: 0
      }
    );
  }, [simulatorRows]);

  const saveTrainingScenario = () => {
    const nowIso = new Date().toISOString();
    const index = trainingScenarios.length + 1;
    const averageReadiness = simulatorRows.length > 0
      ? Number((simulatorRiskBreakdown.totalReadiness / simulatorRows.length).toFixed(1))
      : 0;

    const snapshot = {
      id: `training-${Date.now()}`,
      label: `Escenario ${index}`,
      createdAt: nowIso,
      assumptions: {
        ...simulatorParams
      },
      summary: {
        ...simulatorSummary,
        averageReadiness
      },
      riskBreakdown: {
        critical: simulatorRiskBreakdown.critical,
        high: simulatorRiskBreakdown.high,
        medium: simulatorRiskBreakdown.medium,
        low: simulatorRiskBreakdown.low
      },
      topRows: simulatorRows.slice(0, 3).map((row) => ({
        pondName: row.pondName,
        lotCode: row.lotCode,
        marginEur: row.marginEur,
        riskLevel: row.riskLevel,
        readinessScore: row.readinessScore
      }))
    };

    createTrainingScenarioMutation.mutate(snapshot);
  };

  const baselineScenario = useMemo(() => {
    if (trainingScenarios.length === 0) {
      return null;
    }

    return trainingScenarios.find((scenario) => scenario.id === trainingBaselineId) || trainingScenarios[0];
  }, [trainingScenarios, trainingBaselineId]);

  const scenariosWithDelta = useMemo(() => {
    if (trainingScenarios.length === 0) {
      return [];
    }

    const baselineMargin = baselineScenario?.summary?.totalMarginEur || 0;

    return trainingScenarios.map((scenario) => {
      const margin = Number(scenario.summary?.totalMarginEur || 0);
      const deltaMargin = margin - baselineMargin;

      return {
        ...scenario,
        deltaMargin
      };
    });
  }, [trainingScenarios, baselineScenario]);

  const clearTrainingScenarios = () => {
    clearTrainingScenariosMutation.mutate();
  };

  const handleCreatePlan = (event) => {
    event.preventDefault();

    if (!planForm.pondId || !planForm.lotCode.trim()) {
      return;
    }

    createPlanMutation.mutate({
      pondId: Number(planForm.pondId),
      lotCode: planForm.lotCode.trim(),
      targetWeightG: planForm.targetWeightG ? Number(planForm.targetWeightG) : null,
      plannedBiomassKg: planForm.plannedBiomassKg ? Number(planForm.plannedBiomassKg) : null,
      windowStart: toIsoOrNull(planForm.windowStart),
      windowEnd: toIsoOrNull(planForm.windowEnd),
      destination: planForm.destination.trim() || null,
      logisticsProvider: planForm.logisticsProvider.trim() || null,
      notes: planForm.notes.trim() || null
    });
  };

  const handleCreateShipment = (event) => {
    event.preventDefault();

    if (!shipmentForm.planId || !shipmentForm.dispatchCode.trim()) {
      return;
    }

    createShipmentMutation.mutate({
      planId: Number(shipmentForm.planId),
      payload: {
        dispatchCode: shipmentForm.dispatchCode.trim(),
        truckPlate: shipmentForm.truckPlate.trim() || null,
        driverName: shipmentForm.driverName.trim() || null,
        departureAt: toIsoOrNull(shipmentForm.departureAt),
        arrivalEta: toIsoOrNull(shipmentForm.arrivalEta),
        status: shipmentForm.status
      }
    });
  };

  const updatePlanStatus = (planId, status) => {
    updatePlanStatusMutation.mutate({ planId, status });
  };

  return (
    <section className="module-page">
      <article className="panel">
        <h3>Gestión de cosecha y logística</h3>
        <p className="module-intro">
          Planifica cosechas por lote y coordina despachos con seguimiento de estado para reducir
          demoras, mermas y desalineaciones con cliente/logística.
        </p>
        <p className="module-inline-note">
          Planes activos: {activePlanCount} | Despachos registrados: {shipments.length}
        </p>
      </article>

      <article className="panel">
        <h3>Simulador de cosecha y despacho</h3>
        <p className="module-intro">
          Simula margen y riesgo por piscina/lote combinando biomasa actual, alertas activas y
          supuestos de coste logístico para priorizar ventanas de cosecha.
        </p>

        <div className="filters-inline">
          <div>
            <label htmlFor="simPond">Piscina</label>
            <select
              id="simPond"
              value={simulatorForm.pondId}
              onChange={(event) =>
                setSimulatorForm((current) => ({ ...current, pondId: event.target.value }))
              }
            >
              <option value="">Todas</option>
              {(pondsQuery.data || []).map((pond) => (
                <option key={pond.id} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="simLotCode">Lote</label>
            <input
              id="simLotCode"
              type="text"
              value={simulatorForm.lotCode}
              onChange={(event) =>
                setSimulatorForm((current) => ({ ...current, lotCode: event.target.value }))
              }
              placeholder="LOT-..."
            />
          </div>

          <div>
            <label htmlFor="simWindowDays">Ventana (días)</label>
            <input
              id="simWindowDays"
              type="number"
              min="3"
              max="90"
              step="1"
              value={simulatorForm.windowDays}
              onChange={(event) =>
                setSimulatorForm((current) => ({ ...current, windowDays: event.target.value }))
              }
            />
          </div>

          <div>
            <label htmlFor="simFeedCost">Feed €/kg</label>
            <input
              id="simFeedCost"
              type="number"
              min="0"
              step="0.0001"
              value={simulatorForm.feedCostPerKg}
              onChange={(event) =>
                setSimulatorForm((current) => ({ ...current, feedCostPerKg: event.target.value }))
              }
            />
          </div>

          <div>
            <label htmlFor="simSalePrice">Venta €/kg</label>
            <input
              id="simSalePrice"
              type="number"
              min="0"
              step="0.0001"
              value={simulatorForm.salePricePerKg}
              onChange={(event) =>
                setSimulatorForm((current) => ({ ...current, salePricePerKg: event.target.value }))
              }
            />
          </div>

          <div>
            <label htmlFor="simLogisticsCost">Logística €/kg</label>
            <input
              id="simLogisticsCost"
              type="number"
              min="0"
              step="0.0001"
              value={simulatorForm.logisticsCostPerKg}
              onChange={(event) =>
                setSimulatorForm((current) => ({ ...current, logisticsCostPerKg: event.target.value }))
              }
            />
          </div>

          <div>
            <label htmlFor="simRiskPenalty">Penalización riesgo %</label>
            <input
              id="simRiskPenalty"
              type="number"
              min="0"
              step="0.1"
              value={simulatorForm.riskPenaltyPct}
              onChange={(event) =>
                setSimulatorForm((current) => ({ ...current, riskPenaltyPct: event.target.value }))
              }
            />
          </div>

          <div>
            <label htmlFor="simMortalityStress">Factor mortalidad</label>
            <input
              id="simMortalityStress"
              type="number"
              min="0"
              step="0.01"
              value={simulatorForm.mortalityStressFactor}
              onChange={(event) =>
                setSimulatorForm((current) => ({ ...current, mortalityStressFactor: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="module-kpi-grid">
          <article className="module-kpi-card">
            <span>Biomasa actual</span>
            <strong>{simulatorSummary.totalCurrentBiomassKg.toLocaleString("es-ES")} kg</strong>
          </article>
          <article className="module-kpi-card">
            <span>Biomasa proyectada</span>
            <strong>{simulatorSummary.totalProjectedBiomassKg.toLocaleString("es-ES")} kg</strong>
          </article>
          <article className="module-kpi-card">
            <span>Margen proyectado</span>
            <strong>{simulatorSummary.totalMarginEur.toLocaleString("es-ES")} EUR</strong>
          </article>
          <article className="module-kpi-card">
            <span>Margen global</span>
            <strong>
              {simulatorSummary.globalMarginPct !== null
                ? `${simulatorSummary.globalMarginPct.toLocaleString("es-ES")}%`
                : "-"}
            </strong>
          </article>
        </div>

        <div className="filters-inline module-training-toolbar">
          <button
            type="button"
            className="tiny-button"
            onClick={saveTrainingScenario}
            disabled={simulatorRows.length === 0 || createTrainingScenarioMutation.isPending}
          >
            {createTrainingScenarioMutation.isPending ? "Guardando..." : "Guardar escenario entrenamiento"}
          </button>
          <button
            type="button"
            className="tiny-button"
            onClick={clearTrainingScenarios}
            disabled={trainingScenarios.length === 0 || clearTrainingScenariosMutation.isPending}
          >
            {clearTrainingScenariosMutation.isPending ? "Limpiando..." : "Limpiar escenarios"}
          </button>

          <div>
            <label htmlFor="trainingBaseline">Baseline</label>
            <select
              id="trainingBaseline"
              value={baselineScenario?.id || ""}
              onChange={(event) => setTrainingBaselineId(event.target.value)}
              disabled={trainingScenarios.length === 0}
            >
              {trainingScenarios.length === 0 ? <option value="">Sin escenarios</option> : null}
              {trainingScenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Escenario</th>
                <th>Fecha</th>
                <th>Margen EUR</th>
                <th>Delta vs baseline</th>
                <th>Readiness medio</th>
                <th>Riesgo alto/critico</th>
                <th>Top candidatos</th>
              </tr>
            </thead>
            <tbody>
              {scenariosWithDelta.length > 0 ? (
                scenariosWithDelta.map((scenario) => (
                  <tr key={scenario.id}>
                    <td>{scenario.label}</td>
                    <td>{new Date(scenario.createdAt).toLocaleString()}</td>
                    <td>{Number(scenario.summary?.totalMarginEur || 0).toLocaleString("es-ES")}</td>
                    <td>
                      <span className={deltaClassName(scenario.deltaMargin)}>
                        {scenario.deltaMargin.toLocaleString("es-ES", { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td>{scenario.summary?.averageReadiness ?? 0}</td>
                    <td>{(scenario.riskBreakdown?.high || 0) + (scenario.riskBreakdown?.critical || 0)}</td>
                    <td>
                      {(scenario.topRows || [])
                        .map((item) => `${item.pondName} (${item.lotCode})`)
                        .join(" | ") || "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty-text">
                    {trainingScenariosQuery.isFetching
                      ? "Cargando escenarios guardados..."
                      : "Guarda escenarios para entrenar al equipo comparando cambios de supuestos."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Piscina</th>
                <th>Lote</th>
                <th>Estado plan</th>
                <th>Riesgo</th>
                <th>Readiness</th>
                <th>Biomasa actual</th>
                <th>Biomasa proyectada</th>
                <th>Coste proyectado</th>
                <th>Margen proyectado</th>
                <th>Ventana sugerida</th>
              </tr>
            </thead>
            <tbody>
              {simulatorRows.length > 0 ? (
                simulatorRows.map((row) => (
                  <tr key={`${row.pondId}-${row.lotCode}`}>
                    <td>{row.pondName}</td>
                    <td>{row.lotCode}</td>
                    <td>
                      <span className={statusClass(row.planStatus)}>{row.planStatus}</span>
                    </td>
                    <td>
                      <span className={riskClass(row.riskLevel)}>
                        {row.riskLevel} ({row.riskScore})
                      </span>
                    </td>
                    <td>{row.readinessScore}</td>
                    <td>{row.currentBiomassKg} kg</td>
                    <td>{row.projectedBiomassKg} kg</td>
                    <td>{row.projectedCostEur.toLocaleString("es-ES")} EUR</td>
                    <td>
                      {row.marginEur.toLocaleString("es-ES")} EUR
                      {row.marginPct !== null ? ` (${row.marginPct}%)` : ""}
                    </td>
                    <td>
                      {new Date(row.suggestedWindowStart).toLocaleDateString()} - {" "}
                      {new Date(row.suggestedWindowEnd).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="empty-text">
                    {harvestSimulatorQuery.isFetching
                      ? "Calculando escenarios..."
                      : "No hay escenarios para los filtros seleccionados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <div className="module-grid">
        <article className="panel">
          <h3>Nuevo plan de cosecha</h3>
          <form className="stack-form" onSubmit={handleCreatePlan}>
            <label htmlFor="harvestPond">Piscina</label>
            <select
              id="harvestPond"
              value={planForm.pondId}
              onChange={(event) => setPlanForm((current) => ({ ...current, pondId: event.target.value }))}
              required
            >
              <option value="">Selecciona</option>
              {(pondsQuery.data || []).map((pond) => (
                <option key={pond.id} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>

            <label htmlFor="harvestLot">Lote</label>
            <input
              id="harvestLot"
              type="text"
              value={planForm.lotCode}
              onChange={(event) =>
                setPlanForm((current) => ({ ...current, lotCode: event.target.value }))
              }
              placeholder="LOT-..."
              required
            />

            <label htmlFor="harvestWeight">Peso objetivo (g)</label>
            <input
              id="harvestWeight"
              type="number"
              min="0"
              step="0.1"
              value={planForm.targetWeightG}
              onChange={(event) =>
                setPlanForm((current) => ({ ...current, targetWeightG: event.target.value }))
              }
            />

            <label htmlFor="harvestBiomass">Biomasa planificada (kg)</label>
            <input
              id="harvestBiomass"
              type="number"
              min="0"
              step="0.01"
              value={planForm.plannedBiomassKg}
              onChange={(event) =>
                setPlanForm((current) => ({ ...current, plannedBiomassKg: event.target.value }))
              }
            />

            <label htmlFor="harvestWindowStart">Inicio ventana</label>
            <input
              id="harvestWindowStart"
              type="datetime-local"
              value={planForm.windowStart}
              onChange={(event) =>
                setPlanForm((current) => ({ ...current, windowStart: event.target.value }))
              }
              required
            />

            <label htmlFor="harvestWindowEnd">Fin ventana</label>
            <input
              id="harvestWindowEnd"
              type="datetime-local"
              value={planForm.windowEnd}
              onChange={(event) =>
                setPlanForm((current) => ({ ...current, windowEnd: event.target.value }))
              }
              required
            />

            <label htmlFor="harvestDestination">Destino</label>
            <input
              id="harvestDestination"
              type="text"
              value={planForm.destination}
              onChange={(event) =>
                setPlanForm((current) => ({ ...current, destination: event.target.value }))
              }
              placeholder="Cliente, planta o centro"
            />

            <label htmlFor="harvestProvider">Proveedor logístico</label>
            <input
              id="harvestProvider"
              type="text"
              value={planForm.logisticsProvider}
              onChange={(event) =>
                setPlanForm((current) => ({ ...current, logisticsProvider: event.target.value }))
              }
            />

            <label htmlFor="harvestNotes">Notas</label>
            <textarea
              id="harvestNotes"
              rows={3}
              value={planForm.notes}
              onChange={(event) =>
                setPlanForm((current) => ({ ...current, notes: event.target.value }))
              }
            />

            <button type="submit" className="primary-button" disabled={createPlanMutation.isPending}>
              {createPlanMutation.isPending ? "Guardando..." : "Crear plan"}
            </button>
          </form>
        </article>

        <article className="panel">
          <h3>Registrar despacho</h3>
          <form className="stack-form" onSubmit={handleCreateShipment}>
            <label htmlFor="dispatchPlan">Plan</label>
            <select
              id="dispatchPlan"
              value={shipmentForm.planId}
              onChange={(event) =>
                setShipmentForm((current) => ({ ...current, planId: event.target.value }))
              }
              required
            >
              <option value="">Selecciona</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  #{plan.id} - {plan.pond_name} ({plan.lot_code})
                </option>
              ))}
            </select>

            <label htmlFor="dispatchCode">Código despacho</label>
            <input
              id="dispatchCode"
              type="text"
              value={shipmentForm.dispatchCode}
              onChange={(event) =>
                setShipmentForm((current) => ({ ...current, dispatchCode: event.target.value }))
              }
              required
            />

            <label htmlFor="dispatchTruck">Matrícula</label>
            <input
              id="dispatchTruck"
              type="text"
              value={shipmentForm.truckPlate}
              onChange={(event) =>
                setShipmentForm((current) => ({ ...current, truckPlate: event.target.value }))
              }
            />

            <label htmlFor="dispatchDriver">Conductor</label>
            <input
              id="dispatchDriver"
              type="text"
              value={shipmentForm.driverName}
              onChange={(event) =>
                setShipmentForm((current) => ({ ...current, driverName: event.target.value }))
              }
            />

            <label htmlFor="dispatchDeparture">Salida</label>
            <input
              id="dispatchDeparture"
              type="datetime-local"
              value={shipmentForm.departureAt}
              onChange={(event) =>
                setShipmentForm((current) => ({ ...current, departureAt: event.target.value }))
              }
            />

            <label htmlFor="dispatchEta">ETA</label>
            <input
              id="dispatchEta"
              type="datetime-local"
              value={shipmentForm.arrivalEta}
              onChange={(event) =>
                setShipmentForm((current) => ({ ...current, arrivalEta: event.target.value }))
              }
            />

            <label htmlFor="dispatchStatus">Estado</label>
            <select
              id="dispatchStatus"
              value={shipmentForm.status}
              onChange={(event) =>
                setShipmentForm((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="scheduled">scheduled</option>
              <option value="in_transit">in_transit</option>
              <option value="delivered">delivered</option>
              <option value="cancelled">cancelled</option>
            </select>

            <button
              type="submit"
              className="primary-button"
              disabled={createShipmentMutation.isPending || plans.length === 0}
            >
              {createShipmentMutation.isPending ? "Guardando..." : "Registrar despacho"}
            </button>
          </form>
        </article>
      </div>

      <article className="panel">
        <h3>Planes de cosecha</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Piscina</th>
                <th>Lote</th>
                <th>Ventana</th>
                <th>Destino</th>
                <th>Estado</th>
                <th>Despachos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {plans.length > 0 ? (
                plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{plan.id}</td>
                    <td>{plan.pond_name}</td>
                    <td>{plan.lot_code}</td>
                    <td>
                      {new Date(plan.window_start).toLocaleString()} - {" "}
                      {new Date(plan.window_end).toLocaleString()}
                    </td>
                    <td>{plan.destination || "-"}</td>
                    <td>
                      <span className={statusClass(plan.status)}>{plan.status}</span>
                    </td>
                    <td>{plan.shipments_count}</td>
                    <td>
                      <div className="filters-inline">
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => updatePlanStatus(plan.id, "ready")}
                          disabled={updatePlanStatusMutation.isPending || plan.status === "ready"}
                        >
                          Ready
                        </button>
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => updatePlanStatus(plan.id, "in_transit")}
                          disabled={updatePlanStatusMutation.isPending || plan.status === "in_transit"}
                        >
                          In transit
                        </button>
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => updatePlanStatus(plan.id, "completed")}
                          disabled={updatePlanStatusMutation.isPending || plan.status === "completed"}
                        >
                          Completar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="empty-text">No hay planes de cosecha.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <h3>Despachos logísticos</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha salida</th>
                <th>Código</th>
                <th>Piscina</th>
                <th>Lote</th>
                <th>Matrícula</th>
                <th>Conductor</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length > 0 ? (
                shipments.map((shipment) => (
                  <tr key={shipment.id}>
                    <td>
                      {shipment.departure_at ? new Date(shipment.departure_at).toLocaleString() : "-"}
                    </td>
                    <td>{shipment.dispatch_code}</td>
                    <td>{shipment.pond_name}</td>
                    <td>{shipment.lot_code}</td>
                    <td>{shipment.truck_plate || "-"}</td>
                    <td>{shipment.driver_name || "-"}</td>
                    <td>
                      <span className={statusClass(shipment.status)}>{shipment.status}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty-text">No hay despachos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
