import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import "./PlantAutomationEquipmentPage.css";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function wave(base, amplitude, tick, offset = 0, min = 0, max = 100, digits = 1) {
  const raw = base + Math.sin((tick + offset) * 0.72) * amplitude;
  return Number(clamp(raw, min, max).toFixed(digits));
}

function formatNumber(value, digits = 1) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return numeric.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function gateStateLabel(openPct) {
  if (openPct <= 5) return "Cerrada";
  if (openPct <= 35) return "Apertura baja";
  if (openPct <= 75) return "Apertura media";
  return "Apertura alta";
}

function intensityClass(value, low = 35, high = 70) {
  if (value >= high) return "automation-meter-high";
  if (value >= low) return "automation-meter-medium";
  return "automation-meter-low";
}

function GateCard({ gate }) {
  return (
    <article className="automation-item-card">
      <div className="automation-item-head">
        <strong>{gate.code}</strong>
        <span>{gate.location}</span>
      </div>

      <p className="automation-item-kpi">
        <span>Apertura</span>
        <strong>{formatNumber(gate.openPct, 1)}%</strong>
      </p>

      <div className="automation-meter-track" role="img" aria-label={`Apertura ${gate.code}: ${formatNumber(gate.openPct, 1)} por ciento`}>
        <div
          className={`automation-meter-fill ${intensityClass(gate.openPct)}`.trim()}
          style={{ width: `${gate.openPct}%` }}
        />
      </div>

      <p className="automation-item-note">Estado: {gateStateLabel(gate.openPct)}</p>
    </article>
  );
}

function PumpCard({ pump }) {
  return (
    <article className="automation-item-card">
      <div className="automation-item-head">
        <strong>{pump.code}</strong>
        <span>{pump.line}</span>
      </div>

      <div className="automation-item-grid">
        <p>
          <span>Velocidad</span>
          <strong>{formatNumber(pump.speedPct, 1)}%</strong>
        </p>
        <p>
          <span>Caudal</span>
          <strong>{formatNumber(pump.flowM3h, 1)} m3/h</strong>
        </p>
        <p>
          <span>Presión</span>
          <strong>{formatNumber(pump.pressureBar, 2)} bar</strong>
        </p>
        <p>
          <span>Consumo</span>
          <strong>{formatNumber(pump.powerKw, 1)} kW</strong>
        </p>
      </div>

      <div className="automation-meter-track" role="img" aria-label={`Carga variador ${pump.code}: ${formatNumber(pump.speedPct, 1)} por ciento`}>
        <div
          className={`automation-meter-fill ${intensityClass(pump.speedPct, 45, 78)}`.trim()}
          style={{ width: `${pump.speedPct}%` }}
        />
      </div>

      <p className="automation-item-note">Estado: {pump.online ? "Operativa" : "En espera"}</p>
    </article>
  );
}

function SweeperCard({ unit }) {
  return (
    <article className="automation-item-card">
      <div className="automation-item-head">
        <strong>{unit.code}</strong>
        <span>{unit.line}</span>
      </div>

      <div className="automation-item-grid">
        <p>
          <span>Velocidad banda</span>
          <strong>{formatNumber(unit.beltSpeedMMin, 1)} m/min</strong>
        </p>
        <p>
          <span>Carga malla</span>
          <strong>{formatNumber(unit.meshLoadPct, 1)}%</strong>
        </p>
        <p>
          <span>Tolva ocupada</span>
          <strong>{formatNumber(unit.hopperPct, 1)}%</strong>
        </p>
        <p>
          <span>Ciclos limpieza</span>
          <strong>{formatNumber(unit.cleaningCyclesHour, 1)} /h</strong>
        </p>
      </div>

      <div className="automation-meter-track" role="img" aria-label={`Carga de malla ${unit.code}: ${formatNumber(unit.meshLoadPct, 1)} por ciento`}>
        <div
          className={`automation-meter-fill ${intensityClass(unit.meshLoadPct, 40, 80)}`.trim()}
          style={{ width: `${unit.meshLoadPct}%` }}
        />
      </div>

      <p className="automation-item-note">Modo: {unit.mode}</p>
    </article>
  );
}

function GeneratorKpi({ title, value, detail }) {
  return (
    <article className="automation-kpi-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function buildTimeLabels(points, daysSpan) {
  const now = new Date();
  const useHourly = daysSpan <= 2;
  const stepMs = useHourly
    ? Math.max(1, Math.floor((daysSpan * 24) / Math.max(points, 1))) * 3600 * 1000
    : Math.max(1, Math.floor(daysSpan / Math.max(points, 1))) * 24 * 3600 * 1000;

  return Array.from({ length: points }, (_, index) => {
    const date = new Date(now.getTime() - (points - 1 - index) * stepMs);
    if (useHourly) {
      return `${String(date.getHours()).padStart(2, "0")}:00`;
    }

    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

const pageMeta = {
  compuertas: {
    title: "Compuertas de entrada y salida",
    subtitle:
      "Lectura en tiempo real del porcentaje de apertura de compuertas hidráulicas. Solo monitorización, sin control remoto."
  },
  grupoElectrogeno: {
    title: "Grupos electrógenos",
    subtitle:
      "Estado del respaldo energético para continuidad de alimentación en caso de fallo de red. Solo monitorización."
  },
  consumoElectrico: {
    title: "Consumo eléctrico de planta",
    subtitle:
      "Supervisión consolidada del consumo energético total y por áreas operativas. Solo monitorización."
  },
  generacionSolar: {
    title: "Generación solar",
    subtitle:
      "Seguimiento de generación fotovoltaica, autoconsumo y respaldo con baterías cuando exista instalación solar."
  },
  estacionMeteorologica: {
    title: "Estación meteorológica",
    subtitle:
      "Seguimiento local de condiciones meteorológicas para anticipar impacto sobre oxigenación, temperatura y operación."
  },
  bombas: {
    title: "Bombas de impulsión",
    subtitle:
      "Seguimiento de bombas de agua para impulsión en entrada/salida de proceso. Solo lectura de telemetría."
  },
  quitahojas: {
    title: "Maquinaria quitahojas",
    subtitle:
      "Monitoreo del equipo de retirada de hojas y sólidos flotantes en canales de agua. Solo lectura."
  }
};

export function PlantAutomationEquipmentPage({ mode = "compuertas" }) {
  const normalizedMode = [
    "compuertas",
    "grupoElectrogeno",
    "consumoElectrico",
    "generacionSolar",
    "estacionMeteorologica",
    "bombas",
    "quitahojas"
  ].includes(mode)
    ? mode
    : "compuertas";

  const [tick, setTick] = useState(0);
  const [timePreset, setTimePreset] = useState("24h");
  const [calendarFrom, setCalendarFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  });
  const [calendarTo, setCalendarTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const timestampLabel = useMemo(() => new Date().toLocaleString(), [tick]);
  const presetDays = timePreset === "7d" ? 7 : timePreset === "30d" ? 30 : 1;

  const effectiveDaysSpan = useMemo(() => {
    const fromDate = new Date(calendarFrom);
    const toDate = new Date(calendarTo);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return presetDays;
    }

    const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 3600 * 1000)) + 1;
    return clamp(diffDays, 1, 90);
  }, [calendarFrom, calendarTo, presetDays]);

  const chartPointCount = effectiveDaysSpan <= 2 ? 24 : effectiveDaysSpan <= 10 ? 10 : 14;

  const gateSections = useMemo(() => {
    const incoming = [
      {
        code: "CE-01",
        location: "Canal de entrada norte",
        openPct: wave(58, 17, tick, 1)
      },
      {
        code: "CE-02",
        location: "Canal de entrada sur",
        openPct: wave(44, 21, tick, 2)
      }
    ];

    const outgoing = [
      {
        code: "CS-01",
        location: "Salida clarificador 1",
        openPct: wave(62, 19, tick, 3)
      },
      {
        code: "CS-02",
        location: "Salida clarificador 2",
        openPct: wave(39, 24, tick, 4)
      },
      {
        code: "CS-03",
        location: "Canal de descarga A",
        openPct: wave(52, 22, tick, 5)
      },
      {
        code: "CS-04",
        location: "Canal de descarga B",
        openPct: wave(33, 25, tick, 6)
      }
    ];

    return [
      { title: "Compuertas de entrada", gates: incoming },
      { title: "Compuertas de salida", gates: outgoing }
    ];
  }, [tick]);

  const generatorUnits = useMemo(() => {
    const units = [
      { code: "GE-01", zone: "Cabecera norte", baseLoad: 44, fuelBase: 78, powerFactor: 2.65 },
      { code: "GE-02", zone: "Cabecera centro", baseLoad: 18, fuelBase: 66, powerFactor: 2.35 },
      { code: "GE-03", zone: "Cabecera sur", baseLoad: 0.5, fuelBase: 92, powerFactor: 2.85 }
    ];

    return units.map((unit, index) => {
      const loadPct = wave(unit.baseLoad, 13, tick, 7 + index, 0, 95);
      const fuelPct = wave(unit.fuelBase, 7, tick, 12 + index, 12, 100);
      const running = loadPct > 4;

      return {
        ...unit,
        state: running ? "En servicio" : "Stand-by",
        frequencyHz: running ? wave(50, 0.22, tick, 18 + index, 49.3, 50.7, 2) : 0,
        voltageV: running ? wave(400, 7, tick, 24 + index, 370, 430, 0) : 0,
        rpm: running ? Math.round(wave(1500, 32, tick, 30 + index, 1200, 1600, 0)) : 0,
        loadPct,
        powerKw: running ? Number((loadPct * unit.powerFactor).toFixed(1)) : 0,
        fuelPct,
        oilPressureBar: running ? wave(4.8, 0.35, tick, 36 + index, 3.6, 6.3, 2) : 0,
        engineTempC: running ? wave(80, 4.8, tick, 42 + index, 62, 97, 1) : 0,
        autonomyHours: Math.max(5, Math.round((fuelPct / Math.max(loadPct, 11)) * 18))
      };
    });
  }, [tick]);

  const generatorSummary = useMemo(() => {
    const runningUnits = generatorUnits.filter((unit) => unit.state === "En servicio").length;
    const totalPowerKw = generatorUnits.reduce((sum, unit) => sum + unit.powerKw, 0);
    const avgFuel =
      generatorUnits.length > 0
        ? generatorUnits.reduce((sum, unit) => sum + unit.fuelPct, 0) / generatorUnits.length
        : 0;
    const maxAutonomy = Math.max(...generatorUnits.map((unit) => unit.autonomyHours));

    return {
      runningUnits,
      totalPowerKw,
      avgFuel,
      maxAutonomy
    };
  }, [generatorUnits]);

  const plantConsumption = useMemo(() => {
    const byArea = [
      { name: "Impulsión y recirculación", kw: wave(312, 46, tick, 84, 180, 460, 1) },
      { name: "Oxigenación y aireación", kw: wave(184, 34, tick, 85, 80, 320, 1) },
      { name: "Líneas de proceso", kw: wave(146, 22, tick, 86, 70, 260, 1) },
      { name: "Auxiliares y servicios", kw: wave(94, 18, tick, 87, 40, 180, 1) }
    ];
    const totalKw = byArea.reduce((sum, area) => sum + area.kw, 0);
    const contractedKw = 980;

    return {
      byArea,
      totalKw,
      contractedKw,
      demandPct: (totalKw / contractedKw) * 100,
      powerFactor: wave(0.94, 0.03, tick, 88, 0.82, 1, 2),
      importedMwhToday: wave(11.4, 1.8, tick, 89, 4, 26, 2),
      estimatedCostEurDay: wave(2190, 280, tick, 90, 1200, 4200, 0)
    };
  }, [tick]);

  const solarPlant = useMemo(() => {
    const generationKw = wave(228, 112, tick, 96, 0, 490, 1);
    const selfConsumptionKw = Math.min(generationKw, plantConsumption.totalKw);
    const exportKw = Math.max(0, generationKw - plantConsumption.totalKw);

    return {
      generationKw,
      selfConsumptionPct: generationKw > 0 ? (selfConsumptionKw / generationKw) * 100 : 0,
      solarCoverPct:
        plantConsumption.totalKw > 0 ? (selfConsumptionKw / plantConsumption.totalKw) * 100 : 0,
      exportKw,
      batterySoc: wave(62, 19, tick, 97, 8, 100, 1),
      batteryPowerKw: wave(18, 34, tick, 98, -90, 120, 1),
      pvYieldMwhDay: wave(2.8, 0.9, tick, 99, 0.4, 6.2, 2),
      co2AvoidedKgDay: wave(1280, 240, tick, 100, 300, 2400, 0)
    };
  }, [tick, plantConsumption.totalKw]);

  const weatherNow = useMemo(
    () => ({
      temperatureC: wave(19.8, 6.4, tick, 201, 5, 35, 1),
      humidityPct: wave(67, 14, tick, 202, 22, 100, 1),
      pressureHpa: wave(1013, 9, tick, 203, 985, 1045, 0),
      windMs: wave(4.8, 2.7, tick, 204, 0, 18, 1),
      windDirDeg: Math.round(wave(188, 140, tick, 205, 0, 360, 0)),
      rainMmH: wave(1.1, 1.6, tick, 206, 0, 12, 1),
      solarIrradianceWm2: wave(460, 280, tick, 207, 0, 1100, 0)
    }),
    [tick]
  );

  const generatorTrendOption = useMemo(() => {
    const labels = buildTimeLabels(chartPointCount, effectiveDaysSpan);
    const series = generatorUnits.map((unit, unitIndex) => ({
      name: unit.code,
      type: "line",
      smooth: true,
      symbol: "none",
      lineStyle: { width: 2 },
      data: labels.map((_, idx) =>
        wave(unit.loadPct, 16, tick + idx, 110 + unitIndex * 5 + idx, 0, 100, 1)
      )
    }));

    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 36, right: 16, top: 42, bottom: 30 },
      xAxis: { type: "category", data: labels, boundaryGap: false },
      yAxis: { type: "value", min: 0, max: 100, axisLabel: { formatter: "{value}%" } },
      series,
      color: ["#2f6ca8", "#3ea477", "#e09b39"]
    };
  }, [generatorUnits, tick, chartPointCount, effectiveDaysSpan]);

  const consumptionSplitOption = useMemo(() => {
    const pieData = plantConsumption.byArea.map((area) => ({ name: area.name, value: area.kw }));

    return {
      tooltip: { trigger: "item", valueFormatter: (value) => `${formatNumber(value, 1)} kW` },
      legend: { bottom: 0 },
      series: [
        {
          type: "pie",
          radius: ["45%", "72%"],
          center: ["50%", "45%"],
          label: { formatter: "{b}\n{d}%" },
          data: pieData
        }
      ],
      color: ["#2f6ca8", "#46b889", "#e09b39", "#7f8da6"]
    };
  }, [plantConsumption.byArea]);

  const demandTrendOption = useMemo(() => {
    const labels = buildTimeLabels(chartPointCount, effectiveDaysSpan);
    const demand = labels.map((_, idx) => wave(plantConsumption.totalKw, 52, tick + idx, 140 + idx, 120, 980, 1));

    return {
      tooltip: { trigger: "axis" },
      grid: { left: 42, right: 18, top: 18, bottom: 28 },
      xAxis: { type: "category", data: labels, boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: "{value} kW" } },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "none",
          areaStyle: { opacity: 0.18 },
          lineStyle: { width: 2.4 },
          data: demand,
          markLine: {
            symbol: "none",
            lineStyle: { type: "dashed", color: "#c86f52" },
            data: [{ yAxis: plantConsumption.contractedKw, name: "Contratada" }]
          }
        }
      ],
      color: ["#2f6ca8"]
    };
  }, [plantConsumption.totalKw, plantConsumption.contractedKw, tick, chartPointCount, effectiveDaysSpan]);

  const solarBalanceOption = useMemo(() => {
    const labels = buildTimeLabels(chartPointCount, effectiveDaysSpan);
    const generation = labels.map((_, idx) => wave(solarPlant.generationKw, 78, tick + idx, 170 + idx, 0, 520, 1));
    const demand = labels.map((_, idx) => wave(plantConsumption.totalKw, 45, tick + idx, 190 + idx, 120, 980, 1));

    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 42, right: 18, top: 34, bottom: 28 },
      xAxis: { type: "category", data: labels, boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: "{value} kW" } },
      series: [
        {
          name: "Generación FV",
          type: "line",
          smooth: true,
          symbol: "none",
          areaStyle: { opacity: 0.2 },
          data: generation
        },
        {
          name: "Demanda planta",
          type: "line",
          smooth: true,
          symbol: "none",
          data: demand
        }
      ],
      color: ["#e09b39", "#2f6ca8"]
    };
  }, [solarPlant.generationKw, plantConsumption.totalKw, tick, chartPointCount, effectiveDaysSpan]);

  const weatherTrendOption = useMemo(() => {
    const labels = buildTimeLabels(chartPointCount, effectiveDaysSpan);
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 42, right: 42, top: 36, bottom: 28 },
      xAxis: { type: "category", data: labels, boundaryGap: false },
      yAxis: [
        { type: "value", name: "Temp/Humedad", axisLabel: { formatter: "{value}" } },
        { type: "value", name: "Viento", axisLabel: { formatter: "{value} m/s" } }
      ],
      series: [
        {
          name: "Temperatura C",
          type: "line",
          smooth: true,
          symbol: "none",
          data: labels.map((_, idx) => wave(weatherNow.temperatureC, 3.2, tick + idx, 230 + idx, -2, 40, 1))
        },
        {
          name: "Humedad %",
          type: "line",
          smooth: true,
          symbol: "none",
          data: labels.map((_, idx) => wave(weatherNow.humidityPct, 11, tick + idx, 240 + idx, 18, 100, 1))
        },
        {
          name: "Viento m/s",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbol: "none",
          data: labels.map((_, idx) => wave(weatherNow.windMs, 2.4, tick + idx, 250 + idx, 0, 22, 1))
        }
      ],
      color: ["#d77446", "#2f6ca8", "#46b889"]
    };
  }, [chartPointCount, effectiveDaysSpan, weatherNow.temperatureC, weatherNow.humidityPct, weatherNow.windMs, tick]);

  const weatherPrecipOption = useMemo(() => {
    const labels = buildTimeLabels(chartPointCount, effectiveDaysSpan);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 42, right: 16, top: 20, bottom: 28 },
      xAxis: { type: "category", data: labels },
      yAxis: { type: "value", axisLabel: { formatter: "{value} mm/h" } },
      series: [
        {
          name: "Lluvia",
          type: "bar",
          barMaxWidth: 22,
          data: labels.map((_, idx) => wave(weatherNow.rainMmH, 1.7, tick + idx, 260 + idx, 0, 14, 1))
        }
      ],
      color: ["#5c88c7"]
    };
  }, [chartPointCount, effectiveDaysSpan, weatherNow.rainMmH, tick]);

  const pumps = useMemo(() => {
    const definitions = [
      { code: "B-01", line: "Impulsión entrada principal", basePct: 74, maxFlow: 268, basePressure: 2.85 },
      { code: "B-02", line: "Impulsión entrada auxiliar", basePct: 61, maxFlow: 230, basePressure: 2.45 },
      { code: "B-03", line: "Recirculación proceso", basePct: 57, maxFlow: 210, basePressure: 2.22 },
      { code: "B-04", line: "Descarga tratamiento", basePct: 48, maxFlow: 195, basePressure: 2.05 }
    ];

    return definitions.map((pump, index) => {
      const speedPct = wave(pump.basePct, 15, tick, 20 + index, 0, 100);
      const online = speedPct >= 6;
      const flowM3h = online ? Number(((speedPct / 100) * pump.maxFlow).toFixed(1)) : 0;
      const pressureBar = online ? wave(pump.basePressure, 0.24, tick, 30 + index, 1.2, 3.8, 2) : 0;
      const powerKw = online ? Number((flowM3h * 0.36).toFixed(1)) : 0;

      return {
        ...pump,
        speedPct,
        flowM3h,
        pressureBar,
        powerKw,
        online
      };
    });
  }, [tick]);

  const sweepers = useMemo(() => {
    const definitions = [
      { code: "QH-01", line: "Canal de entrada norte" },
      { code: "QH-02", line: "Canal de salida principal" }
    ];

    return definitions.map((unit, index) => {
      const meshLoadPct = wave(54, 24, tick, 40 + index, 0, 100);
      return {
        ...unit,
        beltSpeedMMin: wave(12.4, 2.8, tick, 50 + index, 0.8, 20, 1),
        meshLoadPct,
        hopperPct: wave(48, 22, tick, 60 + index, 0, 100),
        cleaningCyclesHour: wave(6.2, 2.1, tick, 70 + index, 0, 20, 1),
        mode: meshLoadPct > 72 ? "Limpieza intensiva" : "Automático"
      };
    });
  }, [tick]);

  return (
    <section className="automation-page">
      <article className="panel automation-panel">
        <h3>{pageMeta[normalizedMode].title}</h3>
        <p className="automation-intro">{pageMeta[normalizedMode].subtitle}</p>
        <div className="automation-time-toolbar">
          <label htmlFor="automationTimePreset">Rango</label>
          <select
            id="automationTimePreset"
            value={timePreset}
            onChange={(event) => setTimePreset(event.target.value)}
          >
            <option value="24h">Últimas 24h</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
          </select>

          <label htmlFor="automationCalendarFrom">Desde</label>
          <input
            id="automationCalendarFrom"
            type="date"
            value={calendarFrom}
            onChange={(event) => setCalendarFrom(event.target.value)}
          />

          <label htmlFor="automationCalendarTo">Hasta</label>
          <input
            id="automationCalendarTo"
            type="date"
            value={calendarTo}
            onChange={(event) => setCalendarTo(event.target.value)}
          />
        </div>
        <p className="automation-readonly-note">
          Estado de solo lectura. No hay actuaciones remotas desde esta pantalla.
        </p>
        <p className="automation-timestamp">Última actualización: {timestampLabel}</p>
      </article>

      {normalizedMode === "compuertas" ? (
        <div className="automation-section-stack">
          {gateSections.map((section) => (
            <article key={section.title} className="panel automation-panel">
              <h3>{section.title}</h3>
              <div className="automation-grid automation-grid-2">
                {section.gates.map((gate) => (
                  <GateCard key={gate.code} gate={gate} />
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {normalizedMode === "grupoElectrogeno" ? (
        <div className="automation-section-stack">
          <article className="panel automation-panel">
            <h3>Resumen de respaldo</h3>
            <div className="automation-kpi-grid">
              <GeneratorKpi title="En servicio" value={`${generatorSummary.runningUnits}/${generatorUnits.length}`} detail="Unidades activas" />
              <GeneratorKpi title="Potencia total" value={`${formatNumber(generatorSummary.totalPowerKw, 1)} kW`} detail="Entrega agregada" />
              <GeneratorKpi title="Combustible medio" value={`${formatNumber(generatorSummary.avgFuel, 1)}%`} detail="Tanques principales" />
              <GeneratorKpi title="Autonomía máxima" value={`${formatNumber(generatorSummary.maxAutonomy, 0)} h`} detail="Mejor unidad" />
            </div>
          </article>

          <article className="panel automation-panel">
            <h3>Estado por grupo electrógeno</h3>
            <div className="automation-grid automation-grid-2">
              {generatorUnits.map((unit) => (
                <article key={unit.code} className="automation-item-card">
                  <div className="automation-item-head">
                    <strong>{unit.code}</strong>
                    <span>{unit.zone}</span>
                  </div>

                  <div className="automation-item-grid">
                    <p>
                      <span>Estado</span>
                      <strong>{unit.state}</strong>
                    </p>
                    <p>
                      <span>Frecuencia / tensión</span>
                      <strong>{formatNumber(unit.frequencyHz, 2)} Hz / {formatNumber(unit.voltageV, 0)} V</strong>
                    </p>
                    <p>
                      <span>RPM / carga</span>
                      <strong>{formatNumber(unit.rpm, 0)} / {formatNumber(unit.loadPct, 1)}%</strong>
                    </p>
                    <p>
                      <span>Potencia activa</span>
                      <strong>{formatNumber(unit.powerKw, 1)} kW</strong>
                    </p>
                    <p>
                      <span>Combustible</span>
                      <strong>{formatNumber(unit.fuelPct, 1)}% ({formatNumber(unit.autonomyHours, 0)} h)</strong>
                    </p>
                    <p>
                      <span>Aceite / temperatura</span>
                      <strong>{formatNumber(unit.oilPressureBar, 2)} bar / {formatNumber(unit.engineTempC, 1)} C</strong>
                    </p>
                  </div>

                  <div className="automation-meter-track" role="img" aria-label={`Carga ${unit.code}: ${formatNumber(unit.loadPct, 1)} por ciento`}>
                    <div
                      className={`automation-meter-fill ${intensityClass(unit.loadPct, 45, 75)}`.trim()}
                      style={{ width: `${unit.loadPct}%` }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="panel automation-panel">
            <h3>Tendencia de carga por grupo (12h)</h3>
            <ReactECharts option={generatorTrendOption} className="automation-chart" notMerge lazyUpdate />
          </article>
        </div>
      ) : null}

      {normalizedMode === "consumoElectrico" ? (
        <div className="automation-section-stack">
          <article className="panel automation-panel">
            <h3>Resumen energético de planta</h3>
            <div className="automation-kpi-grid">
              <GeneratorKpi title="Demanda total" value={`${formatNumber(plantConsumption.totalKw, 1)} kW`} detail="Carga instantánea" />
              <GeneratorKpi title="Demanda contratada" value={`${formatNumber(plantConsumption.contractedKw, 0)} kW`} detail="Límite contractual" />
              <GeneratorKpi title="Uso de contrato" value={`${formatNumber(plantConsumption.demandPct, 1)}%`} detail="Fracción contratada" />
              <GeneratorKpi title="Factor de potencia" value={formatNumber(plantConsumption.powerFactor, 2)} detail="Objetivo > 0.95" />
              <GeneratorKpi title="Importación hoy" value={`${formatNumber(plantConsumption.importedMwhToday, 2)} MWh`} detail="Acumulado diario" />
              <GeneratorKpi title="Coste estimado" value={`${formatNumber(plantConsumption.estimatedCostEurDay, 0)} EUR`} detail="Proyección diaria" />
            </div>
          </article>

          <article className="panel automation-panel">
            <h3>Consumo por área operativa</h3>
            <div className="automation-grid automation-grid-2">
              {plantConsumption.byArea.map((area) => {
                const areaPct = (area.kw / Math.max(plantConsumption.totalKw, 1)) * 100;

                return (
                  <article key={area.name} className="automation-item-card">
                    <p className="automation-item-kpi">
                      <span>{area.name}</span>
                      <strong>{formatNumber(area.kw, 1)} kW</strong>
                    </p>
                    <div className="automation-meter-track" role="img" aria-label={`Consumo ${area.name}: ${formatNumber(areaPct, 1)} por ciento del total`}>
                      <div
                        className={`automation-meter-fill ${intensityClass(areaPct, 22, 34)}`.trim()}
                        style={{ width: `${Math.min(areaPct, 100)}%` }}
                      />
                    </div>
                    <p className="automation-item-note">Participación: {formatNumber(areaPct, 1)}% del total</p>
                  </article>
                );
              })}
            </div>
          </article>

          <article className="panel automation-panel">
            <h3>Gráficas de consumo eléctrico</h3>
            <div className="automation-grid automation-grid-2">
              <ReactECharts option={consumptionSplitOption} className="automation-chart" notMerge lazyUpdate />
              <ReactECharts option={demandTrendOption} className="automation-chart" notMerge lazyUpdate />
            </div>
          </article>
        </div>
      ) : null}

      {normalizedMode === "generacionSolar" ? (
        <div className="automation-section-stack">
          <article className="panel automation-panel">
            <h3>Resumen fotovoltaico</h3>
            <div className="automation-kpi-grid">
              <GeneratorKpi title="Generación FV" value={`${formatNumber(solarPlant.generationKw, 1)} kW`} detail="Potencia instantánea" />
              <GeneratorKpi title="Cobertura planta" value={`${formatNumber(solarPlant.solarCoverPct, 1)}%`} detail="Demanda cubierta por solar" />
              <GeneratorKpi title="Autoconsumo" value={`${formatNumber(solarPlant.selfConsumptionPct, 1)}%`} detail="De la generación FV" />
              <GeneratorKpi title="Exportación" value={`${formatNumber(solarPlant.exportKw, 1)} kW`} detail="Excedente a red" />
              <GeneratorKpi title="Estado batería" value={`${formatNumber(solarPlant.batterySoc, 1)}%`} detail={`${formatNumber(solarPlant.batteryPowerKw, 1)} kW netos`} />
              <GeneratorKpi title="Energía solar día" value={`${formatNumber(solarPlant.pvYieldMwhDay, 2)} MWh`} detail={`${formatNumber(solarPlant.co2AvoidedKgDay, 0)} kg CO2 evitados`} />
            </div>
          </article>

          <article className="panel automation-panel">
            <h3>Balance instantáneo</h3>
            <div className="automation-grid automation-grid-2">
              <article className="automation-item-card">
                <p className="automation-item-kpi">
                  <span>Demanda total de planta</span>
                  <strong>{formatNumber(plantConsumption.totalKw, 1)} kW</strong>
                </p>
                <div className="automation-meter-track" role="img" aria-label={`Cobertura solar ${formatNumber(solarPlant.solarCoverPct, 1)} por ciento`}>
                  <div
                    className={`automation-meter-fill ${intensityClass(solarPlant.solarCoverPct, 20, 55)}`.trim()}
                    style={{ width: `${Math.min(solarPlant.solarCoverPct, 100)}%` }}
                  />
                </div>
                <p className="automation-item-note">Cobertura solar de la demanda: {formatNumber(solarPlant.solarCoverPct, 1)}%</p>
              </article>

              <article className="automation-item-card">
                <div className="automation-item-grid">
                  <p>
                    <span>Generación FV instantánea</span>
                    <strong>{formatNumber(solarPlant.generationKw, 1)} kW</strong>
                  </p>
                  <p>
                    <span>Importación estimada red</span>
                    <strong>{formatNumber(Math.max(0, plantConsumption.totalKw - solarPlant.generationKw), 1)} kW</strong>
                  </p>
                  <p>
                    <span>Exportación red</span>
                    <strong>{formatNumber(solarPlant.exportKw, 1)} kW</strong>
                  </p>
                  <p>
                    <span>Batería (SOC / potencia)</span>
                    <strong>{formatNumber(solarPlant.batterySoc, 1)}% / {formatNumber(solarPlant.batteryPowerKw, 1)} kW</strong>
                  </p>
                </div>
              </article>
            </div>
          </article>

          <article className="panel automation-panel">
            <h3>Curva solar vs demanda (12h)</h3>
            <ReactECharts option={solarBalanceOption} className="automation-chart" notMerge lazyUpdate />
          </article>
        </div>
      ) : null}

      {normalizedMode === "estacionMeteorologica" ? (
        <div className="automation-section-stack">
          <article className="panel automation-panel">
            <h3>Estado meteorológico actual</h3>
            <div className="automation-kpi-grid">
              <GeneratorKpi title="Temperatura" value={`${formatNumber(weatherNow.temperatureC, 1)} C`} detail="Ambiente" />
              <GeneratorKpi title="Humedad" value={`${formatNumber(weatherNow.humidityPct, 1)}%`} detail="Relativa" />
              <GeneratorKpi title="Presión" value={`${formatNumber(weatherNow.pressureHpa, 0)} hPa`} detail="Atmósfera" />
              <GeneratorKpi title="Viento" value={`${formatNumber(weatherNow.windMs, 1)} m/s`} detail={`${formatNumber(weatherNow.windDirDeg, 0)} grados`} />
              <GeneratorKpi title="Lluvia" value={`${formatNumber(weatherNow.rainMmH, 1)} mm/h`} detail="Intensidad" />
              <GeneratorKpi title="Radiación" value={`${formatNumber(weatherNow.solarIrradianceWm2, 0)} W/m2`} detail="Irradiancia" />
            </div>
          </article>

          <article className="panel automation-panel">
            <h3>Tendencias meteorológicas</h3>
            <div className="automation-grid automation-grid-2">
              <ReactECharts option={weatherTrendOption} className="automation-chart" notMerge lazyUpdate />
              <ReactECharts option={weatherPrecipOption} className="automation-chart" notMerge lazyUpdate />
            </div>
          </article>
        </div>
      ) : null}

      {normalizedMode === "bombas" ? (
        <article className="panel automation-panel">
          <h3>Bombas de impulsión</h3>
          <div className="automation-grid automation-grid-2">
            {pumps.map((pump) => (
              <PumpCard key={pump.code} pump={pump} />
            ))}
          </div>
        </article>
      ) : null}

      {normalizedMode === "quitahojas" ? (
        <article className="panel automation-panel">
          <h3>Equipos quitahojas</h3>
          <div className="automation-grid automation-grid-2">
            {sweepers.map((unit) => (
              <SweeperCard key={unit.code} unit={unit} />
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
