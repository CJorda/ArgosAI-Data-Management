import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  connectivityWatchdogStatusRequest,
  runConnectivityWatchdogCheckRequest,
  testConnectivityWatchdogCallRequest,
  updateConnectivityWatchdogConfigRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./ConnectivityWatchdogPage.css";

function splitDelimitedList(rawValue) {
  return String(rawValue || "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatError(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function boolToText(value) {
  return value ? "Si" : "No";
}

function buildFormFromConfig(config) {
  return {
    enabled: Boolean(config?.enabled),
    targetsText: Array.isArray(config?.targets) ? config.targets.join("\n") : "",
    intervalMs: Number(config?.intervalMs || 60000),
    timeoutMs: Number(config?.timeoutMs || 3500),
    failureThreshold: Number(config?.failureThreshold || 3),
    cooldownMinutes: Number(config?.cooldownMinutes || 30),
    toNumbersText: Array.isArray(config?.toNumbers) ? config.toNumbers.join(", ") : "",
    voiceMessage: String(config?.voiceMessage || "")
  };
}

export function ConnectivityWatchdogPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(buildFormFromConfig(null));
  const [isDirty, setIsDirty] = useState(false);
  const [testNumbersText, setTestNumbersText] = useState("");
  const [testMessage, setTestMessage] = useState("");

  const statusQuery = useQuery({
    queryKey: ["connectivity-watchdog", token],
    enabled: Boolean(token),
    queryFn: () => connectivityWatchdogStatusRequest(token),
    refetchInterval: 15000
  });

  const snapshot = statusQuery.data;
  const config = snapshot?.config || null;
  const status = snapshot?.status || null;
  const twilio = snapshot?.twilio || null;

  useEffect(() => {
    if (!config || isDirty) {
      return;
    }

    const nextForm = buildFormFromConfig(config);
    setForm(nextForm);
    setTestNumbersText(nextForm.toNumbersText);
    setTestMessage(nextForm.voiceMessage);
  }, [config, isDirty]);

  const updateConfigMutation = useMutation({
    mutationFn: (payload) => updateConnectivityWatchdogConfigRequest(token, payload),
    onSuccess: (nextSnapshot) => {
      queryClient.setQueryData(["connectivity-watchdog", token], nextSnapshot);
      setIsDirty(false);
    }
  });

  const checkNowMutation = useMutation({
    mutationFn: () => runConnectivityWatchdogCheckRequest(token),
    onSuccess: (nextSnapshot) => {
      queryClient.setQueryData(["connectivity-watchdog", token], nextSnapshot);
    }
  });

  const testCallMutation = useMutation({
    mutationFn: (payload) => testConnectivityWatchdogCallRequest(token, payload),
    onSuccess: (nextSnapshot) => {
      queryClient.setQueryData(["connectivity-watchdog", token], nextSnapshot);
    }
  });

  const connectivityState = useMemo(() => {
    if (!status || status.connected === null) {
      return {
        label: "Sin datos",
        className: "watchdog-pill watchdog-pill--neutral"
      };
    }

    if (status.connected) {
      return {
        label: "Conectado",
        className: "watchdog-pill watchdog-pill--ok"
      };
    }

    return {
      label: "Sin conectividad",
      className: "watchdog-pill watchdog-pill--down"
    };
  }, [status]);

  const handleFieldChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
    setIsDirty(true);
  };

  const handleRestoreFromServer = () => {
    if (!config) {
      return;
    }

    const restored = buildFormFromConfig(config);
    setForm(restored);
    setTestNumbersText(restored.toNumbersText);
    setTestMessage(restored.voiceMessage);
    setIsDirty(false);
  };

  const handleSaveConfig = (event) => {
    event.preventDefault();

    const payload = {
      enabled: Boolean(form.enabled),
      targets: splitDelimitedList(form.targetsText),
      intervalMs: Number(form.intervalMs),
      timeoutMs: Number(form.timeoutMs),
      failureThreshold: Number(form.failureThreshold),
      cooldownMinutes: Number(form.cooldownMinutes),
      toNumbers: splitDelimitedList(form.toNumbersText),
      voiceMessage: String(form.voiceMessage || "").trim()
    };

    updateConfigMutation.mutate(payload);
  };

  const handleTestCall = () => {
    testCallMutation.mutate({
      toNumbers: splitDelimitedList(testNumbersText),
      message: String(testMessage || "").trim() || form.voiceMessage
    });
  };

  const recentChecks = Array.isArray(status?.recentChecks) ? status.recentChecks.slice(0, 8) : [];
  const recentCalls = Array.isArray(status?.recentCalls) ? status.recentCalls.slice(0, 8) : [];
  const recentEvents = Array.isArray(status?.events) ? status.events.slice(0, 10) : [];

  return (
    <section className="watchdog-page">
      <header className="watchdog-header">
        <div>
          <h1>Control de conectividad Internet y llamadas Twilio</h1>
          <p>
            Configura la supervision de conectividad, umbrales de fallo y escalado automatico por
            llamada de voz.
          </p>
        </div>
        <div className="watchdog-header-actions">
          <button
            type="button"
            onClick={() => checkNowMutation.mutate()}
            disabled={checkNowMutation.isPending || status?.isChecking}
          >
            {status?.isChecking || checkNowMutation.isPending
              ? "Chequeando..."
              : "Ejecutar chequeo ahora"}
          </button>
          <button type="button" onClick={handleRestoreFromServer} disabled={!config || !isDirty}>
            Restaurar cambios
          </button>
        </div>
      </header>

      <section className="watchdog-status-grid">
        <article className="watchdog-card">
          <p className="watchdog-card-label">Estado internet</p>
          <p className={connectivityState.className}>{connectivityState.label}</p>
          <p className="watchdog-card-meta">Ultimo chequeo: {formatTimestamp(status?.lastCheckAt)}</p>
        </article>
        <article className="watchdog-card">
          <p className="watchdog-card-label">Incidencia activa</p>
          <p className={status?.inIncident ? "watchdog-pill watchdog-pill--down" : "watchdog-pill watchdog-pill--ok"}>
            {status?.inIncident ? "Activa" : "No"}
          </p>
          <p className="watchdog-card-meta">Fallos consecutivos: {status?.consecutiveFailures ?? 0}</p>
        </article>
        <article className="watchdog-card">
          <p className="watchdog-card-label">Twilio backend</p>
          <p className={twilio?.configured ? "watchdog-pill watchdog-pill--ok" : "watchdog-pill watchdog-pill--neutral"}>
            {twilio?.configured ? "Configurado" : "Incompleto"}
          </p>
          <p className="watchdog-card-meta">Habilitado por env: {boolToText(twilio?.enabled)}</p>
        </article>
        <article className="watchdog-card">
          <p className="watchdog-card-label">Ultima llamada</p>
          <p className="watchdog-card-value">{formatTimestamp(status?.lastTwilioCallAt)}</p>
          <p className="watchdog-card-meta">
            Exitos/Fallos: {status?.lastTwilioCallSummary?.successCount ?? 0}/
            {status?.lastTwilioCallSummary?.failureCount ?? 0}
          </p>
        </article>
      </section>

      <form className="watchdog-config" onSubmit={handleSaveConfig}>
        <div className="watchdog-config-title-row">
          <h2>Configuracion del monitor</h2>
          <label className="watchdog-switch">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => handleFieldChange("enabled", event.target.checked)}
            />
            <span>Monitor habilitado</span>
          </label>
        </div>

        <div className="watchdog-grid-fields">
          <label>
            Intervalo chequeo (ms)
            <input
              type="number"
              min={15000}
              max={3600000}
              step={1000}
              value={form.intervalMs}
              onChange={(event) => handleFieldChange("intervalMs", event.target.value)}
            />
          </label>
          <label>
            Timeout por objetivo (ms)
            <input
              type="number"
              min={500}
              max={30000}
              step={100}
              value={form.timeoutMs}
              onChange={(event) => handleFieldChange("timeoutMs", event.target.value)}
            />
          </label>
          <label>
            Fallos consecutivos para incidente
            <input
              type="number"
              min={1}
              max={20}
              value={form.failureThreshold}
              onChange={(event) => handleFieldChange("failureThreshold", event.target.value)}
            />
          </label>
          <label>
            Cooldown entre llamadas (min)
            <input
              type="number"
              min={1}
              max={1440}
              value={form.cooldownMinutes}
              onChange={(event) => handleFieldChange("cooldownMinutes", event.target.value)}
            />
          </label>
          <label className="watchdog-field-full">
            Objetivos de conectividad (uno por linea o separados por coma)
            <textarea
              value={form.targetsText}
              onChange={(event) => handleFieldChange("targetsText", event.target.value)}
              rows={4}
              placeholder={"1.1.1.1:53\n8.8.8.8:53\nhttps://www.google.com/generate_204"}
            />
          </label>
          <label className="watchdog-field-full">
            Telefonos de escalado (formato internacional)
            <input
              type="text"
              value={form.toNumbersText}
              onChange={(event) => handleFieldChange("toNumbersText", event.target.value)}
              placeholder="+34111111111, +34222222222"
            />
          </label>
          <label className="watchdog-field-full">
            Mensaje de voz para llamada automatica
            <textarea
              value={form.voiceMessage}
              onChange={(event) => handleFieldChange("voiceMessage", event.target.value)}
              rows={3}
              minLength={5}
              maxLength={500}
              required
            />
          </label>
        </div>

        <div className="watchdog-config-actions">
          <button type="submit" disabled={updateConfigMutation.isPending}>
            {updateConfigMutation.isPending ? "Guardando..." : "Guardar configuracion"}
          </button>
        </div>

        {updateConfigMutation.isError ? (
          <p className="watchdog-feedback watchdog-feedback--error">
            {formatError(updateConfigMutation.error, "No se pudo guardar la configuracion")}
          </p>
        ) : null}
        {updateConfigMutation.isSuccess ? (
          <p className="watchdog-feedback watchdog-feedback--ok">Configuracion actualizada.</p>
        ) : null}
      </form>

      <section className="watchdog-test-call">
        <h2>Prueba manual de llamada Twilio</h2>
        <div className="watchdog-grid-fields">
          <label className="watchdog-field-full">
            Telefonos destino de prueba
            <input
              type="text"
              value={testNumbersText}
              onChange={(event) => setTestNumbersText(event.target.value)}
              placeholder="+34111111111, +34222222222"
            />
          </label>
          <label className="watchdog-field-full">
            Mensaje de prueba
            <textarea
              rows={2}
              value={testMessage}
              onChange={(event) => setTestMessage(event.target.value)}
              placeholder="Mensaje para validar la locucion de la llamada"
            />
          </label>
        </div>
        <div className="watchdog-config-actions">
          <button
            type="button"
            onClick={handleTestCall}
            disabled={testCallMutation.isPending || !splitDelimitedList(testNumbersText).length}
          >
            {testCallMutation.isPending ? "Llamando..." : "Ejecutar llamada de prueba"}
          </button>
        </div>
        {testCallMutation.isError ? (
          <p className="watchdog-feedback watchdog-feedback--error">
            {formatError(testCallMutation.error, "No se pudo ejecutar la llamada de prueba")}
          </p>
        ) : null}
        {testCallMutation.isSuccess ? (
          <p className="watchdog-feedback watchdog-feedback--ok">
            Llamada de prueba procesada. Revisa el historico para el detalle.
          </p>
        ) : null}
      </section>

      <section className="watchdog-columns">
        <article className="watchdog-log-card">
          <h3>Ultimos chequeos</h3>
          {recentChecks.length ? (
            <ul>
              {recentChecks.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <p>
                    <strong>{entry.connected ? "OK" : "FALLO"}</strong> {formatTimestamp(entry.at)}
                  </p>
                  <p>Trigger: {entry.trigger}</p>
                  <p>Objetivos OK: {entry.okTargets?.join(", ") || "-"}</p>
                  <p>
                    Objetivos KO: {entry.failedTargets?.map((item) => `${item.target}: ${item.error}`).join(" | ") || "-"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="watchdog-empty">Sin chequeos registrados todavia.</p>
          )}
        </article>

        <article className="watchdog-log-card">
          <h3>Ultimas llamadas</h3>
          {recentCalls.length ? (
            <ul>
              {recentCalls.map((entry, index) => (
                <li key={`${entry.at}-${entry.toNumber}-${index}`}>
                  <p>
                    <strong>{entry.ok ? "OK" : "ERROR"}</strong> {entry.toNumber}
                  </p>
                  <p>{formatTimestamp(entry.at)}</p>
                  <p>Trigger: {entry.trigger}</p>
                  <p>Estado: {entry.status || "-"}</p>
                  <p>Error: {entry.error || "-"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="watchdog-empty">Sin llamadas registradas.</p>
          )}
        </article>

        <article className="watchdog-log-card">
          <h3>Eventos recientes</h3>
          {recentEvents.length ? (
            <ul>
              {recentEvents.map((entry, index) => (
                <li key={`${entry.at}-${entry.type}-${index}`}>
                  <p>
                    <strong>{entry.type}</strong> ({entry.level})
                  </p>
                  <p>{entry.message}</p>
                  <p>{formatTimestamp(entry.at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="watchdog-empty">Sin eventos registrados.</p>
          )}
        </article>
      </section>

      {statusQuery.isError ? (
        <p className="watchdog-feedback watchdog-feedback--error">
          {formatError(statusQuery.error, "No se pudo cargar el estado del monitor")}
        </p>
      ) : null}
    </section>
  );
}
