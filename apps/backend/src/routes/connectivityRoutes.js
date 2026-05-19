import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureAccess.js";
import { validate } from "../middleware/validate.js";
import { FEATURE_KEYS } from "../security/featureCatalog.js";
import {
  getConnectivityWatchdogStatus,
  runConnectivityWatchdogCheckNow,
  sendConnectivityWatchdogTestCall,
  updateConnectivityWatchdogConfig
} from "../services/connectivityWatchdogService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const updateConnectivityWatchdogSchema = z
  .object({
    enabled: z.boolean().optional(),
    targets: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
    intervalMs: z.coerce.number().int().min(15000).max(3600000).optional(),
    timeoutMs: z.coerce.number().int().min(500).max(30000).optional(),
    failureThreshold: z.coerce.number().int().min(1).max(20).optional(),
    cooldownMinutes: z.coerce.number().int().min(1).max(1440).optional(),
    toNumbers: z.array(z.string().trim().min(3).max(50)).max(12).optional(),
    voiceMessage: z.string().trim().min(5).max(500).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one config field is required"
  });

const testCallSchema = z.object({
  toNumbers: z.array(z.string().trim().min(3).max(50)).max(12).optional(),
  message: z.string().trim().min(5).max(500).optional()
});

function getTenantIdFromRequest(req) {
  const tenantId = String(req.user?.tenantId || "").trim();

  if (!tenantId) {
    throw new HttpError(401, "Authorization header is required");
  }

  return tenantId;
}

export const connectivityRoutes = Router();

connectivityRoutes.use(requireAuth, requireFeature(FEATURE_KEYS.PLANT_VIEW));

connectivityRoutes.get(
  "/watchdog/status",
  asyncHandler(async (req, res) => {
    const tenantId = getTenantIdFromRequest(req);
    const snapshot = getConnectivityWatchdogStatus(tenantId);

    res.json(snapshot);
  })
);

connectivityRoutes.put(
  "/watchdog/config",
  validate(updateConnectivityWatchdogSchema),
  asyncHandler(async (req, res) => {
    const tenantId = getTenantIdFromRequest(req);
    const snapshot = await updateConnectivityWatchdogConfig(tenantId, req.body);

    res.json(snapshot);
  })
);

connectivityRoutes.post(
  "/watchdog/check-now",
  asyncHandler(async (req, res) => {
    const tenantId = getTenantIdFromRequest(req);
    const snapshot = await runConnectivityWatchdogCheckNow(tenantId, {
      trigger: "manual"
    });

    res.json(snapshot);
  })
);

connectivityRoutes.post(
  "/watchdog/test-call",
  validate(testCallSchema),
  asyncHandler(async (req, res) => {
    const tenantId = getTenantIdFromRequest(req);
    const snapshot = await sendConnectivityWatchdogTestCall(tenantId, req.body);

    res.json(snapshot);
  })
);
