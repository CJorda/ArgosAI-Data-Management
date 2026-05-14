import { useEffect, useMemo, useState } from "react";
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

const pageMeta = {
  compuertas: {
    title: "Compuertas de entrada y salida",
    subtitle:
      "Lectura en tiempo real del porcentaje de apertura de compuertas hidráulicas. Solo monitorización, sin control remoto."
  },
  grupoElectrogeno: {
    title: "Grupo electrógeno",
    subtitle:
      "Estado del respaldo energético para continuidad de alimentación en caso de fallo de red. Solo monitorización."
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
  const normalizedMode = ["compuertas", "grupoElectrogeno", "bombas", "quitahojas"].includes(mode)
    ? mode
    : "compuertas";

  const [tick, setTick] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const timestampLabel = useMemo(() => new Date().toLocaleString(), [tick]);

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

  const generator = useMemo(() => {
    const loadPct = wave(36, 14, tick, 7, 0, 92);
    const fuelPct = wave(74, 8, tick, 8, 20, 100);
    const running = loadPct > 2;

    return {
      state: running ? "En servicio" : "Stand-by",
      frequencyHz: running ? wave(50, 0.2, tick, 9, 49.4, 50.6, 2) : 0,
      voltageV: running ? wave(400, 6, tick, 10, 370, 430, 0) : 0,
      rpm: running ? Math.round(wave(1500, 28, tick, 11, 1200, 1600, 0)) : 0,
      loadPct,
      powerKw: running ? Number((loadPct * 2.45).toFixed(1)) : 0,
      fuelPct,
      oilPressureBar: running ? wave(4.8, 0.3, tick, 12, 3.8, 6.2, 2) : 0,
      engineTempC: running ? wave(79, 4.5, tick, 13, 62, 96, 1) : 0,
      autonomyHours: Math.max(6, Math.round((fuelPct / Math.max(loadPct, 12)) * 18))
    };
  }, [tick]);

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
        <article className="panel automation-panel">
          <h3>Estado operativo</h3>
          <div className="automation-kpi-grid">
            <GeneratorKpi title="Estado" value={generator.state} detail="Modo automático" />
            <GeneratorKpi title="Frecuencia" value={`${formatNumber(generator.frequencyHz, 2)} Hz`} detail="Salida alterna" />
            <GeneratorKpi title="Tensión" value={`${formatNumber(generator.voltageV, 0)} V`} detail="Trifásica" />
            <GeneratorKpi title="RPM" value={formatNumber(generator.rpm, 0)} detail="Velocidad motor" />
            <GeneratorKpi title="Carga" value={`${formatNumber(generator.loadPct, 1)}%`} detail="Factor de uso" />
            <GeneratorKpi title="Potencia" value={`${formatNumber(generator.powerKw, 1)} kW`} detail="Activa" />
            <GeneratorKpi title="Combustible" value={`${formatNumber(generator.fuelPct, 1)}%`} detail={`${generator.autonomyHours} h autonomía`} />
            <GeneratorKpi title="Aceite/Temp" value={`${formatNumber(generator.oilPressureBar, 2)} bar`} detail={`${formatNumber(generator.engineTempC, 1)} C`} />
          </div>
        </article>
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
