import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { smsAlertSetpointsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./AlertSetpointsPage.css";

const zones = [
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

function buildDemoSmsRows() {
  const now = Date.now();

  return zones
    .flatMap((zone) =>
      zone.slotCodes.map((slotCode, index) => {
        const enabled = !["B4", "E12", "F10"].includes(slotCode);
        const oxygenMinPct = Number((35 + (index % 4) * 0.65).toFixed(2));
        const oxygenMaxPct = Number((86 + (index % 3) * 0.55).toFixed(2));
        const temperatureMaxC = Number((25.9 + (index % 5) * 0.16).toFixed(2));

        return {
          slotCode,
          zoneName: zone.zoneName,
          enabled,
          oxygenMinPct,
          oxygenMaxPct,
          temperatureMaxC,
          updatedAt: new Date(now - (index % 6) * 3600 * 1000).toISOString()
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

function isParamEnabled(row, key) {
  const explicitFlag = row?.[`${key}Enabled`];

  if (typeof explicitFlag === "boolean") {
    return explicitFlag;
  }

  return Number.isFinite(Number(row?.[key]));
}

export function SmsAlertSetpointsPage() {
  const { accessToken } = useAuth();

  const setpointsQuery = useQuery({
    queryKey: ["sms-alert-setpoints", "alerts-page"],
    queryFn: () => smsAlertSetpointsRequest(accessToken),
    refetchInterval: 15000
  });

  const state = useMemo(() => {
    const rows = setpointsQuery.data || [];

    if (rows.length > 0) {
      const normalizedRows = rows
        .map((row) => ({
          slotCode: row.slot_code,
          zoneName: row.zone_name || zoneNameFromSlotCode(row.slot_code),
          enabled: Boolean(row.enabled),
          oxygenMinPct: row.oxygen_min_pct,
          oxygenMaxPct: row.oxygen_max_pct,
          temperatureMaxC: row.temperature_max_c,
          oxygenMinPctEnabled:
            typeof row.oxygen_min_enabled === "boolean"
              ? row.oxygen_min_enabled
              : typeof row.oxygen_min_pct_enabled === "boolean"
                ? row.oxygen_min_pct_enabled
                : undefined,
          oxygenMaxPctEnabled:
            typeof row.oxygen_max_enabled === "boolean"
              ? row.oxygen_max_enabled
              : typeof row.oxygen_max_pct_enabled === "boolean"
                ? row.oxygen_max_pct_enabled
                : undefined,
          temperatureMaxCEnabled:
            typeof row.temperature_max_enabled === "boolean"
              ? row.temperature_max_enabled
              : typeof row.temperature_max_c_enabled === "boolean"
                ? row.temperature_max_c_enabled
                : undefined,
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
      rows: buildDemoSmsRows(),
      isDemo: true
    };
  }, [setpointsQuery.data]);

  return (
    <section className="alert-setpoints-page">
      <article className="panel alert-setpoints-panel">
        <div className="alert-setpoints-header">
          <h3>Avisos telefónicos - Consignas SMS</h3>
          <p>
            Lectura de consignas entregadas por PLC. Esta vista es solo informativa y no permite editar.
          </p>
        </div>

        {state.isDemo ? (
          <p className="alert-setpoints-note">
            No hay consignas PLC disponibles todavía. Se muestran valores demo.
          </p>
        ) : null}

        <div className="table-wrap">
          <table className="alert-setpoints-table">
            <thead>
              <tr>
                <th>Zona</th>
                <th>Piscina</th>
                <th>O2 mínimo activo</th>
                <th>O2 mínimo (%)</th>
                <th>O2 máximo activo</th>
                <th>O2 máximo (%)</th>
                <th>Temp máxima activa</th>
                <th>Temp máxima (ºC)</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.slotCode}>
                  <td>{row.zoneName}</td>
                  <td>{row.slotCode}</td>
                  <td>
                    <span
                      className={`alert-activation-chip ${
                        isParamEnabled(row, "oxygenMinPct")
                          ? "alert-activation-on"
                          : "alert-activation-off"
                      }`.trim()}
                    >
                      {isParamEnabled(row, "oxygenMinPct") ? "Sí" : "No"}
                    </span>
                  </td>
                  <td>{formatSetpointValue(row.oxygenMinPct)}</td>
                  <td>
                    <span
                      className={`alert-activation-chip ${
                        isParamEnabled(row, "oxygenMaxPct")
                          ? "alert-activation-on"
                          : "alert-activation-off"
                      }`.trim()}
                    >
                      {isParamEnabled(row, "oxygenMaxPct") ? "Sí" : "No"}
                    </span>
                  </td>
                  <td>{formatSetpointValue(row.oxygenMaxPct)}</td>
                  <td>
                    <span
                      className={`alert-activation-chip ${
                        isParamEnabled(row, "temperatureMaxC")
                          ? "alert-activation-on"
                          : "alert-activation-off"
                      }`.trim()}
                    >
                      {isParamEnabled(row, "temperatureMaxC") ? "Sí" : "No"}
                    </span>
                  </td>
                  <td>{formatSetpointValue(row.temperatureMaxC)}</td>
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
