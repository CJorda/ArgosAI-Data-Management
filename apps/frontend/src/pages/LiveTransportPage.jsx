import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLiveTransportReadingRequest,
  createLiveTransportTripRequest,
  liveTransportReadingsRequest,
  liveTransportTripsRequest,
  updateLiveTransportTripStatusRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./OperationsModulesPage.css";

const DISPLAY_TANK_SLOTS = 10;

function toDateTimeLocalInput(value = new Date()) {
  const normalized = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return normalized.toISOString().slice(0, 16);
}

function buildTransportCode() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");

  return `TRP-${yyyy}${mm}${dd}-${hh}${min}${ss}${ms}`;
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
  return `module-pill module-pill-priority-${riskLevel || "low"}`;
}

function truckTankRiskClass(riskLevel, active) {
  if (!active) {
    return "live-truck-tank live-truck-tank-empty";
  }

  return `live-truck-tank live-truck-tank-risk-${riskLevel || "low"}`;
}

function formatMetric(value, digits = 2) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return numeric.toFixed(digits);
}

function getApiErrorMessage(error, fallbackMessage) {
  const apiMessage = error?.response?.data?.message;
  const message = apiMessage || error?.message;

  if (!message) {
    return fallbackMessage;
  }

  if (String(message).toLowerCase().includes("duplicate key")) {
    return "Ya existe un viaje con ese codigo. Usa un codigo diferente.";
  }

  return String(message);
}

export function LiveTransportPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("");
  const [tripForm, setTripForm] = useState({
    transportCode: buildTransportCode(),
    originSite: "",
    destinationSite: "",
    species: "",
    lotCode: "",
    fishUnits: "",
    tankCount: "10",
    departureAt: toDateTimeLocalInput(new Date(Date.now() + 2 * 3600 * 1000)),
    arrivalEta: toDateTimeLocalInput(new Date(Date.now() + 8 * 3600 * 1000)),
    notes: ""
  });

  const [readingForm, setReadingForm] = useState({
    tripId: "",
    tankCode: "",
    measuredAt: toDateTimeLocalInput(),
    ph: "",
    dissolvedOxygenMgL: "",
    temperatureC: "",
    salinityPpt: "",
    notes: ""
  });

  const tripsQuery = useQuery({
    queryKey: ["operations", "live-transport", "trips", statusFilter],
    queryFn: () =>
      liveTransportTripsRequest(accessToken, {
        status: statusFilter || undefined,
        limit: 220
      })
  });

  const readingsQuery = useQuery({
    queryKey: ["operations", "live-transport", "readings", readingForm.tripId],
    queryFn: () =>
      liveTransportReadingsRequest(accessToken, {
        tripId: readingForm.tripId ? Number(readingForm.tripId) : undefined,
        limit: 220
      })
  });

  const createTripMutation = useMutation({
    mutationFn: (payload) => createLiveTransportTripRequest(accessToken, payload),
    onSuccess: () => {
      setTripForm((current) => ({
        ...current,
        transportCode: buildTransportCode(),
        lotCode: "",
        fishUnits: "",
        notes: ""
      }));
      queryClient.invalidateQueries({ queryKey: ["operations", "live-transport", "trips"] });
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ tripId, status }) => updateLiveTransportTripStatusRequest(accessToken, tripId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations", "live-transport", "trips"] });
    }
  });

  const createReadingMutation = useMutation({
    mutationFn: (payload) => createLiveTransportReadingRequest(accessToken, payload),
    onSuccess: () => {
      setReadingForm((current) => ({
        ...current,
        ph: "",
        dissolvedOxygenMgL: "",
        temperatureC: "",
        salinityPpt: "",
        notes: ""
      }));
      queryClient.invalidateQueries({ queryKey: ["operations", "live-transport", "trips"] });
      queryClient.invalidateQueries({ queryKey: ["operations", "live-transport", "readings"] });
    }
  });

  const trips = tripsQuery.data || [];
  const readings = readingsQuery.data || [];

  const kpis = useMemo(() => {
    const inTransit = trips.filter((trip) => trip.status === "in_transit").length;
    const criticalTrips = trips.filter((trip) => Number(trip.critical_readings_count) > 0).length;
    const highTrips = trips.filter((trip) => Number(trip.high_readings_count) > 0).length;

    return {
      totalTrips: trips.length,
      inTransit,
      criticalTrips,
      highTrips
    };
  }, [trips]);

  const featuredTrip = useMemo(
    () => trips.find((trip) => trip.status === "in_transit") || trips[0] || null,
    [trips]
  );

  const truckTankSlots = useMemo(() => {
    const configuredCount = Math.max(
      1,
      Math.min(Number(featuredTrip?.tank_count) || DISPLAY_TANK_SLOTS, DISPLAY_TANK_SLOTS)
    );
    const featuredTripId = featuredTrip ? Number(featuredTrip.id) : null;
    const byTankCode = new Map();

    for (const reading of readings) {
      if (featuredTripId && Number(reading.trip_id) !== featuredTripId) {
        continue;
      }

      const code = String(reading.tank_code || "").trim().toUpperCase();
      if (!code || byTankCode.has(code)) {
        continue;
      }

      byTankCode.set(code, reading);
    }

    const slots = [];

    for (let index = 0; index < DISPLAY_TANK_SLOTS; index += 1) {
      const tankCode = `CUBA-${String(index + 1).padStart(2, "0")}`;
      const reading = byTankCode.get(tankCode) || null;
      const active = index + 1 <= configuredCount;

      slots.push({
        tankCode,
        active,
        riskLevel: reading?.risk_level || (active ? "low" : "planned"),
        dissolvedOxygenMgL: reading?.dissolved_oxygen_mg_l ?? null,
        ph: reading?.ph ?? null
      });
    }

    return slots;
  }, [featuredTrip, readings]);

  const hiddenTankCount = useMemo(() => {
    const configuredCount = Number(featuredTrip?.tank_count) || DISPLAY_TANK_SLOTS;
    return Math.max(configuredCount - DISPLAY_TANK_SLOTS, 0);
  }, [featuredTrip]);

  const handleCreateTrip = (event) => {
    event.preventDefault();

    if (!tripForm.transportCode.trim() || !tripForm.originSite.trim() || !tripForm.destinationSite.trim()) {
      return;
    }

    createTripMutation.mutate({
      transportCode: tripForm.transportCode.trim(),
      originSite: tripForm.originSite.trim(),
      destinationSite: tripForm.destinationSite.trim(),
      species: tripForm.species.trim() || null,
      lotCode: tripForm.lotCode.trim() || null,
      fishUnits: tripForm.fishUnits ? Number(tripForm.fishUnits) : null,
      tankCount: tripForm.tankCount ? Number(tripForm.tankCount) : 1,
      departureAt: toIsoOrNull(tripForm.departureAt),
      arrivalEta: toIsoOrNull(tripForm.arrivalEta),
      notes: tripForm.notes.trim() || null
    });
  };

  const handleCreateReading = (event) => {
    event.preventDefault();

    if (!readingForm.tripId || !readingForm.tankCode.trim()) {
      return;
    }

    createReadingMutation.mutate({
      tripId: Number(readingForm.tripId),
      tankCode: readingForm.tankCode.trim(),
      measuredAt: toIsoOrNull(readingForm.measuredAt),
      ph: readingForm.ph ? Number(readingForm.ph) : null,
      dissolvedOxygenMgL: readingForm.dissolvedOxygenMgL ? Number(readingForm.dissolvedOxygenMgL) : null,
      temperatureC: readingForm.temperatureC ? Number(readingForm.temperatureC) : null,
      salinityPpt: readingForm.salinityPpt ? Number(readingForm.salinityPpt) : null,
      notes: readingForm.notes.trim() || null
    });
  };

  const updateTripStatus = (tripId, status) => {
    updateStatusMutation.mutate({ tripId, status });
  };

  return (
    <section className="module-page">
      <article className="panel live-transport-hero">
        <h3>Transporte de Peces Vivo</h3>
        <p className="module-intro">
          Controla viajes en cubas con monitoreo de pH, oxígeno disuelto y temperatura para reducir
          riesgo fisiológico durante traslados entre plantas.
        </p>

        <div className="live-truck-scene" role="img" aria-label="Vista en planta de camión con cubas de transporte vivo">
          <div className="live-truck-top-view">
            <div className="live-truck-top-cab">
              <div className="live-truck-top-windshield" />
              <span>Cabina</span>
            </div>

            <div className="live-truck-top-bed">
              <div className="live-truck-tank-grid">
                {truckTankSlots.map((tank) => (
                  <div key={tank.tankCode} className={truckTankRiskClass(tank.riskLevel, tank.active)}>
                    <span>{tank.tankCode}</span>
                    <small>
                      {tank.active
                        ? `O2 ${formatMetric(tank.dissolvedOxygenMgL)} | pH ${formatMetric(tank.ph)}`
                        : "Sin cuba"}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="live-truck-caption">
          {featuredTrip
            ? `Viaje destacado: ${featuredTrip.transport_code} (${featuredTrip.origin_site} -> ${featuredTrip.destination_site}).`
            : "Configuración de referencia con 2 filas de cubas y 10 posiciones en el camión."}
          {hiddenTankCount > 0 ? ` +${hiddenTankCount} cuba(s) adicional(es) fuera del esquema.` : ""}
        </p>

        <div className="filters-inline">
          <div>
            <label htmlFor="transportStatusFilter">Estado viaje</label>
            <select
              id="transportStatusFilter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos</option>
              <option value="planned">planned</option>
              <option value="in_transit">in_transit</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
        </div>
      </article>

      <div className="module-kpi-grid">
        <article className="module-kpi-card">
          <span>Viajes registrados</span>
          <strong>{kpis.totalTrips}</strong>
        </article>
        <article className="module-kpi-card">
          <span>En tránsito</span>
          <strong>{kpis.inTransit}</strong>
        </article>
        <article className="module-kpi-card">
          <span>Viajes con lecturas altas</span>
          <strong>{kpis.highTrips}</strong>
        </article>
        <article className="module-kpi-card">
          <span>Viajes con lecturas críticas</span>
          <strong>{kpis.criticalTrips}</strong>
        </article>
      </div>

      <div className="module-grid">
        <article className="panel">
          <h3>Nuevo viaje de transporte</h3>
          <form className="stack-form" onSubmit={handleCreateTrip}>
            <label htmlFor="transportCode">Código viaje</label>
            <input
              id="transportCode"
              type="text"
              value={tripForm.transportCode}
              onChange={(event) =>
                setTripForm((current) => ({ ...current, transportCode: event.target.value }))
              }
              placeholder="TRP-2026-001"
              required
            />
            <p className="module-inline-note">El codigo de viaje debe ser unico.</p>

            <label htmlFor="transportOrigin">Origen</label>
            <input
              id="transportOrigin"
              type="text"
              value={tripForm.originSite}
              onChange={(event) =>
                setTripForm((current) => ({ ...current, originSite: event.target.value }))
              }
              placeholder="Planta Norte"
              required
            />

            <label htmlFor="transportDestination">Destino</label>
            <input
              id="transportDestination"
              type="text"
              value={tripForm.destinationSite}
              onChange={(event) =>
                setTripForm((current) => ({ ...current, destinationSite: event.target.value }))
              }
              placeholder="Planta Sur"
              required
            />

            <label htmlFor="transportSpecies">Especie</label>
            <input
              id="transportSpecies"
              type="text"
              value={tripForm.species}
              onChange={(event) =>
                setTripForm((current) => ({ ...current, species: event.target.value }))
              }
            />

            <label htmlFor="transportLot">Lote</label>
            <input
              id="transportLot"
              type="text"
              value={tripForm.lotCode}
              onChange={(event) =>
                setTripForm((current) => ({ ...current, lotCode: event.target.value }))
              }
              placeholder="LOT-X..."
            />

            <label htmlFor="transportFishUnits">Unidades de peces</label>
            <input
              id="transportFishUnits"
              type="number"
              min="1"
              step="1"
              value={tripForm.fishUnits}
              onChange={(event) =>
                setTripForm((current) => ({ ...current, fishUnits: event.target.value }))
              }
            />

            <label htmlFor="transportTankCount">Número de cubas</label>
            <input
              id="transportTankCount"
              type="number"
              min="1"
              step="1"
              value={tripForm.tankCount}
              onChange={(event) =>
                setTripForm((current) => ({ ...current, tankCount: event.target.value }))
              }
            />

            <label htmlFor="transportDeparture">Salida</label>
            <input
              id="transportDeparture"
              type="datetime-local"
              value={tripForm.departureAt}
              onChange={(event) =>
                setTripForm((current) => ({ ...current, departureAt: event.target.value }))
              }
            />

            <label htmlFor="transportEta">Llegada estimada</label>
            <input
              id="transportEta"
              type="datetime-local"
              value={tripForm.arrivalEta}
              onChange={(event) =>
                setTripForm((current) => ({ ...current, arrivalEta: event.target.value }))
              }
            />

            <label htmlFor="transportNotes">Notas</label>
            <textarea
              id="transportNotes"
              rows={3}
              value={tripForm.notes}
              onChange={(event) =>
                setTripForm((current) => ({ ...current, notes: event.target.value }))
              }
            />

            <button type="submit" className="primary-button" disabled={createTripMutation.isPending}>
              {createTripMutation.isPending ? "Guardando..." : "Crear viaje"}
            </button>
            {createTripMutation.isError ? (
              <p className="module-warning">
                {getApiErrorMessage(
                  createTripMutation.error,
                  "No se pudo crear el viaje. Revisa los datos e intentalo de nuevo."
                )}
              </p>
            ) : null}
          </form>
        </article>

        <article className="panel">
          <h3>Nueva lectura de cuba</h3>
          <form className="stack-form" onSubmit={handleCreateReading}>
            <label htmlFor="readingTrip">Viaje</label>
            <select
              id="readingTrip"
              value={readingForm.tripId}
              onChange={(event) =>
                setReadingForm((current) => ({ ...current, tripId: event.target.value }))
              }
              required
            >
              <option value="">Selecciona</option>
              {trips
                .filter((trip) => trip.status !== "completed" && trip.status !== "cancelled")
                .map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.transport_code} ({trip.origin_site} → {trip.destination_site})
                  </option>
                ))}
            </select>

            <label htmlFor="readingTank">Cuba</label>
            <input
              id="readingTank"
              type="text"
              value={readingForm.tankCode}
              onChange={(event) =>
                setReadingForm((current) => ({ ...current, tankCode: event.target.value }))
              }
              placeholder="CUBA-01"
              required
            />

            <label htmlFor="readingAt">Fecha lectura</label>
            <input
              id="readingAt"
              type="datetime-local"
              value={readingForm.measuredAt}
              onChange={(event) =>
                setReadingForm((current) => ({ ...current, measuredAt: event.target.value }))
              }
            />

            <label htmlFor="readingPh">pH</label>
            <input
              id="readingPh"
              type="number"
              min="0"
              max="14"
              step="0.01"
              value={readingForm.ph}
              onChange={(event) => setReadingForm((current) => ({ ...current, ph: event.target.value }))}
            />

            <label htmlFor="readingDo">Oxígeno disuelto (mg/L)</label>
            <input
              id="readingDo"
              type="number"
              min="0"
              max="30"
              step="0.01"
              value={readingForm.dissolvedOxygenMgL}
              onChange={(event) =>
                setReadingForm((current) => ({ ...current, dissolvedOxygenMgL: event.target.value }))
              }
            />

            <label htmlFor="readingTemp">Temperatura (C)</label>
            <input
              id="readingTemp"
              type="number"
              min="-5"
              max="45"
              step="0.01"
              value={readingForm.temperatureC}
              onChange={(event) =>
                setReadingForm((current) => ({ ...current, temperatureC: event.target.value }))
              }
            />

            <label htmlFor="readingSalinity">Salinidad (ppt)</label>
            <input
              id="readingSalinity"
              type="number"
              min="0"
              max="70"
              step="0.01"
              value={readingForm.salinityPpt}
              onChange={(event) =>
                setReadingForm((current) => ({ ...current, salinityPpt: event.target.value }))
              }
            />

            <label htmlFor="readingNotes">Notas</label>
            <textarea
              id="readingNotes"
              rows={3}
              value={readingForm.notes}
              onChange={(event) =>
                setReadingForm((current) => ({ ...current, notes: event.target.value }))
              }
            />

            <button
              type="submit"
              className="primary-button"
              disabled={createReadingMutation.isPending || trips.length === 0}
            >
              {createReadingMutation.isPending ? "Guardando..." : "Registrar lectura"}
            </button>
          </form>
        </article>
      </div>

      <article className="panel">
        <h3>Viajes de transporte</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Ruta</th>
                <th>Estado</th>
                <th>Salida / Llegada estimada</th>
                <th>Última lectura</th>
                <th>Riesgo</th>
                <th>Lecturas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {trips.length > 0 ? (
                trips.map((trip) => (
                  <tr key={trip.id}>
                    <td>{trip.transport_code}</td>
                    <td>{trip.origin_site} → {trip.destination_site}</td>
                    <td>
                      <span className={statusClass(trip.status)}>{trip.status}</span>
                    </td>
                    <td>
                      {trip.departure_at ? new Date(trip.departure_at).toLocaleString() : "-"}
                      <br />
                      Llegada estimada: {trip.arrival_eta ? new Date(trip.arrival_eta).toLocaleString() : "-"}
                    </td>
                    <td>
                      {trip.latest_measured_at ? new Date(trip.latest_measured_at).toLocaleString() : "-"}
                      <br />
                      {trip.latest_tank_code ? `Cuba ${trip.latest_tank_code}` : "Sin lecturas"}
                    </td>
                    <td>
                      {trip.latest_risk_level ? (
                        <span className={riskClass(trip.latest_risk_level)}>{trip.latest_risk_level}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {trip.readings_count} total
                      <br />
                      {trip.high_readings_count || 0} altas / {trip.critical_readings_count || 0} críticas
                    </td>
                    <td>
                      <div className="filters-inline">
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => updateTripStatus(trip.id, "in_transit")}
                          disabled={updateStatusMutation.isPending || trip.status === "in_transit"}
                        >
                          Iniciar
                        </button>
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => updateTripStatus(trip.id, "completed")}
                          disabled={updateStatusMutation.isPending || trip.status === "completed"}
                        >
                          Completar
                        </button>
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => updateTripStatus(trip.id, "cancelled")}
                          disabled={updateStatusMutation.isPending || trip.status === "cancelled"}
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="empty-text">No hay viajes de transporte registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <h3>Lecturas de cubas</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Viaje</th>
                <th>Cuba</th>
                <th>pH</th>
                <th>Oxígeno (mg/L)</th>
                <th>Temperatura</th>
                <th>Salinidad</th>
                <th>Riesgo</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {readings.length > 0 ? (
                readings.map((reading) => (
                  <tr key={reading.id}>
                    <td>{new Date(reading.measured_at).toLocaleString()}</td>
                    <td>{reading.transport_code}</td>
                    <td>{reading.tank_code}</td>
                    <td>{reading.ph ?? "-"}</td>
                    <td>{reading.dissolved_oxygen_mg_l ?? "-"}</td>
                    <td>{reading.temperature_c ?? "-"}</td>
                    <td>{reading.salinity_ppt ?? "-"}</td>
                    <td>
                      <span className={riskClass(reading.risk_level)}>{reading.risk_level}</span>
                    </td>
                    <td>{reading.notes || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="empty-text">No hay lecturas registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
