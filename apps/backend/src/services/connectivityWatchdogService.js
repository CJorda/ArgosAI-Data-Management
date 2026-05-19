import net from "net";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const DEFAULT_HTTP_CHECK_TIMEOUT_MS = 10000;
const MAX_RECENT_CHECKS = 60;
const MAX_RECENT_CALLS = 60;
const MAX_RECENT_EVENTS = 120;

const MIN_INTERVAL_MS = 15000;
const MAX_INTERVAL_MS = 60 * 60 * 1000;
const MIN_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 30000;
const MIN_FAILURE_THRESHOLD = 1;
const MAX_FAILURE_THRESHOLD = 20;
const MIN_COOLDOWN_MINUTES = 1;
const MAX_COOLDOWN_MINUTES = 24 * 60;

const tenantWatchdogs = new Map();
let serviceStarted = false;

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(numeric), min), max);
}

function nowIso() {
  return new Date().toISOString();
}

function toList(input) {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input;
  }

  return [input];
}

function normalizeTargetList(input) {
  const uniqueTargets = new Set();

  for (const item of toList(input)) {
    const chunks = String(item || "")
      .split(/[\n,;]+/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    for (const chunk of chunks) {
      uniqueTargets.add(chunk);
    }
  }

  return Array.from(uniqueTargets);
}

function normalizePhoneList(input) {
  const uniquePhones = new Set();

  for (const item of toList(input)) {
    const chunks = String(item || "")
      .split(/[\n,;]+/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    for (const chunk of chunks) {
      uniquePhones.add(chunk);
    }
  }

  return Array.from(uniquePhones);
}

function pushBounded(list, item, maxItems) {
  list.unshift(item);

  if (list.length > maxItems) {
    list.length = maxItems;
  }
}

function addEvent(status, event) {
  pushBounded(
    status.events,
    {
      at: nowIso(),
      ...event
    },
    MAX_RECENT_EVENTS
  );
}

function isTwilioConfigured() {
  return Boolean(env.twilioEnabled && env.twilioAccountSid && env.twilioAuthToken && env.twilioFromNumber);
}

function twilioDiagnostics() {
  return {
    enabled: Boolean(env.twilioEnabled),
    configured: isTwilioConfigured(),
    fromNumber: env.twilioFromNumber || null,
    missingFields: [
      !env.twilioAccountSid ? "TWILIO_ACCOUNT_SID" : null,
      !env.twilioAuthToken ? "TWILIO_AUTH_TOKEN" : null,
      !env.twilioFromNumber ? "TWILIO_FROM_NUMBER" : null
    ].filter(Boolean)
  };
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildDefaultConfig() {
  return {
    enabled: Boolean(env.connectivityWatchdogEnabled),
    targets: normalizeTargetList(env.connectivityWatchdogTargets),
    intervalMs: clampNumber(
      env.connectivityWatchdogIntervalMs,
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
      60000
    ),
    timeoutMs: clampNumber(env.connectivityWatchdogTimeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, 3500),
    failureThreshold: clampNumber(
      env.connectivityWatchdogFailureThreshold,
      MIN_FAILURE_THRESHOLD,
      MAX_FAILURE_THRESHOLD,
      3
    ),
    cooldownMinutes: clampNumber(
      env.connectivityWatchdogCooldownMinutes,
      MIN_COOLDOWN_MINUTES,
      MAX_COOLDOWN_MINUTES,
      30
    ),
    toNumbers: normalizePhoneList(env.twilioAlertToNumbers),
    voiceMessage:
      String(env.connectivityWatchdogDefaultMessage || "").trim()
      || "Alerta ArgosAI: perdida de conectividad a internet detectada en la planta."
  };
}

function buildDefaultStatus() {
  return {
    connected: null,
    inIncident: false,
    consecutiveFailures: 0,
    checksTotal: 0,
    checksSucceeded: 0,
    checksFailed: 0,
    lastCheckAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    lastIncidentAt: null,
    lastRecoveryAt: null,
    lastTwilioCallAt: null,
    lastTwilioCallSummary: null,
    isChecking: false,
    recentChecks: [],
    recentCalls: [],
    events: []
  };
}

function cloneStateSnapshot(tenantId, state) {
  return {
    tenantId,
    config: {
      ...state.config,
      targets: [...state.config.targets],
      toNumbers: [...state.config.toNumbers]
    },
    status: {
      ...state.status,
      recentChecks: state.status.recentChecks.map((entry) => ({ ...entry })),
      recentCalls: state.status.recentCalls.map((entry) => ({ ...entry })),
      events: state.status.events.map((entry) => ({ ...entry }))
    },
    twilio: twilioDiagnostics()
  };
}

function ensureTenantState(tenantId) {
  const normalizedTenantId = String(tenantId || "").trim();

  if (!normalizedTenantId) {
    throw new Error("Missing tenant id");
  }

  if (!tenantWatchdogs.has(normalizedTenantId)) {
    const state = {
      config: buildDefaultConfig(),
      status: buildDefaultStatus(),
      timerId: null,
      checkInFlight: false
    };

    addEvent(state.status, {
      level: "info",
      type: "watchdog-created",
      message: "Monitor de conectividad inicializado"
    });

    tenantWatchdogs.set(normalizedTenantId, state);
  }

  return tenantWatchdogs.get(normalizedTenantId);
}

function clearTenantTimer(state) {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function scheduleTenantChecks(tenantId, state) {
  clearTenantTimer(state);

  if (!serviceStarted || !state.config.enabled) {
    return;
  }

  state.timerId = setInterval(() => {
    runConnectivityWatchdogCheckNow(tenantId, { trigger: "scheduler" }).catch((error) => {
      logger.error(
        {
          err: error,
          tenantId,
          service: "connectivityWatchdog"
        },
        "Connectivity watchdog scheduled check failed"
      );
    });
  }, state.config.intervalMs);

  if (typeof state.timerId.unref === "function") {
    state.timerId.unref();
  }
}

function parseTarget(target) {
  const normalizedTarget = String(target || "").trim();

  if (!normalizedTarget) {
    return null;
  }

  if (/^https?:\/\//i.test(normalizedTarget)) {
    return {
      type: "http",
      target: normalizedTarget,
      display: normalizedTarget
    };
  }

  const hostAndPort = normalizedTarget.split(":");
  const host = String(hostAndPort[0] || "").trim();

  if (!host) {
    return null;
  }

  const parsedPort = hostAndPort.length > 1 ? Number(hostAndPort[1]) : 443;

  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    return null;
  }

  return {
    type: "tcp",
    host,
    port: parsedPort,
    target: normalizedTarget,
    display: `${host}:${parsedPort}`
  };
}

async function checkHttpTarget(target, timeoutMs) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target.target, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal
    });
    const latencyMs = Date.now() - startedAt;
    const ok = response.status >= 200 && response.status < 500;

    return {
      target: target.display,
      ok,
      latencyMs,
      status: response.status,
      error: ok ? null : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      target: target.display,
      ok: false,
      latencyMs: Date.now() - startedAt,
      status: null,
      error: error instanceof Error ? error.message : "HTTP check failed"
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function checkTcpTarget(target, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.createConnection({ host: target.host, port: target.port });
    let settled = false;

    const settle = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.once("connect", () => {
      settle({
        target: target.display,
        ok: true,
        latencyMs: Date.now() - startedAt,
        status: "connected",
        error: null
      });
    });

    socket.once("error", (error) => {
      settle({
        target: target.display,
        ok: false,
        latencyMs: Date.now() - startedAt,
        status: null,
        error: error instanceof Error ? error.message : "TCP check failed"
      });
    });

    socket.setTimeout(timeoutMs, () => {
      settle({
        target: target.display,
        ok: false,
        latencyMs: Date.now() - startedAt,
        status: null,
        error: `Timeout after ${timeoutMs}ms`
      });
    });
  });
}

async function evaluateConnectivity(targets, timeoutMs) {
  const parsedTargets = targets.map(parseTarget).filter(Boolean);

  if (parsedTargets.length === 0) {
    return {
      connected: false,
      results: [],
      failureReason: "No hay objetivos configurados para la comprobacion"
    };
  }

  const results = await Promise.all(
    parsedTargets.map((target) => {
      if (target.type === "http") {
        return checkHttpTarget(target, timeoutMs);
      }

      return checkTcpTarget(target, timeoutMs);
    })
  );

  const connected = results.some((result) => result.ok);
  const firstFailure = results.find((result) => !result.ok);

  return {
    connected,
    results,
    failureReason: connected ? null : firstFailure?.error || "Todos los objetivos han fallado"
  };
}

async function callTwilioVoice(toNumber, message) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_HTTP_CHECK_TIMEOUT_MS);

  try {
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      env.twilioAccountSid
    )}/Calls.json`;
    const twiml = `<Response><Say voice="alice" language="es-ES">${escapeXml(
      message
    )}</Say></Response>`;
    const body = new URLSearchParams({
      To: toNumber,
      From: env.twilioFromNumber,
      Twiml: twiml
    });
    const authToken = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString(
      "base64"
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString(),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const detail = payload?.message || `Twilio HTTP ${response.status}`;
      return {
        ok: false,
        sid: null,
        status: "error",
        error: detail
      };
    }

    return {
      ok: true,
      sid: payload?.sid || null,
      status: payload?.status || "queued",
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      sid: null,
      status: "error",
      error: error instanceof Error ? error.message : "Twilio call failed"
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function canTriggerTwilio(status, config, timestampMs) {
  if (status.consecutiveFailures < config.failureThreshold) {
    return false;
  }

  if (!status.lastTwilioCallAt) {
    return true;
  }

  const elapsedMs = timestampMs - Date.parse(status.lastTwilioCallAt);
  const cooldownMs = config.cooldownMinutes * 60 * 1000;

  return elapsedMs >= cooldownMs;
}

async function sendTwilioCalls(state, options) {
  const numbers = normalizePhoneList(options?.toNumbers ?? state.config.toNumbers);
  const voiceMessage =
    String(options?.message || "").trim() || String(state.config.voiceMessage || "").trim();
  const trigger = options?.trigger || "manual";
  const eventAt = nowIso();

  if (!numbers.length) {
    addEvent(state.status, {
      level: "warning",
      type: "twilio-skipped",
      message: "No hay destinatarios configurados para llamadas Twilio",
      trigger
    });

    return {
      attempted: false,
      successCount: 0,
      failureCount: 0,
      reason: "No recipients configured",
      calls: []
    };
  }

  if (!isTwilioConfigured()) {
    const skippedCalls = numbers.map((toNumber) => ({
      at: eventAt,
      trigger,
      toNumber,
      ok: false,
      sid: null,
      status: "not-configured",
      error: "Twilio not configured"
    }));

    for (const callResult of skippedCalls) {
      pushBounded(state.status.recentCalls, callResult, MAX_RECENT_CALLS);
    }

    state.status.lastTwilioCallAt = eventAt;
    state.status.lastTwilioCallSummary = {
      trigger,
      successCount: 0,
      failureCount: skippedCalls.length,
      total: skippedCalls.length
    };

    addEvent(state.status, {
      level: "warning",
      type: "twilio-skipped",
      message: "Twilio no esta configurado en backend",
      trigger
    });

    return {
      attempted: false,
      successCount: 0,
      failureCount: numbers.length,
      reason: "Twilio not configured",
      calls: skippedCalls
    };
  }

  const calls = await Promise.all(
    numbers.map(async (toNumber) => {
      const result = await callTwilioVoice(toNumber, voiceMessage);

      return {
        at: nowIso(),
        trigger,
        toNumber,
        ok: result.ok,
        sid: result.sid,
        status: result.status,
        error: result.error
      };
    })
  );

  for (const callResult of calls) {
    pushBounded(state.status.recentCalls, callResult, MAX_RECENT_CALLS);
  }

  const successCount = calls.filter((call) => call.ok).length;
  const failureCount = calls.length - successCount;

  state.status.lastTwilioCallAt = nowIso();
  state.status.lastTwilioCallSummary = {
    trigger,
    successCount,
    failureCount,
    total: calls.length
  };

  addEvent(state.status, {
    level: failureCount > 0 ? "warning" : "info",
    type: trigger === "incident" ? "incident-call" : "manual-call",
    message:
      failureCount > 0
        ? `Llamadas Twilio enviadas con incidencias (${successCount}/${calls.length} OK)`
        : `Llamadas Twilio enviadas correctamente (${calls.length})`,
    trigger
  });

  return {
    attempted: true,
    successCount,
    failureCount,
    calls
  };
}

export function startConnectivityWatchdogService() {
  serviceStarted = true;

  for (const [tenantId, state] of tenantWatchdogs.entries()) {
    scheduleTenantChecks(tenantId, state);
  }
}

export function stopConnectivityWatchdogService() {
  serviceStarted = false;

  for (const state of tenantWatchdogs.values()) {
    clearTenantTimer(state);
  }
}

export function getConnectivityWatchdogStatus(tenantId) {
  const state = ensureTenantState(tenantId);

  if (serviceStarted) {
    scheduleTenantChecks(tenantId, state);
  }

  return cloneStateSnapshot(tenantId, state);
}

export async function runConnectivityWatchdogCheckNow(tenantId, options = {}) {
  const state = ensureTenantState(tenantId);

  if (state.checkInFlight) {
    return cloneStateSnapshot(tenantId, state);
  }

  state.checkInFlight = true;
  state.status.isChecking = true;

  try {
    const trigger = options.trigger || "manual";
    const evaluation = await evaluateConnectivity(state.config.targets, state.config.timeoutMs);
    const timestampMs = Date.now();
    const at = new Date(timestampMs).toISOString();
    const okTargets = evaluation.results.filter((item) => item.ok).map((item) => item.target);
    const failedTargets = evaluation.results
      .filter((item) => !item.ok)
      .map((item) => ({ target: item.target, error: item.error }));

    state.status.connected = evaluation.connected;
    state.status.lastCheckAt = at;
    state.status.checksTotal += 1;

    pushBounded(
      state.status.recentChecks,
      {
        at,
        trigger,
        connected: evaluation.connected,
        okTargets,
        failedTargets,
        reason: evaluation.connected ? null : evaluation.failureReason
      },
      MAX_RECENT_CHECKS
    );

    if (evaluation.connected) {
      state.status.checksSucceeded += 1;
      state.status.consecutiveFailures = 0;
      state.status.lastSuccessAt = at;
      state.status.lastFailureReason = null;

      if (state.status.inIncident) {
        state.status.inIncident = false;
        state.status.lastRecoveryAt = at;
        addEvent(state.status, {
          level: "info",
          type: "incident-recovered",
          message: "Conectividad recuperada tras incidencia",
          trigger
        });
      }
    } else {
      state.status.checksFailed += 1;
      state.status.consecutiveFailures += 1;
      state.status.lastFailureAt = at;
      state.status.lastFailureReason = evaluation.failureReason;

      if (state.status.consecutiveFailures >= state.config.failureThreshold) {
        if (!state.status.inIncident) {
          state.status.inIncident = true;
          state.status.lastIncidentAt = at;
          addEvent(state.status, {
            level: "warning",
            type: "incident-opened",
            message: "Incidencia de conectividad abierta",
            trigger
          });
        }

        if (canTriggerTwilio(state.status, state.config, timestampMs)) {
          await sendTwilioCalls(state, {
            trigger: "incident"
          });
        }
      }
    }

    return cloneStateSnapshot(tenantId, state);
  } finally {
    state.status.isChecking = false;
    state.checkInFlight = false;
  }
}

export async function updateConnectivityWatchdogConfig(tenantId, patch = {}) {
  const state = ensureTenantState(tenantId);
  const nextConfig = {
    ...state.config
  };

  if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
    nextConfig.enabled = Boolean(patch.enabled);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "targets")) {
    nextConfig.targets = normalizeTargetList(patch.targets);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "intervalMs")) {
    nextConfig.intervalMs = clampNumber(
      patch.intervalMs,
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
      state.config.intervalMs
    );
  }

  if (Object.prototype.hasOwnProperty.call(patch, "timeoutMs")) {
    nextConfig.timeoutMs = clampNumber(
      patch.timeoutMs,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      state.config.timeoutMs
    );
  }

  if (Object.prototype.hasOwnProperty.call(patch, "failureThreshold")) {
    nextConfig.failureThreshold = clampNumber(
      patch.failureThreshold,
      MIN_FAILURE_THRESHOLD,
      MAX_FAILURE_THRESHOLD,
      state.config.failureThreshold
    );
  }

  if (Object.prototype.hasOwnProperty.call(patch, "cooldownMinutes")) {
    nextConfig.cooldownMinutes = clampNumber(
      patch.cooldownMinutes,
      MIN_COOLDOWN_MINUTES,
      MAX_COOLDOWN_MINUTES,
      state.config.cooldownMinutes
    );
  }

  if (Object.prototype.hasOwnProperty.call(patch, "toNumbers")) {
    nextConfig.toNumbers = normalizePhoneList(patch.toNumbers);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "voiceMessage")) {
    const normalizedMessage = String(patch.voiceMessage || "").trim();
    if (normalizedMessage) {
      nextConfig.voiceMessage = normalizedMessage;
    }
  }

  if (nextConfig.enabled && nextConfig.targets.length === 0) {
    throw new Error("Debe configurar al menos un objetivo cuando el monitor este habilitado");
  }

  state.config = nextConfig;

  addEvent(state.status, {
    level: "info",
    type: "config-updated",
    message: "Configuracion de monitor de conectividad actualizada"
  });

  scheduleTenantChecks(tenantId, state);

  if (state.config.enabled) {
    await runConnectivityWatchdogCheckNow(tenantId, { trigger: "config-update" });
  }

  return cloneStateSnapshot(tenantId, state);
}

export async function sendConnectivityWatchdogTestCall(tenantId, payload = {}) {
  const state = ensureTenantState(tenantId);
  const result = await sendTwilioCalls(state, {
    trigger: "manual-test",
    toNumbers: payload.toNumbers,
    message: payload.message
  });

  return {
    ...cloneStateSnapshot(tenantId, state),
    testCallResult: result
  };
}
