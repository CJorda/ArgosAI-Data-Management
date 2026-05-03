import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { temperatureColorSetpointsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./AlertSetpointsPage.css";

const colorSetpointZones = [
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

const temperatureColorNoConfigSlots = new Set(["B4", "C6", "D12", "F10"]);

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

function temperatureColorThresholdsFromCode(slotCode) {
  const prefix = String(slotCode || "").toUpperCase().charAt(0);
  const index = slotCodeNumber(slotCode) || 1;
  const zoneOffset = {
    A: 0.2,
    B: 0.3,
    C: 0.4,
    D: 0.6,
    E: 0.8,
    F: 0.5
  }[prefix] ?? 0.3;
  const criticalValue = Number((27.4 + zoneOffset + (index % 3) * 0.2).toFixed(2));
  const highValue = Number((criticalValue - 3.1 - (index % 4) * 0.15).toFixed(2));
  const lowValue = Number((highValue - 5.4 - (index % 5) * 0.18).toFixed(2));

  return {
    criticalValue,
    highValue,
    lowValue
  };
}

function buildDemoTemperatureColorSetpoints() {
  const now = Date.now();

  return colorSetpointZones
    .flatMap((zone) =>
      zone.slotCodes.map((slotCode, index) => {
        const hasSetpoint = !temperatureColorNoConfigSlots.has(slotCode);
        const thresholds = temperatureColorThresholdsFromCode(slotCode);

        return {
          slotCode,
          zoneName: zone.zoneName,
          criticalValue: hasSetpoint ? thresholds.criticalValue : null,
          highValue: hasSetpoint ? thresholds.highValue : null,
          lowValue: hasSetpoint ? thresholds.lowValue : null,
          updatedAt: hasSetpoint ? new Date(now - (index % 5) * 3600 * 1000).toISOString() : null
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

function formatSetpointValue(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return numeric.toFixed(2);
}

export function TemperatureColorSetpointsPage() {
  const { accessToken } = useAuth();

  const temperatureColorSetpointsQuery = useQuery({
    queryKey: ["temperature-color-setpoints", "temperature-color-page"],
    queryFn: () => temperatureColorSetpointsRequest(accessToken),
    refetchInterval: 15000
  });

  const temperatureColorSetpointsState = useMemo(() => {
    const rows = temperatureColorSetpointsQuery.data || [];

    if (rows.length > 0) {
      const normalizedRows = rows
        .map((row) => ({
          slotCode: row.slot_code,
          zoneName: row.zone_name || zoneNameFromSlotCode(row.slot_code),
          criticalValue: row.critical_value,
          highValue: row.high_value,
          lowValue: row.low_value,
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
      rows: buildDemoTemperatureColorSetpoints(),
      isDemo: true
    };
  }, [temperatureColorSetpointsQuery.data]);

  return (
    <section className="alert-setpoints-page">
      <article className="panel alert-setpoints-panel">
        <div className="alert-setpoints-header">
          <h3>Consignas PLC - Temperatura (color)</h3>
          <p>
            Estas consignas determinan el color del indicador cuadrado de temperatura en SCADA.
            Vista de solo lectura.
          </p>
        </div>

        {temperatureColorSetpointsState.isDemo ? (
          <p className="alert-setpoints-note">
            Aún no se reciben consignas PLC en tiempo real. Se muestran valores demo.
          </p>
        ) : null}

        <div className="table-wrap">
          <table className="alert-setpoints-table">
            <thead>
              <tr>
                <th>Zona</th>
                <th>Piscina</th>
                <th>Crítico</th>
                <th>Alto</th>
                <th>Bajo</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {temperatureColorSetpointsState.rows.map((row) => (
                <tr key={row.slotCode}>
                  <td>{row.zoneName}</td>
                  <td>{row.slotCode}</td>
                  <td>{formatSetpointValue(row.criticalValue)}</td>
                  <td>{formatSetpointValue(row.highValue)}</td>
                  <td>{formatSetpointValue(row.lowValue)}</td>
                  <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
