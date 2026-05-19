import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { oxygenSetpointsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./OxygenPage.css";

const oxygenSetpointZones = [
  {
    zoneName: "Zona 1",
    slotCodes: ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "C5", "C6", "C7"]
  },
  {
    zoneName: "Zona 2",
    slotCodes: ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12"]
  },
  {
    zoneName: "Zona 3",
    slotCodes: ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10", "E11", "E12"]
  },
  {
    zoneName: "Zona 4",
    slotCodes: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"]
  }
];

const oxygenSetpointNoConfigSlots = new Set(["C2", "C6", "D11", "D12", "E8", "E11", "E12", "F7", "F9", "F10"]);

function zoneNameFromSlotCode(slotCode) {
  const prefix = String(slotCode || "").toUpperCase().charAt(0);

  if (["A", "B", "C"].includes(prefix)) {
    return "Zona 1";
  }

  if (prefix === "D") {
    return "Zona 2";
  }

  if (prefix === "E") {
    return "Zona 3";
  }

  if (prefix === "F") {
    return "Zona 4";
  }

  return "Sin zona";
}

function zoneSortOrder(zoneName) {
  switch (zoneName) {
    case "Zona 1":
      return 1;
    case "Zona 2":
      return 2;
    case "Zona 3":
      return 3;
    case "Zona 4":
      return 4;
    default:
      return 5;
  }
}

function slotCodeNumber(slotCode) {
  const match = String(slotCode || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function buildDemoOxygenSetpoints() {
  const now = Date.now();

  return oxygenSetpointZones
    .flatMap((zone) =>
      zone.slotCodes.map((slotCode, index) => {
        const hasSetpoint = !oxygenSetpointNoConfigSlots.has(slotCode);

        return {
          slotCode,
          zoneName: zone.zoneName,
          activationEnabled: false,
          setpointOnPct: hasSetpoint ? 0 : null,
          setpointOffPct: hasSetpoint ? 1 : null,
          updatedAt: hasSetpoint ? new Date(now - (index % 6) * 3600 * 1000).toISOString() : null
        };
      })
    )
    .sort(
      (left, right) =>
        zoneSortOrder(left.zoneName) - zoneSortOrder(right.zoneName) ||
        slotCodeNumber(left.slotCode) - slotCodeNumber(right.slotCode) ||
        left.slotCode.localeCompare(right.slotCode)
    );
}

function formatSetpointPercent(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return numeric.toFixed(1);
}

const defaultOxygenEconomyConfig = {
  baseFlowLpm: 14,
  standbyDutyPct: 8,
  activationBoostPct: 18,
  costPerM3Eur: 0.24,
  overheadPct: 7
};

const oxygenEconomyStorageKey = "argosai.oxygen.economy.config.v1";

const litersFormatter = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0
});

const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2
});

const percentFormatter = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 1,
  signDisplay: "always"
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCoefficient(value, fallback, min, max, fractionDigits = 2) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Number(clamp(numeric, min, max).toFixed(fractionDigits));
}

function sanitizeEconomyConfig(config) {
  const safe = config && typeof config === "object" ? config : {};

  return {
    baseFlowLpm: normalizeCoefficient(
      safe.baseFlowLpm,
      defaultOxygenEconomyConfig.baseFlowLpm,
      0,
      45,
      1
    ),
    standbyDutyPct: normalizeCoefficient(
      safe.standbyDutyPct,
      defaultOxygenEconomyConfig.standbyDutyPct,
      0,
      60,
      1
    ),
    activationBoostPct: normalizeCoefficient(
      safe.activationBoostPct,
      defaultOxygenEconomyConfig.activationBoostPct,
      0,
      50,
      1
    ),
    costPerM3Eur: normalizeCoefficient(
      safe.costPerM3Eur,
      defaultOxygenEconomyConfig.costPerM3Eur,
      0,
      3,
      4
    ),
    overheadPct: normalizeCoefficient(
      safe.overheadPct,
      defaultOxygenEconomyConfig.overheadPct,
      0,
      60,
      1
    )
  };
}

function readStoredEconomyConfig() {
  if (typeof window === "undefined") {
    return { ...defaultOxygenEconomyConfig };
  }

  try {
    const rawValue = window.localStorage.getItem(oxygenEconomyStorageKey);

    if (!rawValue) {
      return { ...defaultOxygenEconomyConfig };
    }

    return sanitizeEconomyConfig(JSON.parse(rawValue));
  } catch {
    return { ...defaultOxygenEconomyConfig };
  }
}

function formatLiters(value) {
  return litersFormatter.format(Math.round(value));
}

function formatMoney(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatDeltaPercent(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return `${percentFormatter.format(value)}%`;
}

function estimateValveDutyPercent(row, economyConfig) {
  const onPct = Number(row.setpointOnPct);
  const offPct = Number(row.setpointOffPct);
  const hasOnPct = Number.isFinite(onPct);
  const hasOffPct = Number.isFinite(offPct);

  const normalizedOnPct = hasOnPct ? clamp(onPct, 0, 100) : null;
  const normalizedOffPct = hasOffPct ? clamp(offPct, 0, 100) : null;

  let dutyPercent;

  if (normalizedOnPct === null && normalizedOffPct === null) {
    dutyPercent = row.activationEnabled ? 44 : economyConfig.standbyDutyPct + 4;
  } else {
    const weightedSetpoint = (normalizedOnPct ?? 42) * 0.62 + (normalizedOffPct ?? 35) * 0.38;

    dutyPercent = row.activationEnabled
      ? weightedSetpoint + economyConfig.activationBoostPct
      : Math.max(weightedSetpoint * 0.52, economyConfig.standbyDutyPct);
  }

  return clamp(dutyPercent, economyConfig.standbyDutyPct, 96);
}

function buildOxygenEconomyTrend(rows, isDemo, economyConfig, days = 14) {
  const slotCount = rows.length || oxygenSetpointZones.reduce((total, zone) => total + zone.slotCodes.length, 0);
  const activeRatio =
    slotCount > 0 ? rows.filter((row) => row.activationEnabled).length / Math.max(slotCount, 1) : 0;

  const baseDailyLiters = rows.reduce((total, row) => {
    const dutyPercent = estimateValveDutyPercent(row, economyConfig);
    const litersBySlot =
      economyConfig.baseFlowLpm * 60 * 24 * (clamp(dutyPercent, 0, 100) / 100);
    return total + litersBySlot;
  }, 0);

  const fallbackDailyLiters = slotCount * 2800;
  const safeBaselineLiters = Math.max(baseDailyLiters, fallbackDailyLiters * (isDemo ? 0.9 : 0.65));

  const today = new Date();

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    const dayOffset = days - 1 - index;
    date.setDate(today.getDate() - dayOffset);

    const weeklyWave = Math.sin((index + 1) * 0.82) * 0.07;
    const shiftWave = Math.cos((index + 3) * 0.48) * 0.05;
    const weekendFactor = [0, 6].includes(date.getDay()) ? 0.04 : -0.01;
    const liveFactor = isDemo ? 0 : activeRatio * 0.15;
    const demandFactor = clamp(1 + weeklyWave + shiftWave + weekendFactor + liveFactor, 0.72, 1.28);

    const liters = Math.round(safeBaselineLiters * demandFactor);
    const operationalFactor = 1 + economyConfig.overheadPct / 100;
    const costEur = Number(
      (
        (liters / 1000) *
        economyConfig.costPerM3Eur *
        operationalFactor
      ).toFixed(2)
    );

    return {
      label: date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }),
      liters,
      costEur
    };
  });
}

function oxygenEconomyChartOption(trendRows, continuousDailyCostEur) {
  const shouldRotateDates = trendRows.length > 10;

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
      },
      valueFormatter: (value) => (Number.isFinite(value) ? value.toLocaleString("es-ES") : "--")
    },
    legend: {
      top: 4,
      left: "center",
      type: "scroll",
      itemGap: 14,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: {
        color: "#3d5477"
      },
      data: ["Consumo (L)", "Costo (EUR)", "Costo 24/7 continuo"]
    },
    grid: {
      top: 76,
      right: 56,
      bottom: 58,
      left: 56
    },
    xAxis: {
      type: "category",
      data: trendRows.map((row) => row.label),
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.5)"
        }
      },
      axisLabel: {
        color: "#4f6787",
        hideOverlap: true,
        interval: 0,
        rotate: shouldRotateDates ? 24 : 0,
        margin: 12
      }
    },
    yAxis: [
      {
        type: "value",
        name: "Litros",
        axisLabel: {
          color: "#4f6787",
          formatter: (value) => `${litersFormatter.format(value)} L`
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
          formatter: (value) => `EUR ${Number(value).toFixed(0)}`
        },
        splitLine: {
          show: false
        }
      }
    ],
    series: [
      {
        name: "Consumo (L)",
        type: "bar",
        barMaxWidth: 24,
        itemStyle: {
          borderRadius: [5, 5, 0, 0],
          color: "#6caef6"
        },
        data: trendRows.map((row) => row.liters)
      },
      {
        name: "Costo (EUR)",
        type: "line",
        smooth: true,
        yAxisIndex: 1,
        lineStyle: {
          width: 2.6,
          color: "#215ea8"
        },
        itemStyle: {
          color: "#215ea8"
        },
        areaStyle: {
          color: "rgba(33, 94, 168, 0.17)"
        },
        data: trendRows.map((row) => row.costEur)
      },
      {
        name: "Costo 24/7 continuo",
        type: "line",
        yAxisIndex: 1,
        symbol: "none",
        lineStyle: {
          width: 1.9,
          type: "dashed",
          color: "#7f95b5"
        },
        data: trendRows.map(() => Number(continuousDailyCostEur.toFixed(2)))
      }
    ]
  };
}

export function OxygenPage({ mode = "electrovalvulas" }) {
  const { accessToken } = useAuth();
  const [economyConfig, setEconomyConfig] = useState(readStoredEconomyConfig);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(oxygenEconomyStorageKey, JSON.stringify(economyConfig));
  }, [economyConfig]);

  const oxygenSetpointsQuery = useQuery({
    queryKey: ["oxygen-setpoints", "oxygen-page"],
    queryFn: () => oxygenSetpointsRequest(accessToken),
    refetchInterval: 15000
  });

  const oxygenSetpointsState = useMemo(() => {
    const rows = oxygenSetpointsQuery.data || [];

    if (rows.length > 0) {
      const normalizedRows = rows
        .map((row) => ({
          slotCode: row.slot_code,
          zoneName: row.zone_name || zoneNameFromSlotCode(row.slot_code),
          activationEnabled: Boolean(row.activation_enabled),
          setpointOnPct: row.setpoint_on_pct,
          setpointOffPct: row.setpoint_off_pct,
          updatedAt: row.updated_at || null
        }))
        .sort(
          (left, right) =>
            zoneSortOrder(left.zoneName) - zoneSortOrder(right.zoneName) ||
            slotCodeNumber(left.slotCode) - slotCodeNumber(right.slotCode) ||
            left.slotCode.localeCompare(right.slotCode)
        );

      return {
        rows: normalizedRows,
        isDemo: false
      };
    }

    return {
      rows: buildDemoOxygenSetpoints(),
      isDemo: true
    };
  }, [oxygenSetpointsQuery.data]);

  const oxygenEconomyState = useMemo(() => {
    const slotCountForContinuous =
      oxygenSetpointsState.rows.length ||
      oxygenSetpointZones.reduce((total, zone) => total + zone.slotCodes.length, 0);

    const operationalFactor = 1 + economyConfig.overheadPct / 100;
    const continuousDailyLiters = slotCountForContinuous * economyConfig.baseFlowLpm * 60 * 24;
    const continuousDailyCostEur =
      (continuousDailyLiters / 1000) * economyConfig.costPerM3Eur * operationalFactor;

    const trendRows = buildOxygenEconomyTrend(
      oxygenSetpointsState.rows,
      oxygenSetpointsState.isDemo,
      economyConfig,
      14
    );

    const latestDay = trendRows.at(-1) || { liters: 0, costEur: 0 };
    const previousDay = trendRows.at(-2) || latestDay;
    const costDeltaPct =
      previousDay.costEur > 0
        ? ((latestDay.costEur - previousDay.costEur) / previousDay.costEur) * 100
        : 0;

    const totalSlots = Math.max(oxygenSetpointsState.rows.length, 1);
    const savedDailyCostEur = continuousDailyCostEur - latestDay.costEur;
    const savedVsContinuousPct =
      continuousDailyCostEur > 0 ? (savedDailyCostEur / continuousDailyCostEur) * 100 : 0;

    return {
      chartOption: oxygenEconomyChartOption(trendRows, continuousDailyCostEur),
      latestDay,
      costDeltaPct,
      continuousDailyLiters,
      continuousDailyCostEur,
      savedDailyCostEur,
      savedMonthlyCostEur: savedDailyCostEur * 30,
      savedVsContinuousPct,
      totalSlots,
      activeSlots: oxygenSetpointsState.rows.filter((row) => row.activationEnabled).length
    };
  }, [economyConfig, oxygenSetpointsState]);

  const loxState = useMemo(() => {
    const deposits = buildDemoLoxDeposits().map((deposit, index) => {
      const liters = clamp(
        deposit.liters + Math.sin((Date.now() / 1000 + index * 4) * 0.002) * 120,
        300,
        deposit.capacityL
      );
      const pressureBar = clamp(
        deposit.pressureBar + Math.cos((Date.now() / 1000 + index * 7) * 0.0022) * 0.35,
        7.8,
        16.5
      );
      const flowNm3h = clamp(
        deposit.flowNm3h + Math.sin((Date.now() / 1000 + index * 9) * 0.0018) * 16,
        10,
        280
      );
      const fillPct = (liters / Math.max(deposit.capacityL, 1)) * 100;
      const status = refillStatusFromPercent(fillPct);

      return {
        ...deposit,
        liters,
        pressureBar,
        flowNm3h,
        fillPct,
        status
      };
    });

    const totalCapacityL = deposits.reduce((sum, deposit) => sum + deposit.capacityL, 0);
    const totalLiters = deposits.reduce((sum, deposit) => sum + deposit.liters, 0);
    const totalFlowNm3h = deposits.reduce((sum, deposit) => sum + deposit.flowNm3h, 0);
    const weightedPressureBar =
      totalCapacityL > 0
        ? deposits.reduce((sum, deposit) => sum + deposit.pressureBar * deposit.capacityL, 0) /
          totalCapacityL
        : 0;
    const avgDailyConsumptionL = totalFlowNm3h * 24 * 0.86;
    const autonomyDays = avgDailyConsumptionL > 0 ? totalLiters / avgDailyConsumptionL : 0;
    const needsRefill = deposits.some((deposit) => deposit.fillPct <= 35);

    return {
      deposits,
      totalCapacityL,
      totalLiters,
      fillPct: totalCapacityL > 0 ? (totalLiters / totalCapacityL) * 100 : 0,
      totalFlowNm3h,
      weightedPressureBar,
      avgDailyConsumptionL,
      autonomyDays,
      needsRefill,
      levelChartOption: loxLevelTrendOption(deposits),
      pressureFlowChartOption: loxPressureFlowOption(deposits)
    };
  }, [oxygenSetpointsState.rows]);

  function handleEconomyConfigChange(fieldName) {
    return (event) => {
      const rawValue = event.target.value;

      setEconomyConfig((current) =>
        sanitizeEconomyConfig({
          ...current,
          [fieldName]: rawValue === "" ? current[fieldName] : Number(rawValue)
        })
      );
    };
  }

  return (
    <section className="oxygen-page">
      {mode === "electrovalvulas" ? (
        <article className="panel oxygen-page-panel">
          <div className="oxygen-page-header">
            <h3>Oxígeno - Electroválvulas</h3>
            <p>
              Consignas enviadas por PLC para apertura/cierre automático. Esta tabla es de solo
              lectura.
            </p>
          </div>

          {oxygenSetpointsState.isDemo ? (
            <p className="oxygen-page-note">
              Aún no se reciben consignas PLC en tiempo real. Se muestran valores demo.
            </p>
          ) : null}

          <div className="table-wrap">
            <table className="oxygen-page-table">
              <thead>
                <tr>
                  <th>Zona</th>
                  <th>Piscina</th>
                  <th>Activación</th>
                  <th>Consigna encendido (%)</th>
                  <th>Consigna apagado (%)</th>
                  <th>Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {oxygenSetpointsState.rows.map((row) => (
                  <tr key={row.slotCode}>
                    <td>{row.zoneName}</td>
                    <td>{row.slotCode}</td>
                    <td>
                      <span
                        className={`oxygen-page-chip ${
                          row.activationEnabled ? "oxygen-page-chip-on" : "oxygen-page-chip-off"
                        }`.trim()}
                      >
                        {row.activationEnabled ? "Encendida" : "Apagada"}
                      </span>
                    </td>
                    <td>{formatSetpointPercent(row.setpointOnPct)}</td>
                    <td>{formatSetpointPercent(row.setpointOffPct)}</td>
                    <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {mode === "economia" ? (
        <article className="panel oxygen-economy-panel">
          <div className="oxygen-economy-header">
            <h3>Economía de Oxígeno</h3>
            <p>
              Estimación económica basada en consignas PLC, estado de electroválvulas y tendencia
              operativa de los últimos 14 días.
            </p>
          </div>

          <section className="oxygen-economy-config" aria-label="Configuración de coeficientes">
            <div className="oxygen-economy-config-head">
              <h4>Coeficientes de cálculo</h4>
              <button
                type="button"
                className="oxygen-economy-config-reset"
                onClick={() => setEconomyConfig({ ...defaultOxygenEconomyConfig })}
              >
                Restablecer
              </button>
            </div>

            <p className="oxygen-economy-config-copy">
              Ajusta estos coeficientes con tus costos reales. Los cambios se guardan en este
              navegador y recalculan la gráfica en tiempo real.
            </p>

            <div className="oxygen-economy-config-grid">
              <label className="oxygen-economy-config-field">
                <span>Caudal base por electroválvula (L/min)</span>
                <input
                  type="number"
                  min="0"
                  max="45"
                  step="0.1"
                  value={economyConfig.baseFlowLpm}
                  onChange={handleEconomyConfigChange("baseFlowLpm")}
                />
              </label>

              <label className="oxygen-economy-config-field">
                <span>Costo oxígeno (EUR/m3)</span>
                <input
                  type="number"
                  min="0"
                  max="3"
                  step="0.01"
                  value={economyConfig.costPerM3Eur}
                  onChange={handleEconomyConfigChange("costPerM3Eur")}
                />
              </label>

              <label className="oxygen-economy-config-field">
                <span>Sobrecoste operativo (%)</span>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  value={economyConfig.overheadPct}
                  onChange={handleEconomyConfigChange("overheadPct")}
                />
              </label>

              <label className="oxygen-economy-config-field">
                <span>Consumo en standby (%)</span>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  value={economyConfig.standbyDutyPct}
                  onChange={handleEconomyConfigChange("standbyDutyPct")}
                />
              </label>

              <label className="oxygen-economy-config-field">
                <span>Incremento por activación (%)</span>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={economyConfig.activationBoostPct}
                  onChange={handleEconomyConfigChange("activationBoostPct")}
                />
              </label>
            </div>
          </section>

          {oxygenSetpointsState.isDemo ? (
            <p className="oxygen-economy-note">
              Sin telemetría real de caudal en esta vista. Los costos y litros son aproximados para
              análisis económico preliminar.
            </p>
          ) : null}

          <div className="oxygen-economy-kpi-grid">
            <article className="oxygen-economy-kpi">
              <p>Gasto diario estimado</p>
              <strong>{formatLiters(oxygenEconomyState.latestDay.liters)} L</strong>
              <span>
                {oxygenEconomyState.activeSlots}/{oxygenEconomyState.totalSlots} electroválvulas
                en servicio
              </span>
            </article>

            <article className="oxygen-economy-kpi">
              <p>Costo diario estimado</p>
              <strong>{formatMoney(oxygenEconomyState.latestDay.costEur)}</strong>
              <span>{formatDeltaPercent(oxygenEconomyState.costDeltaPct)} vs día anterior</span>
            </article>

            <article className="oxygen-economy-kpi">
              <p>Costo diario 24/7 en continuo</p>
              <strong>{formatMoney(oxygenEconomyState.continuousDailyCostEur)}</strong>
              <span>{formatLiters(oxygenEconomyState.continuousDailyLiters)} L sin cortes</span>
            </article>

            <article
              className={`oxygen-economy-kpi ${
                oxygenEconomyState.savedDailyCostEur >= 0
                  ? "oxygen-economy-kpi-savings"
                  : "oxygen-economy-kpi-overcost"
              }`.trim()}
            >
              <p>
                {oxygenEconomyState.savedDailyCostEur >= 0
                  ? "Ahorro diario por encendido/apagado"
                  : "Sobrecoste diario por encendido/apagado"}
              </p>
              <strong>{formatMoney(Math.abs(oxygenEconomyState.savedDailyCostEur))}</strong>
              <span>
                {formatDeltaPercent(oxygenEconomyState.savedVsContinuousPct)} vs continuo |{" "}
                {formatMoney(Math.abs(oxygenEconomyState.savedMonthlyCostEur))} / mes
              </span>
            </article>
          </div>

          <div className="oxygen-economy-chart-wrap">
            <ReactECharts
              option={oxygenEconomyState.chartOption}
              style={{ height: 340 }}
              notMerge
            />
          </div>
        </article>
      ) : null}

      {mode === "depositos" ? (
        <article className="panel oxygen-lox-panel">
          <div className="oxygen-economy-header">
            <h3>Depósitos de O2 líquido</h3>
            <p>
              Nivel, presión y caudal por depósito criogénico para supervisar consumo y anticipar
              recargas.
            </p>
          </div>

          <div className="oxygen-economy-kpi-grid">
            <article className="oxygen-economy-kpi">
              <p>Inventario total</p>
              <strong>{formatLiters(loxState.totalLiters)} L</strong>
              <span>{formatLiters(loxState.totalCapacityL)} L capacidad instalada</span>
            </article>

            <article
              className={`oxygen-economy-kpi ${
                loxState.needsRefill ? "oxygen-economy-kpi-overcost" : "oxygen-economy-kpi-savings"
              }`.trim()}
            >
              <p>Nivel agregado</p>
              <strong>{formatSetpointPercent(loxState.fillPct)}%</strong>
              <span>{loxState.needsRefill ? "Se recomienda recarga" : "Nivel operativo estable"}</span>
            </article>

            <article className="oxygen-economy-kpi">
              <p>Presión media</p>
              <strong>{formatSetpointPercent(loxState.weightedPressureBar)} bar</strong>
              <span>Monitorización de vaporización</span>
            </article>

            <article className="oxygen-economy-kpi">
              <p>Autonomía estimada</p>
              <strong>{formatSetpointPercent(loxState.autonomyDays)} días</strong>
              <span>{formatLiters(loxState.avgDailyConsumptionL)} L/día consumo aproximado</span>
            </article>
          </div>

          <div className="table-wrap oxygen-lox-table-wrap">
            <table className="oxygen-page-table">
              <thead>
                <tr>
                  <th>Depósito</th>
                  <th>Ubicación</th>
                  <th>Litros</th>
                  <th>Nivel</th>
                  <th>Presión</th>
                  <th>Caudal</th>
                  <th>Recarga</th>
                  <th>Última recarga</th>
                </tr>
              </thead>
              <tbody>
                {loxState.deposits.map((deposit) => (
                  <tr key={deposit.code}>
                    <td>{deposit.code}</td>
                    <td>{deposit.area}</td>
                    <td>{formatLiters(deposit.liters)} L</td>
                    <td>{formatSetpointPercent(deposit.fillPct)}%</td>
                    <td>{formatSetpointPercent(deposit.pressureBar)} bar</td>
                    <td>{formatSetpointPercent(deposit.flowNm3h)} Nm3/h</td>
                    <td>
                      <span className={`oxygen-lox-status ${deposit.status.className}`.trim()}>
                        {deposit.status.label}
                      </span>
                    </td>
                    <td>{new Date(deposit.lastRefillAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="oxygen-economy-chart-wrap">
            <ReactECharts option={loxState.levelChartOption} style={{ height: 320 }} notMerge />
          </div>

          <div className="oxygen-economy-chart-wrap">
            <ReactECharts option={loxState.pressureFlowChartOption} style={{ height: 300 }} notMerge />
          </div>
        </article>
      ) : null}
    </section>
  );
}

function buildDemoLoxDeposits() {
  return [
    {
      code: "LOX-01",
      area: "Cabecera norte",
      capacityL: 12000,
      liters: 4860,
      pressureBar: 12.4,
      flowNm3h: 146,
      lastRefillAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString()
    },
    {
      code: "LOX-02",
      area: "Cabecera sur",
      capacityL: 9000,
      liters: 2380,
      pressureBar: 10.8,
      flowNm3h: 118,
      lastRefillAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString()
    }
  ];
}

function refillStatusFromPercent(fillPct) {
  if (fillPct <= 20) {
    return {
      label: "Recarga urgente",
      className: "oxygen-lox-status-critical"
    };
  }

  if (fillPct <= 35) {
    return {
      label: "Programar recarga",
      className: "oxygen-lox-status-warning"
    };
  }

  return {
    label: "Nivel estable",
    className: "oxygen-lox-status-ok"
  };
}

function loxLevelTrendOption(deposits) {
  const labels = Array.from({ length: 12 }, (_, idx) => `${String(idx * 2).padStart(2, "0")}:00`);
  const series = deposits.map((deposit, index) => {
    const currentFillPct = (deposit.liters / Math.max(deposit.capacityL, 1)) * 100;
    return {
      name: deposit.code,
      type: "line",
      smooth: true,
      symbol: "none",
      data: labels.map((_, labelIndex) =>
        clamp(
          currentFillPct + Math.cos((labelIndex + 1 + index) * 0.44) * 5 - (11 - labelIndex) * 0.52,
          8,
          100
        ).toFixed(1)
      )
    };
  });

  return {
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    grid: { left: 40, right: 16, top: 36, bottom: 30 },
    xAxis: { type: "category", data: labels, boundaryGap: false },
    yAxis: { type: "value", min: 0, max: 100, axisLabel: { formatter: "{value}%" } },
    series,
    color: ["#2f6ca8", "#46b889", "#e09b39"]
  };
}

function loxPressureFlowOption(deposits) {
  return {
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    grid: { left: 42, right: 44, top: 34, bottom: 28 },
    xAxis: {
      type: "category",
      data: deposits.map((deposit) => deposit.code)
    },
    yAxis: [
      {
        type: "value",
        name: "bar",
        axisLabel: { formatter: "{value} bar" }
      },
      {
        type: "value",
        name: "Nm3/h",
        axisLabel: { formatter: "{value}" }
      }
    ],
    series: [
      {
        name: "Presión",
        type: "bar",
        barMaxWidth: 28,
        data: deposits.map((deposit) => Number(deposit.pressureBar.toFixed(2)))
      },
      {
        name: "Caudal",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 7,
        data: deposits.map((deposit) => Number(deposit.flowNm3h.toFixed(1)))
      }
    ],
    color: ["#7aa7d8", "#215ea8"]
  };
}