import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import {
  historyReadingsRequest,
  latestReadingsRequest,
  sensorsRequest,
  statsSummaryRequest
} from "../api/services";
import { KpiCard } from "../components/KpiCard";
import { useAuth } from "../context/AuthContext";
import { useRealtimeStore } from "../store/realtimeStore";
import "./DashboardPage.css";

function chartOption(series) {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#b8cde3",
      borderWidth: 1,
      textStyle: {
        color: "#1f3553"
      }
    },
    grid: {
      top: 20,
      right: 20,
      bottom: 32,
      left: 44
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: series.map((item) => new Date(item.bucket_start).toLocaleString()),
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.5)"
        }
      },
      axisLabel: {
        color: "#4f6787"
      }
    },
    yAxis: {
      type: "value",
      axisLine: {
        lineStyle: {
          color: "rgba(112, 138, 170, 0.5)"
        }
      },
      axisLabel: {
        color: "#4f6787"
      },
      splitLine: {
        lineStyle: {
          color: "rgba(146, 169, 194, 0.34)",
          type: "dashed"
        }
      }
    },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 2.4,
          color: "#54b7ff"
        },
        areaStyle: {
          color: "rgba(84, 183, 255, 0.2)"
        },
        data: series.map((item) => Number(item.avg_value))
      }
    ]
  };
}

export function DashboardPage() {
  const { accessToken } = useAuth();
  const realtimeLatest = useRealtimeStore((state) => state.latestBySensor);

  const summaryQuery = useQuery({
    queryKey: ["summary"],
    queryFn: () => statsSummaryRequest(accessToken),
    refetchInterval: 20000
  });

  const sensorsQuery = useQuery({
    queryKey: ["sensors"],
    queryFn: () => sensorsRequest(accessToken)
  });

  const firstSensorId = sensorsQuery.data?.[0]?.id;

  const historyQuery = useQuery({
    queryKey: ["history", firstSensorId, "dashboard24h"],
    enabled: Boolean(firstSensorId),
    queryFn: () =>
      historyReadingsRequest(accessToken, {
        sensorId: firstSensorId,
        from: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        to: new Date().toISOString(),
        bucket: "hour"
      })
  });

  const latestQuery = useQuery({
    queryKey: ["latest"],
    queryFn: () => latestReadingsRequest(accessToken, 15),
    refetchInterval: 15000
  });

  const latestRows = useMemo(() => {
    const fromQuery = latestQuery.data || [];
    const fromSocket = Object.values(realtimeLatest);

    const merged = [...fromSocket, ...fromQuery];
    const seen = new Set();

    return merged
      .filter((item) => {
        const key = `${item.sensor_id}-${item.recorded_at}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
      .slice(0, 12);
  }, [latestQuery.data, realtimeLatest]);

  return (
    <section className="dashboard-page">
      <div className="kpi-grid">
        <KpiCard
          label="Alertas Abiertas"
          value={summaryQuery.data?.openAlerts ?? "-"}
          hint="Criticidad operativa"
        />
        <KpiCard
          label="Piscinas"
          value={summaryQuery.data?.totalPonds ?? "-"}
          hint="Unidades activas"
        />
        <KpiCard
          label="Sensores Activos"
          value={summaryQuery.data?.totalSensors ?? "-"}
          hint="Cobertura IoT"
        />
        <KpiCard
          label="Biomasa (30d)"
          value={summaryQuery.data ? `${summaryQuery.data.estimatedBiomassKg30d} kg` : "-"}
          hint="Estimado acumulado"
        />
      </div>

      <article className="panel">
        <h3>Tendencia Sensor Principal (24h)</h3>
        {historyQuery.data?.series?.length ? (
          <ReactECharts option={chartOption(historyQuery.data.series)} style={{ height: 320 }} />
        ) : (
          <p className="empty-text">No hay muestras suficientes todavía.</p>
        )}
      </article>

      <article className="panel">
        <h3>Lecturas Recientes</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Piscina</th>
                <th>Sensor</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {latestRows.map((row) => (
                <tr key={`${row.sensor_id}-${row.recorded_at}`}>
                  <td>{new Date(row.recorded_at).toLocaleTimeString()}</td>
                  <td>{row.pond_name}</td>
                  <td>{row.sensor_name}</td>
                  <td>
                    {row.value} {row.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
