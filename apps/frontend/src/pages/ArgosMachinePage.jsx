import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { flushSync } from "react-dom";
import { useParams } from "react-router-dom";
import { cameraSessionsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./ArgosMachinePage.css";

const machineProfiles = {
  "growth-nano": {
    key: "growth-nano",
    name: "ArgosAI Growth Nano",
    machineType: "ArgosAI Growth Nano",
    throughput: "Hasta 60 peces/min",
    cameraSpec: "Cámara compacta USB3",
    species: "Rodaballo",
    durationMinutes: 12,
    description:
      "Equipo compacto para conteo y biomasa en líneas de bajo caudal, ideal para validación de lotes y muestreo diario.",
    instances: [
      {
        machineId: "ARG-NANO-CAM-01",
        label: "Growth Nano 1",
        startTank: "Tanque 1",
        endTank: "Tanque A"
      },
      {
        machineId: "ARG-NANO-CAM-02",
        label: "Growth Nano 2",
        startTank: "Tanque 2",
        endTank: "Tanque B"
      }
    ]
  },
  "growth-s": {
    key: "growth-s",
    name: "ArgosAI Growth S",
    machineType: "ArgosAI Growth S",
    throughput: "Hasta 120 peces/min",
    cameraSpec: "Cámara industrial FLIR",
    species: "Rodaballo",
    durationMinutes: 16,
    description:
      "Versión estándar para operación continua en granja, con seguimiento de conteo por tanda y biomasa estimada por paso.",
    instances: [
      {
        machineId: "ARG-S-CAM-02",
        label: "Growth S 1",
        startTank: "Tanque 3",
        endTank: "Tanque C"
      }
    ]
  },
  "growth-l": {
    key: "growth-l",
    name: "ArgosAI Growth L",
    machineType: "ArgosAI Growth L",
    throughput: "Hasta 220 peces/min",
    cameraSpec: "Cámara industrial dual",
    species: "Rodaballo",
    durationMinutes: 20,
    description:
      "Versión de alto caudal pensada para lotes grandes, con mayor cobertura de paso y consolidación por ciclo.",
    instances: [
      {
        machineId: "ARG-L-CAM-03",
        label: "Growth L 1",
        startTank: "Tanque 4",
        endTank: "Tanque D"
      }
    ]
  },
  grader: {
    key: "grader",
    name: "ArgosAI Grader",
    machineType: "ArgosAI Grader",
    throughput: "Clasificación multicanal",
    cameraSpec: "Cámara alta velocidad",
    species: "Trucha",
    durationMinutes: 18,
    description:
      "Módulo de clasificación visual para segmentar tallas, contar individuos y aportar estimación de biomasa por fracción.",
    instances: [
      {
        machineId: "ARG-GRADER-CAM-01",
        label: "Grader 1",
        startTank: "Canal de entrada",
        endTank: "Canal de salida"
      }
    ]
  }
};

function formatClockTime(value) {
  if (!value) {
    return "--:--:--";
  }

  return new Date(value).toLocaleTimeString("es-ES", { hour12: false });
}

function pseudoRandom(seed) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildFishFrameDataUri(machineKey, frameIndex, fishCount, biomassKg) {
  const laneCount = 4;
  const lanes = Array.from({ length: laneCount }, (_, laneIndex) => {
    const y = 60 + laneIndex * 95;
    return `<line x1="16" y1="${y}" x2="1264" y2="${y}" stroke="rgba(140,199,255,0.22)" stroke-width="2" stroke-dasharray="8 8" />`;
  }).join("");

  const fishShapes = Array.from({ length: fishCount }, (_, fishIndex) => {
    const laneIndex = fishIndex % laneCount;
    const laneY = 60 + laneIndex * 95;
    const width = 18 + Math.round(pseudoRandom((frameIndex + 1) * (fishIndex + 3)) * 18);
    const height = Math.max(8, Math.round(width * 0.45));
    const x =
      28 +
      Math.round(
        ((fishIndex + 2) * 44 + (frameIndex + 1) * 26 + pseudoRandom(fishIndex * 17 + frameIndex) * 120) %
          1180
      );
    const y = laneY + Math.round((pseudoRandom(fishIndex * 9 + frameIndex * 5) - 0.5) * 18);
    const hueShift = machineKey === "grader" ? 18 : machineKey === "growth-l" ? 8 : 0;
    const fill = `hsl(${196 + hueShift}, ${52 + (fishIndex % 18)}%, ${58 + (fishIndex % 14)}%)`;

    return `
      <g transform="translate(${x} ${y})">
        <ellipse cx="0" cy="0" rx="${width}" ry="${height}" fill="${fill}" opacity="0.9" />
        <polygon points="-${width + 12},0 -${width - 4},-${Math.round(height * 0.8)} -${width - 4},${Math.round(
          height * 0.8
        )}" fill="${fill}" opacity="0.9" />
        <circle cx="${Math.round(width * 0.45)}" cy="-${Math.max(1, Math.round(height * 0.15))}" r="2" fill="#0b304f" opacity="0.85" />
      </g>
    `;
  }).join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 420">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0f3150" />
          <stop offset="50%" stop-color="#17486f" />
          <stop offset="100%" stop-color="#1f5e89" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1280" height="420" fill="url(#bg)" />
      <rect x="18" y="18" width="1244" height="384" rx="18" fill="rgba(8,20,35,0.22)" stroke="rgba(190,222,255,0.3)" stroke-width="2" />
      ${lanes}
      ${fishShapes}
      <text x="34" y="44" fill="#d9edff" font-size="23" font-family="Open Sans, sans-serif" font-weight="700">Secuencia de paso de peces - Frame ${frameIndex + 1}</text>
      <text x="34" y="396" fill="#c8e4ff" font-size="20" font-family="Open Sans, sans-serif">Conteo detectado: ${fishCount} peces | Biomasa estimada: ${biomassKg.toFixed(2)} kg</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildFishFrames(machineKey) {
  const baseCount =
    machineKey === "grader" ? 42 : machineKey === "growth-l" ? 34 : machineKey === "growth-s" ? 26 : 18;

  return Array.from({ length: 12 }, (_, index) => {
    const fishCount = baseCount + ((index * 7) % 14);
    const biomassKg = fishCount * (0.07 + (index % 5) * 0.01 + (machineKey === "growth-l" ? 0.04 : 0));

    return {
      id: `${machineKey}-frame-${index + 1}`,
      fishCount,
      biomassKg: Number(biomassKg.toFixed(2)),
      capturedAt: new Date(Date.now() - (11 - index) * 45 * 1000),
      imageUrl: buildFishFrameDataUri(machineKey, index, fishCount, biomassKg)
    };
  });
}

function buildEstimatedFishLengthsMm(machineKey, frames) {
  const machineOffset = {
    "growth-nano": 0,
    "growth-s": 7,
    "growth-l": 12,
    grader: 18
  }[machineKey] ?? 0;

  return frames.flatMap((frame, frameIndex) => {
    if (!frame.fishCount) {
      return [];
    }

    const avgWeightG = (frame.biomassKg * 1000) / frame.fishCount;

    return Array.from({ length: frame.fishCount }, (_, fishIndex) => {
      const jitter = (pseudoRandom((frameIndex + 1) * 991 + (fishIndex + 1) * 47) - 0.5) * 44;
      const lengthMm = 86 + Math.sqrt(Math.max(avgWeightG, 1)) * 16 + machineOffset + jitter;
      return Math.round(clamp(lengthMm, 110, 520));
    });
  });
}

function buildLengthHistogram(lengths, bucketSizeMm = 20) {
  if (!lengths.length) {
    return {
      labels: [],
      counts: [],
      bucketSizeMm
    };
  }

  const minLength = Math.floor(Math.min(...lengths) / bucketSizeMm) * bucketSizeMm;
  const maxLength = Math.ceil(Math.max(...lengths) / bucketSizeMm) * bucketSizeMm;
  const bucketCount = Math.max(1, Math.ceil((maxLength - minLength) / bucketSizeMm));

  const counts = Array.from({ length: bucketCount }, () => 0);

  lengths.forEach((lengthMm) => {
    const index = Math.min(
      bucketCount - 1,
      Math.floor((lengthMm - minLength) / bucketSizeMm)
    );
    counts[index] += 1;
  });

  const labels = counts.map((_value, index) => {
    const start = minLength + index * bucketSizeMm;
    const end = start + bucketSizeMm;
    return `${start}-${end}`;
  });

  return {
    labels,
    counts,
    bucketSizeMm
  };
}

export function ArgosMachinePage() {
  const { accessToken } = useAuth();
  const { machineKey = "growth-nano" } = useParams();
  const profile = machineProfiles[machineKey] || machineProfiles["growth-nano"];
  const guiScreenRef = useRef(null);

  const [showFrames, setShowFrames] = useState(true);
  const [selectedFrameId, setSelectedFrameId] = useState(null);
  const [showGui, setShowGui] = useState(false);
  const [showGuiStats, setShowGuiStats] = useState(false);
  const [isInferenceRunning, setIsInferenceRunning] = useState(true);
  const [isGuiFullscreen, setIsGuiFullscreen] = useState(false);
  const [guiNow, setGuiNow] = useState(() => new Date());
  const [manualPartialCounter, setManualPartialCounter] = useState(null);
  const [manualTotalCounter, setManualTotalCounter] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  const machineInstances = useMemo(
    () =>
      profile.instances?.length
        ? profile.instances
        : [
            {
              machineId: "MACHINE-001",
              label: "Equipo 1",
              startTank: "Tanque 1",
              endTank: "Tanque A"
            }
          ],
    [profile]
  );

  const [selectedMachineId, setSelectedMachineId] = useState(
    machineInstances[0]?.machineId || ""
  );

  const activeInstance =
    machineInstances.find((instance) => instance.machineId === selectedMachineId) ||
    machineInstances[0] ||
    null;

  const sessionsQuery = useQuery({
    queryKey: ["cameraSessions", "maquina-argos"],
    queryFn: () => cameraSessionsRequest(accessToken)
  });

  const machineSessions = useMemo(() => {
    const list = sessionsQuery.data || [];

    if (!activeInstance) {
      return [];
    }

    return list.filter(
      (item) =>
        item.machine_id === activeInstance.machineId && item.machine_type === profile.machineType
    );
  }, [sessionsQuery.data, activeInstance, profile.machineType]);

  const activeSession = useMemo(() => {
    const now = Date.now();
    return (
      machineSessions.find((item) => new Date(item.expires_at).getTime() > now) ||
      machineSessions[0] ||
      null
    );
  }, [machineSessions]);

  const fishFrames = useMemo(() => buildFishFrames(profile.key), [profile.key]);

  const estimatedFishLengthsMm = useMemo(
    () => buildEstimatedFishLengthsMm(profile.key, fishFrames),
    [profile.key, fishFrames]
  );

  const fishLengthHistogram = useMemo(
    () => buildLengthHistogram(estimatedFishLengthsMm, 20),
    [estimatedFishLengthsMm]
  );

  const histogramLabelInterval = useMemo(() => {
    const labelCount = fishLengthHistogram.labels.length;

    if (labelCount <= 12) {
      return 0;
    }

    return Math.ceil(labelCount / 12) - 1;
  }, [fishLengthHistogram.labels.length]);

  const fishLengthHistogramOption = useMemo(
    () => ({
      animation: false,
      grid: {
        top: 36,
        right: 20,
        bottom: 40,
        left: 56
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow"
        },
        backgroundColor: "rgba(255,255,255,0.98)",
        borderColor: "#b7c7da",
        borderWidth: 1,
        textStyle: {
          color: "#1f3653"
        },
        formatter: (params) => {
          const row = params?.[0];

          if (!row) {
            return "";
          }

          return `${row.axisValue} mm<br/>${row.value} peces`;
        }
      },
      xAxis: {
        type: "category",
        name: "Talla (mm)",
        nameLocation: "middle",
        nameGap: 30,
        data: fishLengthHistogram.labels,
        axisLabel: {
          interval: histogramLabelInterval,
          color: "#324f72",
          fontSize: 11
        },
        axisLine: {
          lineStyle: {
            color: "#96aec9"
          }
        }
      },
      yAxis: {
        type: "value",
        name: "Peces",
        minInterval: 1,
        nameTextStyle: {
          color: "#324f72"
        },
        axisLabel: {
          color: "#324f72"
        },
        splitLine: {
          lineStyle: {
            color: "rgba(132, 161, 194, 0.24)"
          }
        }
      },
      series: [
        {
          name: "Peces",
          type: "bar",
          barMaxWidth: 26,
          data: fishLengthHistogram.counts,
          itemStyle: {
            color: "#2f88dd",
            borderRadius: [4, 4, 0, 0]
          }
        }
      ]
    }),
    [fishLengthHistogram.counts, fishLengthHistogram.labels, histogramLabelInterval]
  );

  const galleryColumnCount = viewportWidth <= 680 ? 1 : viewportWidth <= 1180 ? 3 : 4;
  const galleryLimit = galleryColumnCount * 3;
  const galleryFrames = useMemo(() => fishFrames.slice(-galleryLimit), [fishFrames, galleryLimit]);

  const totalFishCount = useMemo(
    () => fishFrames.reduce((sum, frame) => sum + frame.fishCount, 0),
    [fishFrames]
  );

  const totalBiomassKg = useMemo(
    () => Number(fishFrames.reduce((sum, frame) => sum + frame.biomassKg, 0).toFixed(2)),
    [fishFrames]
  );

  useEffect(() => {
    setSelectedMachineId(machineInstances[0]?.machineId || "");
    setSelectedFrameId(null);
    setShowFrames(true);
    setShowGui(false);
    setShowGuiStats(false);
    setIsInferenceRunning(true);
    setManualPartialCounter(null);
    setManualTotalCounter(null);
  }, [profile.key, machineInstances]);

  useEffect(() => {
    setManualPartialCounter(null);
    setManualTotalCounter(null);
    setShowGuiStats(false);
  }, [selectedMachineId]);

  useEffect(() => {
    if (!showGui) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setGuiNow(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [showGui]);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      const fullscreenCurrentGui = document.fullscreenElement === guiScreenRef.current;
      setIsGuiFullscreen(fullscreenCurrentGui);

      if (!fullscreenCurrentGui && showGui) {
        setShowGui(false);
        setShowGuiStats(false);
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [showGui]);

  const selectedFrame =
    fishFrames.find((frame) => frame.id === selectedFrameId) || fishFrames[fishFrames.length - 1] || null;

  const framePartialFishCount = selectedFrame?.fishCount ?? 0;
  const partialFishCount = manualPartialCounter ?? framePartialFishCount;
  const effectiveTotalFishCount = manualTotalCounter ?? totalFishCount;
  const partialBiomassKg = selectedFrame?.biomassKg ?? 0;
  const partialAvgWeightG =
    partialFishCount > 0 ? Number(((partialBiomassKg * 1000) / partialFishCount).toFixed(1)) : 0;
  const totalAvgWeightG =
    effectiveTotalFishCount > 0
      ? Number(((totalBiomassKg * 1000) / effectiveTotalFishCount).toFixed(1))
      : 0;

  const runRateFishPerMinute = useMemo(() => {
    if (fishFrames.length < 2) {
      return 0;
    }

    const first = fishFrames[0].capturedAt.getTime();
    const last = fishFrames[fishFrames.length - 1].capturedAt.getTime();
    const minutes = Math.max((last - first) / 60000, 1);
    return Number((effectiveTotalFishCount / minutes).toFixed(1));
  }, [fishFrames, effectiveTotalFishCount]);

  const sessionStartTime = activeSession?.created_at || fishFrames[0]?.capturedAt;
  const sessionEndTime = activeSession?.expires_at || fishFrames[fishFrames.length - 1]?.capturedAt;

  const sessionStatus = activeSession
    ? new Date(activeSession.expires_at).getTime() > Date.now()
      ? "Sesión activa"
      : "Sesión vencida"
    : "Sin sesión";

  async function requestGuiFullscreen() {
    if (!guiScreenRef.current) {
      return false;
    }

    try {
      if (document.fullscreenElement === guiScreenRef.current) {
        return true;
      }

      await guiScreenRef.current.requestFullscreen();
      return true;
    } catch (_error) {
      // Ignore fullscreen errors and keep the panel interactive.
      return false;
    }
  }

  async function handleOpenGuiFullscreen() {
    if (!showGui) {
      // Ensure the GUI element exists in DOM before requesting fullscreen.
      flushSync(() => {
        setShowGui(true);
      });
    }

    const opened = await requestGuiFullscreen();

    if (!opened) {
      setShowGui(false);
      setShowGuiStats(false);
    }
  }

  async function handleToggleGuiFullscreen() {
    if (!guiScreenRef.current) {
      return;
    }

    try {
      if (document.fullscreenElement === guiScreenRef.current) {
        await document.exitFullscreen();
        return;
      }

      await guiScreenRef.current.requestFullscreen();
    } catch (_error) {
      // Ignore fullscreen errors and keep the panel interactive.
    }
  }

  return (
    <section className="machine-argos-page">
      <article className="panel machine-argos-header-panel">
        <h3>Máquina ArgosAI</h3>
        <p className="machine-argos-intro">{profile.description}</p>

        <div className="machine-argos-summary-grid">
          <div className="machine-argos-stat">
            <span>Modelo</span>
            <strong>{profile.name}</strong>
          </div>
          <div className="machine-argos-stat">
            <span>Rendimiento</span>
            <strong>{profile.throughput}</strong>
          </div>
          <div className="machine-argos-stat">
            <span>Cámara</span>
            <strong>{profile.cameraSpec}</strong>
          </div>
          <div className="machine-argos-stat">
            <span>Estado</span>
            <strong>{sessionStatus}</strong>
          </div>
        </div>
      </article>

      <article className="panel machine-argos-camera-panel">
        <header className="machine-argos-camera-header">
          <div>
            <h3>Cámara y conteo de peces</h3>
            <p>
              Gestión de sesión por equipo. La vista de cámara se muestra en Interfaz GUI.
            </p>

            {machineInstances.length > 1 ? (
              <div className="machine-argos-instance-selector">
                {machineInstances.map((instance) => (
                  <button
                    key={instance.machineId}
                    type="button"
                    className={`machine-argos-instance-chip ${
                      activeInstance?.machineId === instance.machineId
                        ? "machine-argos-instance-chip-active"
                        : ""
                    }`.trim()}
                    onClick={() => setSelectedMachineId(instance.machineId)}
                  >
                    {instance.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="machine-argos-camera-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowFrames((current) => !current)}
            >
              {showFrames ? "Ocultar galería" : "Ver imágenes de peces pasar"}
            </button>
            <button
              type="button"
              className={`secondary-button ${showGui ? "secondary-button-active" : ""}`.trim()}
              onClick={handleOpenGuiFullscreen}
            >
              Interfaz GUI
            </button>
          </div>
        </header>

        {activeSession ? (
          <div className="machine-argos-session-meta">
            <p>
              <strong>Unidad:</strong> {activeInstance?.label || "--"}
            </p>
            <p>
              <strong>Equipo:</strong> {activeSession.machine_type}
            </p>
            <p>
              <strong>ID cámara:</strong> {activeSession.machine_id}
            </p>
            <p>
              <strong>Protocolo:</strong> {activeSession.stream_protocol}
            </p>
            <p>
              <strong>Expira:</strong> {new Date(activeSession.expires_at).toLocaleString()}
            </p>
          </div>
        ) : (
          <p className="empty-text">
            No hay sesión activa para {activeInstance?.label || "este equipo"}.
          </p>
        )}
      </article>

      {showGui ? (
        <article className="panel machine-argos-gui-panel">
          <header className="machine-argos-gui-header">
            <h3>Interfaz GUI de máquina</h3>
            <p>Réplica de la pantalla local con métricas de ejecución, control de inferencia y estado.</p>
          </header>

          <section ref={guiScreenRef} className="machine-gui-screen">
            <header className="machine-gui-topbar">
              <div className="machine-gui-brand">
                <span className="machine-gui-brand-dot" aria-hidden="true" />
                <strong>ARGOS AI</strong>
              </div>

              <div className="machine-gui-pill-row">
                <span>{activeInstance?.startTank || "Tanque 1"}</span>
                <span>{activeInstance?.endTank || "Tanque A"}</span>
                <span>Español</span>
                <span>Videos</span>
              </div>

              <div className="machine-gui-clock-grid">
                <p>
                  <strong>Hora inicial:</strong> {formatClockTime(sessionStartTime)}
                </p>
                <p>
                  <strong>Hora final:</strong> {formatClockTime(sessionEndTime)}
                </p>
                <p>
                  <strong>Hora actual:</strong> {formatClockTime(guiNow)}
                </p>
              </div>
            </header>

            <div className="machine-gui-main">
              <div className="machine-gui-table-wrap">
                <table className="machine-gui-table">
                  <thead>
                    <tr>
                      <th>Métrica</th>
                      <th>Parcial</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Tipo de pez</th>
                      <td>{profile.species}</td>
                      <td>{profile.species}</td>
                    </tr>
                    <tr>
                      <th>Contador</th>
                      <td>{partialFishCount}</td>
                      <td>{effectiveTotalFishCount}</td>
                    </tr>
                    <tr>
                      <th>Biomasa</th>
                      <td>{partialBiomassKg.toFixed(2)} kg</td>
                      <td>{totalBiomassKg.toFixed(2)} kg</td>
                    </tr>
                    <tr>
                      <th>Peso medio</th>
                      <td>{partialAvgWeightG.toFixed(1)} g</td>
                      <td>{totalAvgWeightG.toFixed(1)} g</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <aside className="machine-gui-preview-panel">
                {showGuiStats ? (
                  <div className="machine-gui-histogram-preview">
                    <h4>Histograma de tamaño estimado de peces</h4>
                    <div className="machine-gui-histogram-chart">
                      <ReactECharts
                        option={fishLengthHistogramOption}
                        style={{ height: "100%", width: "100%" }}
                        notMerge
                        lazyUpdate
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <img
                      src={activeSession?.fallback_url || selectedFrame?.imageUrl}
                      alt={`Vista de cámara GUI ${profile.name}`}
                    />
                    <span
                      className={`machine-gui-preview-chip ${isInferenceRunning ? "machine-gui-preview-chip-ok" : "machine-gui-preview-chip-stop"}`.trim()}
                    >
                      {isInferenceRunning ? "Fish good" : "Inferencia parada"}
                    </span>
                  </>
                )}
              </aside>
            </div>

            <p className="machine-gui-rate-text">
              {isInferenceRunning ? `${runRateFishPerMinute.toFixed(1)} peces/min` : "Inferencia detenida"}
            </p>

            <div className="machine-gui-controls">
              <button
                type="button"
                className={`machine-gui-control machine-gui-control-run ${isInferenceRunning ? "machine-gui-control-run-active" : ""}`.trim()}
                onClick={() => setIsInferenceRunning(true)}
              >
                Ejecutando
              </button>
              <button
                type="button"
                className="machine-gui-control"
                onClick={handleToggleGuiFullscreen}
              >
                {isGuiFullscreen ? "Salir completa" : "Pantalla completa"}
              </button>
              <button
                type="button"
                className="machine-gui-control machine-gui-control-stop"
                onClick={() => setIsInferenceRunning((current) => !current)}
              >
                {isInferenceRunning ? "Parar inferencia" : "Reanudar inferencia"}
              </button>
              <button
                type="button"
                className={`machine-gui-control machine-gui-control-stats ${showGuiStats ? "machine-gui-control-stats-active" : ""}`.trim()}
                onClick={() => setShowGuiStats((current) => !current)}
              >
                Estadísticas
              </button>
              <button
                type="button"
                className="machine-gui-control machine-gui-control-reset"
                onClick={() => {
                  setManualPartialCounter(0);
                  setManualTotalCounter(0);
                }}
              >
                Reset total
              </button>
            </div>
          </section>
        </article>
      ) : null}

      {showFrames ? (
        <article className="panel machine-argos-gallery-panel">
          <h3>Imágenes de peces en paso</h3>
          <p>
            Secuencia visual para revisar detección de individuos durante el paso por cámara y validar
            conteo/biomasa estimada.
          </p>

          <div className="machine-argos-gallery-grid">
            {galleryFrames.map((frame) => (
              <button
                key={frame.id}
                type="button"
                className={`machine-argos-thumb ${selectedFrame?.id === frame.id ? "machine-argos-thumb-active" : ""}`.trim()}
                onClick={() => setSelectedFrameId(frame.id)}
              >
                <img src={frame.imageUrl} alt={`Frame de peces ${frame.id}`} />
                <span>{frame.capturedAt.toLocaleTimeString()}</span>
                <small>{frame.fishCount} peces</small>
              </button>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
