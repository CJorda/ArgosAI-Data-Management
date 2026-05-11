import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { lotTimelineRequest, lotsRequest, pondHistoryRequest, pondsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./TraceabilityPage.css";

const SENSOR_TYPES = ["oxygen", "temperature", "ph", "salinity", "turbidity"];

const SENSOR_LABELS = {
  oxygen: "Oxígeno",
  temperature: "Temperatura",
  ph: "pH",
  salinity: "Salinidad",
  turbidity: "Turbidez"
};

const EVENT_LABELS = {
  feeding: "Alimentación",
  transfer: "Transferencia",
  treatment: "Tratamiento",
  cleaning: "Limpieza",
  maintenance: "Mantenimiento",
  biomass_sample: "Muestra de biomasa",
  harvest_plan: "Plan de cosecha",
  harvest_shipment: "Despacho de cosecha",
  live_transport: "Transporte vivo"
};

const SOURCE_LABELS = {
  operation: "Operación",
  biomass: "Biomasa",
  harvest_plan: "Plan de cosecha",
  harvest_shipment: "Despacho",
  live_transport_trip: "Transporte vivo"
};

function pseudo(seed) {
  const raw = Math.sin(seed) * 10000;
  return raw - Math.floor(raw);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toDateInput(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function toDateRange(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return [];
  }

  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const list = [];

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    list.push(new Date(cursor));
  }

  return list;
}

function buildDemoPonds() {
  return [
    { id: 9101, name: "Piscina F1", species: "Dorada" },
    { id: 9102, name: "Piscina E2", species: "Lubina" },
    { id: 9103, name: "Piscina C7", species: "Trucha" }
  ];
}

function toPondCode(pond) {
  const name = String(pond?.name || "").toUpperCase();
  const code = name.replace("PISCINA", "").trim().replace(/\s+/g, "");
  return code || `P${pond?.id || "X"}`;
}

function formatSensorType(sensorType) {
  return SENSOR_LABELS[sensorType] || sensorType;
}

function formatEventType(eventType) {
  return EVENT_LABELS[eventType] || eventType;
}

function formatSourceType(sourceType) {
  return SOURCE_LABELS[sourceType] || sourceType;
}

function buildDemoPondHistory(pond, fromDate, toDate) {
  const days = toDateRange(fromDate, toDate);
  const pondCode = toPondCode(pond);
  const lotCodePrimary = `LOT-${pondCode}-01`;
  const lotCodeSecondary = `LOT-${pondCode}-02`;

  const measurements = days.flatMap((day, dayIndex) =>
    SENSOR_TYPES.map((sensorType, sensorIndex) => {
      const seed = pond.id * 0.017 + dayIndex * 0.53 + sensorIndex * 1.31;

      const baseBySensor = {
        oxygen: 7.7,
        temperature: 19.2,
        ph: 7.45,
        salinity: 33.4,
        turbidity: 9.8
      };

      const spreadBySensor = {
        oxygen: 0.8,
        temperature: 2.3,
        ph: 0.25,
        salinity: 2,
        turbidity: 3.5
      };

      const avg = baseBySensor[sensorType] + (pseudo(seed) - 0.5) * spreadBySensor[sensorType] * 2;
      const min = avg - spreadBySensor[sensorType] * (0.25 + pseudo(seed + 1));
      const max = avg + spreadBySensor[sensorType] * (0.25 + pseudo(seed + 2));
      const samples = 6 + Math.round(pseudo(seed + 3) * 14);

      return {
        day: new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())).toISOString(),
        sensor_type: sensorType,
        avg_value: Number(clamp(avg, -999, 999).toFixed(3)),
        min_value: Number(clamp(min, -999, 999).toFixed(3)),
        max_value: Number(clamp(max, -999, 999).toFixed(3)),
        samples
      };
    })
  );

  const operations = days
    .map((day, dayIndex) => {
      const morning = new Date(day);
      morning.setHours(8, 0, 0, 0);

      const rows = [
        {
          id: `demo-op-${pond.id}-${dayIndex}-feed`,
          type: "feeding",
          quantity: Number((45 + pseudo(dayIndex + pond.id) * 25).toFixed(2)),
          quantity_unit: "kg",
          lot_code: lotCodePrimary,
          mix_with_lot_code: null,
          label_tags: ["plan", "turno:manana"],
          withdrawal_days: null,
          withdrawal_until: null,
          event_at: morning.toISOString(),
          note: "Ración distribuida según plan diario"
        }
      ];

      if (dayIndex % 3 === 1) {
        const transferDate = new Date(day);
        transferDate.setHours(12, 15, 0, 0);
        rows.push({
          id: `demo-op-${pond.id}-${dayIndex}-transfer`,
          type: "transfer",
          quantity: Math.round(90 + pseudo(dayIndex + pond.id * 2) * 130),
          quantity_unit: "units",
          lot_code: lotCodePrimary,
          mix_with_lot_code: lotCodeSecondary,
          label_tags: ["destino:Piscina soporte"],
          withdrawal_days: null,
          withdrawal_until: null,
          event_at: transferDate.toISOString(),
          note: "Transferencia parcial por clasificación de talla"
        });
      }

      if (dayIndex % 5 === 2) {
        const treatmentDate = new Date(day);
        treatmentDate.setHours(16, 30, 0, 0);
        rows.push({
          id: `demo-op-${pond.id}-${dayIndex}-treat`,
          type: "treatment",
          quantity: Number((6 + pseudo(dayIndex + pond.id * 3) * 5).toFixed(2)),
          quantity_unit: "kg",
          lot_code: lotCodeSecondary,
          mix_with_lot_code: null,
          label_tags: ["medicamento:Oxitetraciclina", "via:oral", "duracion:5d"],
          withdrawal_days: 15,
          withdrawal_until: new Date(treatmentDate.getTime() + 15 * 24 * 3600 * 1000).toISOString(),
          event_at: treatmentDate.toISOString(),
          note: "Tratamiento preventivo validado por veterinario"
        });
      }

      return rows;
    })
    .flat()
    .sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime());

  const biomass = days
    .filter((_, dayIndex) => dayIndex % 2 === 0)
    .map((day, sampleIndex) => {
      const capturedAt = new Date(day);
      capturedAt.setHours(10, 45, 0, 0);
      const fishCount = 18000 - sampleIndex * 120 - Math.round(pseudo(pond.id + sampleIndex) * 80);
      const avgWeight = 70 + sampleIndex * 1.9 + pseudo(pond.id * 0.7 + sampleIndex) * 1.2;

      return {
        id: `demo-bio-${pond.id}-${sampleIndex}`,
        species_variant: pond.species,
        lot_code: sampleIndex % 3 === 0 ? lotCodeSecondary : lotCodePrimary,
        fish_count: Math.max(4000, fishCount),
        avg_weight_g: Number(avgWeight.toFixed(2)),
        mortality_pct: Number((1.2 + pseudo(sampleIndex + pond.id * 0.2) * 0.8).toFixed(2)),
        vaccination_coverage_pct: Number((87 + pseudo(sampleIndex + pond.id) * 9).toFixed(2)),
        withdrawal_days_remaining: sampleIndex % 4 === 0 ? 7 : null,
        feed_kg: Number((40 + pseudo(sampleIndex + pond.id * 0.5) * 20).toFixed(2)),
        fcr: Number((1.12 + pseudo(sampleIndex + pond.id * 0.4) * 0.22).toFixed(3)),
        captured_at: capturedAt.toISOString()
      };
    })
    .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());

  const measurementSamples = measurements.reduce((sum, row) => sum + row.samples, 0);

  return {
    pond: {
      id: pond.id,
      name: pond.name,
      species: pond.species
    },
    from: new Date(`${fromDate}T00:00:00`).toISOString(),
    to: new Date(`${toDate}T23:59:59`).toISOString(),
    measurements,
    operations,
    biomass,
    summary: {
      measurementSamples,
      operationsCount: operations.length,
      biomassSamples: biomass.length
    }
  };
}

function hasHistoryData(historyData) {
  if (!historyData) {
    return false;
  }

  return (
    (historyData.measurements?.length || 0) > 0 ||
    (historyData.operations?.length || 0) > 0 ||
    (historyData.biomass?.length || 0) > 0
  );
}

function buildDemoTraceabilityDataset(ponds, fromDate, toDate) {
  const safePonds = ponds.length > 0 ? ponds : buildDemoPonds();
  const historiesByPond = new Map();
  const lotAccumulator = new Map();

  const addLotEvent = (lotCode, eventAt) => {
    if (!lotCode) {
      return;
    }

    const current = lotAccumulator.get(lotCode);
    if (!current) {
      lotAccumulator.set(lotCode, {
        lot_code: lotCode,
        last_event_at: eventAt,
        total_events: 1
      });
      return;
    }

    const currentEpoch = new Date(current.last_event_at).getTime();
    const incomingEpoch = new Date(eventAt).getTime();

    current.total_events += 1;
    if (incomingEpoch > currentEpoch) {
      current.last_event_at = eventAt;
    }
  };

  const timelineByLot = new Map();

  const addTimelineRow = (lotCode, row) => {
    if (!lotCode) {
      return;
    }

    if (!timelineByLot.has(lotCode)) {
      timelineByLot.set(lotCode, []);
    }

    timelineByLot.get(lotCode).push(row);
  };

  for (const pond of safePonds) {
    const history = buildDemoPondHistory(pond, fromDate, toDate);
    historiesByPond.set(String(pond.id), history);

    for (const operation of history.operations) {
      if (operation.lot_code) {
        addLotEvent(operation.lot_code, operation.event_at);
        addTimelineRow(operation.lot_code, {
          source: "operation",
          source_id: String(operation.id),
          event_at: operation.event_at,
          pond_name: pond.name,
          event_type: operation.type,
          quantity: operation.quantity,
          quantity_unit: operation.quantity_unit,
          note: operation.note,
          mix_with_lot_code: operation.mix_with_lot_code,
          label_tags: operation.label_tags || [],
          withdrawal_until: operation.withdrawal_until,
          avg_weight_g: null,
          fish_count: null,
          mortality_pct: null,
          feed_kg: null,
          status: null,
          route_label: null,
          external_code: null
        });
      }

      if (operation.mix_with_lot_code) {
        addLotEvent(operation.mix_with_lot_code, operation.event_at);
      }
    }

    for (const bio of history.biomass) {
      if (!bio.lot_code) {
        continue;
      }

      addLotEvent(bio.lot_code, bio.captured_at);
      addTimelineRow(bio.lot_code, {
        source: "biomass",
        source_id: String(bio.id),
        event_at: bio.captured_at,
        pond_name: pond.name,
        event_type: "biomass_sample",
        quantity: null,
        quantity_unit: null,
        note: null,
        mix_with_lot_code: null,
        label_tags: [],
        withdrawal_until: null,
        avg_weight_g: bio.avg_weight_g,
        fish_count: bio.fish_count,
        mortality_pct: bio.mortality_pct,
        feed_kg: bio.feed_kg,
        status: null,
        route_label: null,
        external_code: null
      });
    }
  }

  for (const [lotCode, rows] of timelineByLot.entries()) {
    timelineByLot.set(
      lotCode,
      [...rows].sort((left, right) => new Date(right.event_at).getTime() - new Date(left.event_at).getTime())
    );
  }

  const lots = Array.from(lotAccumulator.values()).sort(
    (left, right) => new Date(right.last_event_at).getTime() - new Date(left.last_event_at).getTime()
  );

  return {
    historiesByPond,
    lots,
    timelineByLot
  };
}

export function TraceabilityPage() {
  const { accessToken } = useAuth();
  const [fromDate, setFromDate] = useState(toDateInput(new Date(Date.now() - 7 * 24 * 3600 * 1000)));
  const [toDate, setToDate] = useState(toDateInput());
  const [pondId, setPondId] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [timelineSourceFilter, setTimelineSourceFilter] = useState("all");
  const [timelineSearch, setTimelineSearch] = useState("");

  const pondsQuery = useQuery({
    queryKey: ["ponds", "traceability"],
    queryFn: () => pondsRequest(accessToken)
  });

  const pondsState = useMemo(() => {
    const rows = pondsQuery.data || [];
    if (rows.length > 0) {
      return {
        rows,
        isDemo: false
      };
    }

    return {
      rows: buildDemoPonds(),
      isDemo: true
    };
  }, [pondsQuery.data]);

  const activePondId = pondId || String(pondsState.rows[0]?.id || "");
  const activePondNumericId = Number(activePondId);

  const demoDataset = useMemo(
    () => buildDemoTraceabilityDataset(pondsState.rows, fromDate, toDate),
    [pondsState.rows, fromDate, toDate]
  );

  const historyParams = useMemo(() => {
    if (!activePondId || !Number.isFinite(activePondNumericId)) {
      return null;
    }

    return {
      pondId: activePondNumericId,
      from: new Date(`${fromDate}T00:00:00`).toISOString(),
      to: new Date(`${toDate}T23:59:59`).toISOString()
    };
  }, [activePondId, activePondNumericId, fromDate, toDate]);

  const historyQuery = useQuery({
    queryKey: ["planning", "pond-history", historyParams],
    enabled: Boolean(historyParams) && !pondsState.isDemo,
    queryFn: () => pondHistoryRequest(accessToken, historyParams)
  });

  const selectedDemoHistory = demoDataset.historiesByPond.get(String(activePondId)) || {
    pond: pondsState.rows[0] || null,
    from: new Date(`${fromDate}T00:00:00`).toISOString(),
    to: new Date(`${toDate}T23:59:59`).toISOString(),
    measurements: [],
    operations: [],
    biomass: [],
    summary: {
      measurementSamples: 0,
      operationsCount: 0,
      biomassSamples: 0
    }
  };

  const historyState = useMemo(() => {
    if (hasHistoryData(historyQuery.data)) {
      return {
        ...historyQuery.data,
        isDemo: false
      };
    }

    return {
      ...selectedDemoHistory,
      isDemo: true
    };
  }, [historyQuery.data, selectedDemoHistory]);

  const lotsQuery = useQuery({
    queryKey: ["planning", "lots"],
    enabled: !pondsState.isDemo,
    queryFn: () => lotsRequest(accessToken)
  });

  const lotsState = useMemo(() => {
    const realLots = lotsQuery.data || [];
    if (realLots.length > 0) {
      return {
        rows: realLots,
        isDemo: false
      };
    }

    return {
      rows: demoDataset.lots,
      isDemo: true
    };
  }, [lotsQuery.data, demoDataset.lots]);

  const activeLotCode = lotCode || lotsState.rows[0]?.lot_code || "";

  const lotTimelineQuery = useQuery({
    queryKey: ["planning", "lot-timeline", activeLotCode],
    enabled: Boolean(activeLotCode) && !lotsState.isDemo,
    queryFn: () => lotTimelineRequest(accessToken, activeLotCode)
  });

  const lotTimelineState = useMemo(() => {
    const realRows = lotTimelineQuery.data?.timeline || [];
    if (realRows.length > 0) {
      return {
        rows: realRows,
        isDemo: false
      };
    }

    return {
      rows: demoDataset.timelineByLot.get(activeLotCode) || [],
      isDemo: true
    };
  }, [lotTimelineQuery.data, demoDataset.timelineByLot, activeLotCode]);

  const filteredTimelineRows = useMemo(() => {
    const searchTerm = timelineSearch.trim().toLowerCase();

    return lotTimelineState.rows.filter((event) => {
      const sourceMatches =
        timelineSourceFilter === "all" ? true : String(event.source) === timelineSourceFilter;

      if (!sourceMatches) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const searchable = [
        event.source,
        event.event_type,
        event.pond_name,
        event.note,
        event.status,
        event.route_label,
        event.external_code,
        event.quantity,
        event.quantity_unit,
        event.mix_with_lot_code,
        event.label_tags?.join(" ")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(searchTerm);
    });
  }, [lotTimelineState.rows, timelineSourceFilter, timelineSearch]);

  const timelineStats = useMemo(() => {
    const operationCount = filteredTimelineRows.filter((event) => event.source === "operation").length;
    const biomassCount = filteredTimelineRows.filter((event) => event.source === "biomass").length;
    const logisticsCount = filteredTimelineRows.filter((event) =>
      ["harvest_plan", "harvest_shipment", "live_transport_trip"].includes(event.source)
    ).length;

    const totalQuantity = filteredTimelineRows.reduce((sum, event) => {
      const numericQuantity = Number(event.quantity);
      return Number.isFinite(numericQuantity) ? sum + numericQuantity : sum;
    }, 0);

    return {
      totalEvents: filteredTimelineRows.length,
      operationCount,
      biomassCount,
      logisticsCount,
      totalQuantity
    };
  }, [filteredTimelineRows]);

  const showDemoNote = historyState.isDemo || lotsState.isDemo || lotTimelineState.isDemo;

  return (
    <section className="traceability-page">
      <article className="panel">
        <h3>Historial por piscina</h3>
        {showDemoNote ? (
          <p className="trace-demo-note">
            No hay datos reales suficientes para este rango. Se muestran datos demo de trazabilidad
            para que puedas probar filtros, lotes y auditoría operativa.
          </p>
        ) : null}
        <div className="filters-inline">
          <div>
            <label htmlFor="tracePond">Piscina</label>
            <select id="tracePond" value={activePondId} onChange={(event) => setPondId(event.target.value)}>
              {pondsState.rows.map((pond) => (
                <option key={pond.id} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="traceFrom">Desde</label>
            <input
              id="traceFrom"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="traceTo">Hasta</label>
            <input
              id="traceTo"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
        </div>

        <div className="trace-summary">
          <span>Muestras sensores: {historyState.summary?.measurementSamples || 0}</span>
          <span>Eventos operativos: {historyState.summary?.operationsCount || 0}</span>
          <span>Registros biomasa: {historyState.summary?.biomassSamples || 0}</span>
          <span>Modo: {historyState.isDemo ? "Demo" : "Real"}</span>
        </div>
      </article>

      <div className="trace-grid">
        <article className="panel">
          <h3>Parámetros físico-químicos</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Sensor</th>
                  <th>Promedio</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th>Muestras</th>
                </tr>
              </thead>
              <tbody>
                {historyState.measurements.length > 0 ? (
                  historyState.measurements.map((item) => (
                    <tr key={`${item.day}-${item.sensor_type}`}>
                      <td>{new Date(item.day).toLocaleDateString()}</td>
                      <td>{formatSensorType(item.sensor_type)}</td>
                      <td>{item.avg_value}</td>
                      <td>{item.min_value}</td>
                      <td>{item.max_value}</td>
                      <td>{item.samples}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="empty-text">No hay parámetros para este rango.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h3>Operaciones del período</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Lote</th>
                  <th>Etiquetas</th>
                </tr>
              </thead>
              <tbody>
                {historyState.operations.length > 0 ? (
                  historyState.operations.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.event_at).toLocaleString()}</td>
                      <td>{formatEventType(item.type)}</td>
                      <td>
                        {item.quantity} {item.quantity_unit}
                      </td>
                      <td>{item.lot_code || "-"}</td>
                      <td>{item.label_tags?.length ? item.label_tags.join(", ") : "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-text">No hay operaciones para este rango.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <article className="panel">
        <h3>Auditoría y trazabilidad por lote</h3>
        <div className="filters-inline trace-lot-toolbar">
          <div>
            <label htmlFor="traceLot">Lote</label>
            <select id="traceLot" value={activeLotCode} onChange={(event) => setLotCode(event.target.value)}>
              {lotsState.rows.map((item) => (
                <option key={item.lot_code} value={item.lot_code}>
                  {item.lot_code} ({item.total_events})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="timelineSource">Origen</label>
            <select
              id="timelineSource"
              value={timelineSourceFilter}
              onChange={(event) => setTimelineSourceFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              <option value="operation">Operación</option>
              <option value="biomass">Biomasa</option>
              <option value="harvest_plan">Plan de cosecha</option>
              <option value="harvest_shipment">Despacho</option>
              <option value="live_transport_trip">Transporte vivo</option>
            </select>
          </div>

          <div>
            <label htmlFor="timelineSearch">Buscar</label>
            <input
              id="timelineSearch"
              type="text"
              className="trace-search-input"
              placeholder="Evento, etiqueta, nota..."
              value={timelineSearch}
              onChange={(event) => setTimelineSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="trace-lot-kpi-grid">
          <div className="trace-lot-kpi-card">
            <span>Eventos visibles</span>
            <strong>{timelineStats.totalEvents}</strong>
          </div>
          <div className="trace-lot-kpi-card">
            <span>Operaciones</span>
            <strong>{timelineStats.operationCount}</strong>
          </div>
          <div className="trace-lot-kpi-card">
            <span>Muestras biomasa</span>
            <strong>{timelineStats.biomassCount}</strong>
          </div>
          <div className="trace-lot-kpi-card">
            <span>Eventos logísticos</span>
            <strong>{timelineStats.logisticsCount}</strong>
          </div>
          <div className="trace-lot-kpi-card">
            <span>Cantidad total movida</span>
            <strong>{timelineStats.totalQuantity.toFixed(2)}</strong>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Piscina</th>
                <th>Evento</th>
                <th>Estado</th>
                <th>Ruta / código</th>
                <th>Cantidad</th>
                <th>Biomasa</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {filteredTimelineRows.length > 0 ? (
                filteredTimelineRows.map((event, index) => (
                  <tr key={`${event.source}-${event.source_id}-${index}`}>
                    <td>{new Date(event.event_at).toLocaleString()}</td>
                    <td>{formatSourceType(event.source)}</td>
                    <td>{event.pond_name}</td>
                    <td>{formatEventType(event.event_type)}</td>
                    <td>{event.status || "-"}</td>
                    <td>
                      {event.route_label || "-"}
                      {event.external_code ? ` (${event.external_code})` : ""}
                    </td>
                    <td>
                      {event.quantity !== null && event.quantity !== undefined
                        ? `${event.quantity} ${event.quantity_unit || ""}`
                        : "-"}
                    </td>
                    <td>
                      {event.fish_count !== null && event.fish_count !== undefined
                        ? `${event.fish_count} peces / ${event.avg_weight_g} g`
                        : "-"}
                    </td>
                    <td>{event.note || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="empty-text">No hay eventos para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
