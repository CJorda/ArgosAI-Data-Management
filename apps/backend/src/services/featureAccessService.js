import { env } from "../config/env.js";
import { resolveTenantFeaturesFromConfig } from "../config/tenantFeatures.js";
import { query } from "../database/pool.js";
import { ALL_FEATURE_KEYS, isKnownFeature } from "../security/featureCatalog.js";

const featureCacheByTenant = new Map();
const tenantCodeCacheByTenant = new Map();
const cacheTtlMs = 15_000;

function dedupeFeatures(features) {
  return Array.from(new Set(features.map((item) => String(item).trim()).filter(Boolean)));
}

function normalizeKnownFeatures(features) {
  return dedupeFeatures(features).filter((featureKey) => isKnownFeature(featureKey));
}

function getCachedFeatures(tenantId) {
  const cacheItem = featureCacheByTenant.get(Number(tenantId));

  if (!cacheItem) {
    return null;
  }

  if (cacheItem.expiresAt <= Date.now()) {
    featureCacheByTenant.delete(Number(tenantId));
    return null;
  }

  return cacheItem.features;
}

function setCachedFeatures(tenantId, features) {
  featureCacheByTenant.set(Number(tenantId), {
    features: normalizeKnownFeatures(features),
    expiresAt: Date.now() + cacheTtlMs
  });
}

function getCachedTenantCode(tenantId) {
  const cacheItem = tenantCodeCacheByTenant.get(Number(tenantId));

  if (!cacheItem) {
    return null;
  }

  if (cacheItem.expiresAt <= Date.now()) {
    tenantCodeCacheByTenant.delete(Number(tenantId));
    return null;
  }

  return cacheItem.tenantCode;
}

function setCachedTenantCode(tenantId, tenantCode) {
  if (!tenantCode) {
    return;
  }

  tenantCodeCacheByTenant.set(Number(tenantId), {
    tenantCode: String(tenantCode).trim().toLowerCase(),
    expiresAt: Date.now() + cacheTtlMs
  });
}

async function resolveTenantCode(tenantId, tenantCodeHint) {
  const hint = String(tenantCodeHint || "").trim().toLowerCase();

  if (hint) {
    setCachedTenantCode(tenantId, hint);
    return hint;
  }

  if (!Number.isFinite(Number(tenantId)) || Number(tenantId) <= 0) {
    return null;
  }

  const cached = getCachedTenantCode(tenantId);

  if (cached) {
    return cached;
  }

  if (env.noPostgresMode) {
    const demoCode = String(env.demoTenantCode || "demo").trim().toLowerCase();
    setCachedTenantCode(tenantId, demoCode);
    return demoCode;
  }

  try {
    const result = await query(
      `
        SELECT code
        FROM tenants
        WHERE id = $1
        LIMIT 1
      `,
      [tenantId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const tenantCode = String(result.rows[0].code || "").trim().toLowerCase();
    setCachedTenantCode(tenantId, tenantCode);
    return tenantCode || null;
  } catch (error) {
    if (error?.code === "42P01") {
      return null;
    }

    throw error;
  }
}

async function fetchTenantFeaturesFromDatabase(tenantId) {
  let result;

  try {
    result = await query(
      `
        SELECT feature_key
        FROM tenant_features
        WHERE tenant_id = $1
          AND enabled = TRUE
        ORDER BY feature_key ASC
      `,
      [tenantId]
    );
  } catch (error) {
    if (error?.code === "42P01") {
      return [...ALL_FEATURE_KEYS];
    }

    throw error;
  }

  if (result.rowCount === 0) {
    // Backward compatible default: if tenant has no explicit config, allow all features.
    return [...ALL_FEATURE_KEYS];
  }

  return normalizeKnownFeatures(result.rows.map((row) => row.feature_key));
}

export async function getTenantEnabledFeatures(tenant) {
  const numericTenantId = Number(
    typeof tenant === "object" && tenant !== null ? tenant.tenantId : tenant
  );
  const tenantCodeHint =
    typeof tenant === "object" && tenant !== null ? tenant.tenantCode : null;

  if (!Number.isFinite(numericTenantId) || numericTenantId <= 0) {
    return [...ALL_FEATURE_KEYS];
  }

  const tenantCode = await resolveTenantCode(numericTenantId, tenantCodeHint);
  const configuredFeatures = resolveTenantFeaturesFromConfig(tenantCode);

  if (Array.isArray(configuredFeatures)) {
    const normalizedConfiguredFeatures = normalizeKnownFeatures(configuredFeatures);
    setCachedFeatures(numericTenantId, normalizedConfiguredFeatures);
    return [...normalizedConfiguredFeatures];
  }

  const cached = getCachedFeatures(numericTenantId);
  if (cached) {
    return [...cached];
  }

  const features = env.noPostgresMode
    ? [...ALL_FEATURE_KEYS]
    : await fetchTenantFeaturesFromDatabase(numericTenantId);

  setCachedFeatures(numericTenantId, features);
  return [...features];
}

export function clearTenantFeatureCache(tenantId) {
  featureCacheByTenant.delete(Number(tenantId));
  tenantCodeCacheByTenant.delete(Number(tenantId));
}

export function isFeatureEnabled(features, featureKey) {
  if (!featureKey) {
    return true;
  }

  return Array.isArray(features) && features.includes(featureKey);
}
