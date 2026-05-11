import { getTenantEnabledFeatures, isFeatureEnabled } from "../services/featureAccessService.js";
import { HttpError } from "../utils/httpError.js";

async function ensureUserFeaturesLoaded(req) {
  if (!req.user?.tenantId) {
    throw new HttpError(401, "Authorization header is required");
  }

  const features = await getTenantEnabledFeatures({
    tenantId: req.user.tenantId,
    tenantCode: req.user.tenantCode
  });
  req.user.features = features;
  return features;
}

export function requireFeature(featureKey) {
  return async (req, _res, next) => {
    try {
      const features = await ensureUserFeaturesLoaded(req);

      if (!isFeatureEnabled(features, featureKey)) {
        return next(new HttpError(403, "Feature not enabled for your subscription"));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireAnyFeature(featureKeys) {
  const normalizedKeys = Array.isArray(featureKeys)
    ? featureKeys.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  return async (req, _res, next) => {
    try {
      const features = await ensureUserFeaturesLoaded(req);

      if (normalizedKeys.length === 0) {
        return next();
      }

      const hasAny = normalizedKeys.some((featureKey) => isFeatureEnabled(features, featureKey));

      if (!hasAny) {
        return next(new HttpError(403, "Feature not enabled for your subscription"));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
