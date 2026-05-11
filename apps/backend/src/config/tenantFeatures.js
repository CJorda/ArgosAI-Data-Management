import { readFileSync, statSync } from "fs";
import { ALL_FEATURE_KEYS, isKnownFeature } from "../security/featureCatalog.js";

// Production runtime overrides are read from this JSON file without restarting the server.
const runtimeTenantFeaturesPath = new URL("./tenantFeatures.runtime.json", import.meta.url);
const runtimeConfigPollMs = 1_000;

// Repository fallback for explicit tenant->views assignment.
// Runtime file has priority over this map.
export const TENANT_FEATURES = Object.freeze({
  demo: {
    views: [...ALL_FEATURE_KEYS]
  }
  // Example:
  // acme: {
  //   views: ["dashboard.view", "history.view"]
  // }
});

let runtimeTenantFeaturesByCode = {};
let runtimeConfigLastCheckAt = 0;
let runtimeConfigLastMtimeMs = 0;
let tenantFeaturesConfigRevision = 0;

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeTenantConfigMap(rawValue) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {};
  }

  const normalized = {};

  for (const [tenantCode, tenantConfig] of Object.entries(rawValue)) {
    const normalizedCode = normalizeCode(tenantCode);

    if (!normalizedCode) {
      continue;
    }

    const normalizedEntry = normalizeTenantConfigEntry(tenantConfig);

    if (!normalizedEntry) {
      continue;
    }

    normalized[normalizedCode] = normalizedEntry;
  }

  return normalized;
}

function normalizeTenantConfigEntry(rawEntry) {
  if (Array.isArray(rawEntry)) {
    return {
      views: normalizeFeatureList(rawEntry)
    };
  }

  if (!rawEntry || typeof rawEntry !== "object") {
    return null;
  }

  const hasViewsField = hasOwn(rawEntry, "views");
  const hasFeaturesField = hasOwn(rawEntry, "features");

  if (!hasViewsField && !hasFeaturesField) {
    return null;
  }

  const candidateViews = hasViewsField ? rawEntry.views : rawEntry.features;

  return {
    views: normalizeFeatureList(candidateViews)
  };
}

function refreshRuntimeTenantConfigIfNeeded() {
  const now = Date.now();

  if (now - runtimeConfigLastCheckAt < runtimeConfigPollMs) {
    return;
  }

  runtimeConfigLastCheckAt = now;

  let stats;

  try {
    stats = statSync(runtimeTenantFeaturesPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      return;
    }

    if (runtimeConfigLastMtimeMs !== 0 || Object.keys(runtimeTenantFeaturesByCode).length > 0) {
      runtimeTenantFeaturesByCode = {};
      runtimeConfigLastMtimeMs = 0;
      tenantFeaturesConfigRevision += 1;
    }

    return;
  }

  if (!stats.isFile()) {
    return;
  }

  const mtimeMs = Number(stats.mtimeMs || 0);

  if (mtimeMs <= 0 || mtimeMs === runtimeConfigLastMtimeMs) {
    return;
  }

  try {
    const raw = readFileSync(runtimeTenantFeaturesPath, "utf8");
    const parsed = JSON.parse(raw);
    runtimeTenantFeaturesByCode = normalizeTenantConfigMap(parsed);
    runtimeConfigLastMtimeMs = mtimeMs;
    tenantFeaturesConfigRevision += 1;
  } catch {
    // Keep last known valid config to avoid permission outages.
  }
}

function resolveTenantConfig(tenantCode) {
  refreshRuntimeTenantConfigIfNeeded();

  const normalizedCode = normalizeCode(tenantCode);

  if (!normalizedCode) {
    return null;
  }

  return (
    runtimeTenantFeaturesByCode[normalizedCode] ||
    TENANT_FEATURES[normalizedCode] ||
    null
  );
}

function normalizeCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return code || null;
}

function normalizeFeatureList(featureList) {
  if (!Array.isArray(featureList)) {
    return [];
  }

  return Array.from(
    new Set(
      featureList
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0 && isKnownFeature(item))
    )
  );
}

export function resolveTenantFeaturesFromConfig(tenantCode) {
  const tenantConfig = normalizeTenantConfigEntry(resolveTenantConfig(tenantCode));

  if (!tenantConfig) {
    return null;
  }

  return [...tenantConfig.views];
}

export function getTenantFeaturesConfigRevision() {
  refreshRuntimeTenantConfigIfNeeded();
  return tenantFeaturesConfigRevision;
}
