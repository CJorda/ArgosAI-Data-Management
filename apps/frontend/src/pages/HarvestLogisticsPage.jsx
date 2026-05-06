import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHarvestPlanRequest,
  createHarvestShipmentRequest,
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

  const plans = plansQuery.data || [];
  const shipments = shipmentsQuery.data || [];

  const activePlanCount = useMemo(
    () => plans.filter((plan) => ["planned", "ready", "in_transit"].includes(plan.status)).length,
    [plans]
  );

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
