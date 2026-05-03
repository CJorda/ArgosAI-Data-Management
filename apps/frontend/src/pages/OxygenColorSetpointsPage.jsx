import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { oxygenColorSetpointsRequest } from "../api/services";
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

const oxygenColorNoConfigSlots = new Set(["C2", "D11", "E12", "F9"]);

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

function oxygenColorThresholdsFromCode(slotCode) {
  const prefix = String(slotCode || "").toUpperCase().charAt(0);
  const index = slotCodeNumber(slotCode) || 1;
  const zoneOffset = {
    A: 0,
    B: 0.08,
    C: 0.12,
    D: 0.2,
    E: 0.28,
    F: 0.16
  }[prefix] ?? 0;
  const criticalValue = Number((4.6 + zoneOffset + (index % 3) * 0.07).toFixed(2));
  const lowValue = Number((criticalValue + 1.3 + (index % 4) * 0.05).toFixed(2));
  const highValue = Number((lowValue + 2.1 + (index % 5) * 0.04).toFixed(2));

  return {
    criticalValue,
    lowValue,
    highValue
  };
}

function buildDemoOxygenColorSetpoints() {
  const now = Date.now();

  return colorSetpointZones
    .flatMap((zone) =>
      zone.slotCodes.map((slotCode, index) => {
        const hasSetpoint = !oxygenColorNoConfigSlots.has(slotCode);
        const thresholds = oxygenColorThresholdsFromCode(slotCode);

        return {
          slotCode,
          zoneName: zone.zoneName,
          criticalValue: hasSetpoint ? thresholds.criticalValue : null,
          lowValue: hasSetpoint ? thresholds.lowValue : null,
          highValue: hasSetpoint ? thresholds.highValue : null,
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

function formatSetpointValue(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return numeric.toFixed(2);
}

export function OxygenColorSetpointsPage() {
  const { accessToken } = useAuth();

  const oxygenColorSetpointsQuery = useQuery({
    queryKey: ["oxygen-color-setpoints", "oxygen-color-page"],
    queryFn: () => oxygenColorSetpointsRequest(accessToken),
    refetchInterval: 15000
  });

  const oxygenColorSetpointsState = useMemo(() => {
    const rows = oxygenColorSetpointsQuery.data || [];

    if (rows.length > 0) {
      const normalizedRows = rows
        .map((row) => ({
          slotCode: row.slot_code,
          zoneName: row.zone_name || zoneNameFromSlotCode(row.slot_code),
          criticalValue: row.critical_value,
          lowValue: row.low_value,
          highValue: row.high_value,
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
      rows: buildDemoOxygenColorSetpoints(),
      isDemo: true
    };
  }, [oxygenColorSetpointsQuery.data]);

  return (
    <section className="alert-setpoints-page">
      <article className="panel alert-setpoints-panel">
        <div className="alert-setpoints-header">
          <h3>Consignas PLC - Oxígeno (color)</h3>
          <p>
            Estas consignas determinan el color de fondo por piscina en SCADA según el valor de O2.
            Vista de solo lectura.
          </p>
        </div>

        {oxygenColorSetpointsState.isDemo ? (
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
                <th>Bajo</th>
                <th>Alto</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {oxygenColorSetpointsState.rows.map((row) => (
                <tr key={row.slotCode}>
                  <td>{row.zoneName}</td>
                  <td>{row.slotCode}</td>
                  <td>{formatSetpointValue(row.criticalValue)}</td>
                  <td>{formatSetpointValue(row.lowValue)}</td>
                  <td>{formatSetpointValue(row.highValue)}</td>
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
