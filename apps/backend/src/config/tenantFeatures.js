import { ALL_FEATURE_KEYS, FEATURE_KEYS, isKnownFeature } from "../security/featureCatalog.js";

export const FEATURE_PLANS = Object.freeze({
  basic: Object.freeze([
    FEATURE_KEYS.DASHBOARD_VIEW,
    FEATURE_KEYS.OXYGEN_VIEW,
    FEATURE_KEYS.ALERTS_VIEW,
    FEATURE_KEYS.HISTORY_VIEW
  ]),
  pro: Object.freeze([
    FEATURE_KEYS.DASHBOARD_VIEW,
    FEATURE_KEYS.PLANT_VIEW,
    FEATURE_KEYS.OXYGEN_VIEW,
    FEATURE_KEYS.SETPOINTS_VIEW,
    FEATURE_KEYS.MACHINE_VIEW,
    FEATURE_KEYS.HISTORY_VIEW,
    FEATURE_KEYS.ALERTS_VIEW,
    FEATURE_KEYS.OPERATIONS_VIEW,
    FEATURE_KEYS.PLANNING_VIEW,
    FEATURE_KEYS.TRACEABILITY_VIEW,
    FEATURE_KEYS.BIOMASS_VIEW,
    FEATURE_KEYS.BUOYS_VIEW,
    FEATURE_KEYS.CAMERA_VIEW
  ]),
  premium: Object.freeze([...ALL_FEATURE_KEYS])
});

export const DEFAULT_TENANT_PLAN = "premium";

// Single source of truth to grant paid functionality per tenant.
// To upgrade a client, just change the plan or feature overrides here.
export const TENANT_FEATURES = Object.freeze({
  demo: {
    plan: "premium"
  }
  // Example:
  // acme: {
  //   plan: "basic"
  // },
  // bluefish: {
  //   plan: "pro",
  //   enable: [FEATURE_KEYS.HATCHERY_VIEW],
  //   disable: [FEATURE_KEYS.CAMERA_VIEW]
  // }
});

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
  const normalizedCode = normalizeCode(tenantCode);

  if (!normalizedCode) {
    const defaultFeatures = normalizeFeatureList(FEATURE_PLANS[DEFAULT_TENANT_PLAN] || []);
    return defaultFeatures.length > 0 ? defaultFeatures : null;
  }

  const tenantConfig = TENANT_FEATURES[normalizedCode] || { plan: DEFAULT_TENANT_PLAN };

  if (!tenantConfig) {
    return null;
  }

  const planName = String(tenantConfig.plan || "").trim().toLowerCase();
  const planFeatures = normalizeFeatureList(FEATURE_PLANS[planName] || []);
  const explicitFeatures = normalizeFeatureList(tenantConfig.features || []);
  const enabledFeatures = normalizeFeatureList(tenantConfig.enable || []);
  const disabledFeatureSet = new Set(normalizeFeatureList(tenantConfig.disable || []));

  const baseFeatures =
    explicitFeatures.length > 0 ? explicitFeatures : planFeatures;

  return Array.from(new Set([...baseFeatures, ...enabledFeatures])).filter(
    (featureKey) => !disabledFeatureSet.has(featureKey)
  );
}
