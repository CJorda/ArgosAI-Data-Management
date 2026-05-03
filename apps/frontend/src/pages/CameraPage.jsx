import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cameraSessionsRequest, createCameraSessionRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./CameraPage.css";

export function CameraPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ["cameraSessions"],
    queryFn: () => cameraSessionsRequest(accessToken)
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCameraSessionRequest(accessToken, {
        machineType: "Contadora S/L",
        machineId: "BFS-PGE-16S2C-CS",
        durationMinutes: 20
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameraSessions"] });
    }
  });

  const activeSession = useMemo(() => {
    const list = sessionsQuery.data || [];
    const now = Date.now();
    return list.find((item) => new Date(item.expires_at).getTime() > now) || list[0] || null;
  }, [sessionsQuery.data]);

  return (
    <section className="camera-page">
      <article className="panel">
        <h3>FLIR Blackfly on Jetson</h3>
        <p>
          Flujo previsto: GigE Vision a NVIDIA Jetson, streaming WebRTC con fallback HLS o frame
          estático.
        </p>
        <button type="button" className="primary-button" onClick={() => createMutation.mutate()}>
          {createMutation.isPending ? "Creando sesión..." : "Crear sesión de cámara"}
        </button>

        {activeSession ? (
          <div className="camera-meta">
            <p>
              <strong>Equipo:</strong> {activeSession.machine_type}
            </p>
            <p>
              <strong>Cámara:</strong> {activeSession.machine_id}
            </p>
            <p>
              <strong>Protocolo:</strong> {activeSession.stream_protocol}
            </p>
            <p>
              <strong>Expira:</strong> {new Date(activeSession.expires_at).toLocaleString()}
            </p>
          </div>
        ) : null}
      </article>

      <article className="panel">
        <h3>Vista de cámara (Mock)</h3>
        {activeSession ? (
          <div className="camera-frame">
            <img src={activeSession.fallback_url} alt="Mock stream" />
            <small>{activeSession.stream_url}</small>
          </div>
        ) : (
          <p className="empty-text">No hay sesiones activas.</p>
        )}
      </article>
    </section>
  );
}
