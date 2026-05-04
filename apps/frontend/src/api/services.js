import { apiClient, authConfig } from "./client";

export async function loginRequest(payload) {
  const { data } = await apiClient.post("/auth/login", payload);
  return data;
}

export async function refreshRequest(refreshToken) {
  const { data } = await apiClient.post("/auth/refresh", { refreshToken });
  return data;
}

export async function logoutRequest(refreshToken) {
  await apiClient.post("/auth/logout", { refreshToken });
}

export async function meRequest(token) {
  const { data } = await apiClient.get("/auth/me", authConfig(token));
  return data;
}

export async function statsSummaryRequest(token) {
  const { data } = await apiClient.get("/stats/summary", authConfig(token));
  return data;
}

export async function pondsRequest(token) {
  const { data } = await apiClient.get("/data/ponds", authConfig(token));
  return data;
}

export async function sitesRequest(token) {
  const { data } = await apiClient.get("/data/sites", authConfig(token));
  return data;
}

export async function oxygenSetpointsRequest(token) {
  const { data } = await apiClient.get("/data/oxygen/setpoints", authConfig(token));
  return data;
}

export async function oxygenColorSetpointsRequest(token) {
  const { data } = await apiClient.get("/data/oxygen/color-setpoints", authConfig(token));
  return data;
}

export async function temperatureColorSetpointsRequest(token) {
  const { data } = await apiClient.get("/data/temperature/color-setpoints", authConfig(token));
  return data;
}

export async function phoneAlertSetpointsRequest(token) {
  const { data } = await apiClient.get("/data/alerts/phone-setpoints", authConfig(token));
  return data;
}

export async function smsAlertSetpointsRequest(token) {
  const { data } = await apiClient.get("/data/alerts/sms-setpoints", authConfig(token));
  return data;
}

export async function sensorsRequest(token, pondId) {
  const params = pondId ? { pondId } : undefined;
  const { data } = await apiClient.get("/data/sensors", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function latestReadingsRequest(token, limit = 30) {
  const { data } = await apiClient.get("/data/readings/latest", {
    ...authConfig(token),
    params: { limit }
  });
  return data;
}

export async function historyReadingsRequest(token, params) {
  const { data } = await apiClient.get("/data/readings/history", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function alertsRequest(token, status = "open") {
  const { data } = await apiClient.get("/alerts", {
    ...authConfig(token),
    params: { status }
  });
  return data;
}

export async function resolveAlertRequest(token, alertId) {
  const { data } = await apiClient.patch(`/alerts/${alertId}/resolve`, {}, authConfig(token));
  return data;
}

export async function operationsRequest(token) {
  const { data } = await apiClient.get("/operations", authConfig(token));
  return data;
}

export async function createOperationRequest(token, payload) {
  const { data } = await apiClient.post("/operations", payload, authConfig(token));
  return data;
}

export async function biomassRequest(token) {
  const { data } = await apiClient.get("/biomass", authConfig(token));
  return data;
}

export async function createBiomassRequest(token, payload) {
  const { data } = await apiClient.post("/biomass", payload, authConfig(token));
  return data;
}

export async function planningForecastsRequest(token) {
  const { data } = await apiClient.get("/planning/forecasts", authConfig(token));
  return data;
}

export async function feedingRecommendationsRequest(token) {
  const { data } = await apiClient.get("/planning/feeding/recommendations", authConfig(token));
  return data;
}

export async function planningPerformanceRequest(token, params) {
  const { data } = await apiClient.get("/planning/performance", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function weeklySheetRequest(token, params) {
  const { data } = await apiClient.get("/planning/weekly-sheet", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function pondHistoryRequest(token, params) {
  const { data } = await apiClient.get("/planning/pond-history", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function lotsRequest(token) {
  const { data } = await apiClient.get("/planning/traceability/lots", authConfig(token));
  return data;
}

export async function lotTimelineRequest(token, lotCode) {
  const { data } = await apiClient.get(
    `/planning/traceability/lots/${encodeURIComponent(lotCode)}`,
    authConfig(token)
  );
  return data;
}

export async function activeWithdrawalsRequest(token) {
  const { data } = await apiClient.get("/planning/withdrawals/active", authConfig(token));
  return data;
}

export async function hatcherySummaryRequest(token) {
  const { data } = await apiClient.get("/hatchery/summary", authConfig(token));
  return data;
}

export async function hatcheryBroodstockRequest(token, params) {
  const { data } = await apiClient.get("/hatchery/broodstock", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createHatcheryBroodstockRequest(token, payload) {
  const { data } = await apiClient.post("/hatchery/broodstock", payload, authConfig(token));
  return data;
}

export async function hatcheryLayingsRequest(token, params) {
  const { data } = await apiClient.get("/hatchery/layings", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createHatcheryLayingRequest(token, payload) {
  const { data } = await apiClient.post("/hatchery/layings", payload, authConfig(token));
  return data;
}

export async function hatcheryLarvalBatchesRequest(token, params) {
  const { data } = await apiClient.get("/hatchery/larval-batches", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createHatcheryLarvalBatchRequest(token, payload) {
  const { data } = await apiClient.post("/hatchery/larval-batches", payload, authConfig(token));
  return data;
}

export async function consolidationSitesRequest(token) {
  const { data } = await apiClient.get("/consolidation/sites", authConfig(token));
  return data;
}

export async function createConsolidationSiteRequest(token, payload) {
  const { data } = await apiClient.post("/consolidation/sites", payload, authConfig(token));
  return data;
}

export async function consolidationOverviewRequest(token, params) {
  const { data } = await apiClient.get("/consolidation/overview", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function strategicForecastRequest(token, params) {
  const { data } = await apiClient.get("/consolidation/forecast", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createCameraSessionRequest(token, payload) {
  const { data } = await apiClient.post("/cameras/session", payload, authConfig(token));
  return data;
}

export async function cameraSessionsRequest(token) {
  const { data } = await apiClient.get("/cameras/session", authConfig(token));
  return data;
}
