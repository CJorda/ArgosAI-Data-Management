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

export async function createPondRequest(token, payload) {
  const { data } = await apiClient.post("/data/ponds", payload, authConfig(token));
  return data;
}

export async function updatePondMappingRequest(token, pondId, payload) {
  const { data } = await apiClient.patch(
    `/data/ponds/${pondId}/mapping`,
    payload,
    authConfig(token)
  );
  return data;
}

export async function ingestScadaReadingsRequest(token, payload) {
  const { data } = await apiClient.post("/data/scada/readings", payload, authConfig(token));
  return data;
}

export async function scadaUnmappedSignalsRequest(token) {
  const { data } = await apiClient.get("/data/scada/unmapped", authConfig(token));
  return data;
}

export async function resolveScadaUnmappedSignalRequest(token, signalId, payload) {
  const { data } = await apiClient.post(
    `/data/scada/unmapped/${signalId}/resolve`,
    payload,
    authConfig(token)
  );
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

export async function sensorHealthOverviewRequest(token, params) {
  const { data } = await apiClient.get("/data/sensors/health", {
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

export async function waterFlowConfigRequest(token) {
  const { data } = await apiClient.get("/data/water-flow/config", authConfig(token));
  return data;
}

export async function updateWaterFlowConfigRequest(token, payload) {
  const { data } = await apiClient.put("/data/water-flow/config", payload, authConfig(token));
  return data;
}

export async function waterFlowOverviewRequest(token, params) {
  const { data } = await apiClient.get("/data/water-flow/overview", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createWaterFlowReadingRequest(token, payload) {
  const { data } = await apiClient.post("/data/water-flow/readings", payload, authConfig(token));
  return data;
}

export async function waterFlowAlertsRequest(token, status = "open") {
  const { data } = await apiClient.get("/data/water-flow/alerts", {
    ...authConfig(token),
    params: { status }
  });
  return data;
}

export async function resolveWaterFlowAlertRequest(token, alertId) {
  const { data } = await apiClient.patch(
    `/data/water-flow/alerts/${alertId}/resolve`,
    {},
    authConfig(token)
  );
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

export async function updateAlertProtocolRequest(token, alertId, payload) {
  const { data } = await apiClient.patch(`/alerts/${alertId}/protocol`, payload, authConfig(token));
  return data;
}

export async function alertsRiskForecastRequest(token, params) {
  const { data } = await apiClient.get("/alerts/risk-forecast", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function syncSensorHealthAlertsRequest(token, payload) {
  const { data } = await apiClient.post(
    "/alerts/sensor-health/sync",
    payload,
    authConfig(token)
  );
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

export async function maintenancePlanRequest(token, params) {
  const { data } = await apiClient.get("/operations/maintenance/plan", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createMaintenanceTaskRequest(token, payload) {
  const { data } = await apiClient.post("/operations/maintenance/tasks", payload, authConfig(token));
  return data;
}

export async function updateMaintenanceTaskRequest(token, taskId, payload) {
  const { data } = await apiClient.patch(
    `/operations/maintenance/tasks/${taskId}`,
    payload,
    authConfig(token)
  );
  return data;
}

export async function inventoryItemsRequest(token) {
  const { data } = await apiClient.get("/operations/inventory/items", authConfig(token));
  return data;
}

export async function createInventoryItemRequest(token, payload) {
  const { data } = await apiClient.post("/operations/inventory/items", payload, authConfig(token));
  return data;
}

export async function inventoryMovementsRequest(token, params) {
  const { data } = await apiClient.get("/operations/inventory/movements", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createInventoryMovementRequest(token, payload) {
  const { data } = await apiClient.post("/operations/inventory/movements", payload, authConfig(token));
  return data;
}

export async function healthEventsRequest(token, params) {
  const { data } = await apiClient.get("/operations/health/events", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createHealthEventRequest(token, payload) {
  const { data } = await apiClient.post("/operations/health/events", payload, authConfig(token));
  return data;
}

export async function updateHealthEventRequest(token, eventId, payload) {
  const { data } = await apiClient.patch(
    `/operations/health/events/${eventId}`,
    payload,
    authConfig(token)
  );
  return data;
}

export async function harvestPlansRequest(token, params) {
  const { data } = await apiClient.get("/operations/harvest/plans", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createHarvestPlanRequest(token, payload) {
  const { data } = await apiClient.post("/operations/harvest/plans", payload, authConfig(token));
  return data;
}

export async function updateHarvestPlanStatusRequest(token, planId, payload) {
  const { data } = await apiClient.patch(
    `/operations/harvest/plans/${planId}/status`,
    payload,
    authConfig(token)
  );
  return data;
}

export async function harvestShipmentsRequest(token, params) {
  const { data } = await apiClient.get("/operations/harvest/shipments", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createHarvestShipmentRequest(token, planId, payload) {
  const { data } = await apiClient.post(
    `/operations/harvest/plans/${planId}/shipments`,
    payload,
    authConfig(token)
  );
  return data;
}

export async function liveTransportTripsRequest(token, params) {
  const { data } = await apiClient.get("/operations/live-transport/trips", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createLiveTransportTripRequest(token, payload) {
  const { data } = await apiClient.post("/operations/live-transport/trips", payload, authConfig(token));
  return data;
}

export async function updateLiveTransportTripStatusRequest(token, tripId, payload) {
  const { data } = await apiClient.patch(
    `/operations/live-transport/trips/${tripId}/status`,
    payload,
    authConfig(token)
  );
  return data;
}

export async function liveTransportReadingsRequest(token, params) {
  const { data } = await apiClient.get("/operations/live-transport/readings", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createLiveTransportReadingRequest(token, payload) {
  const { data } = await apiClient.post("/operations/live-transport/readings", payload, authConfig(token));
  return data;
}

export async function auditLogsRequest(token, params) {
  const { data } = await apiClient.get("/operations/audit/logs", {
    ...authConfig(token),
    params
  });
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

export async function planningCostMarginRequest(token, params) {
  const { data } = await apiClient.get("/planning/cost-margin", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function planningAutoCostAssumptionsRequest(token, params) {
  const { data } = await apiClient.get("/planning/cost-assumptions/auto", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function harvestSimulatorRequest(token, params) {
  const { data } = await apiClient.get("/planning/harvest-simulator", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function harvestTrainingScenariosRequest(token, params) {
  const { data } = await apiClient.get("/planning/harvest-simulator/training-scenarios", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function createHarvestTrainingScenarioRequest(token, payload) {
  const { data } = await apiClient.post(
    "/planning/harvest-simulator/training-scenarios",
    payload,
    authConfig(token)
  );
  return data;
}

export async function clearHarvestTrainingScenariosRequest(token) {
  const { data } = await apiClient.delete(
    "/planning/harvest-simulator/training-scenarios",
    authConfig(token)
  );
  return data;
}

export async function planningExecutiveReportRequest(token, params) {
  const { data } = await apiClient.get("/planning/reports/executive", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function planningGeneratedReportRequest(token, params) {
  const { data } = await apiClient.get("/planning/reports/generated", {
    ...authConfig(token),
    params
  });
  return data;
}

export async function planningReportAutomationStatusRequest(token) {
  const { data } = await apiClient.get("/planning/reports/automation/status", authConfig(token));
  return data;
}

export async function planningReportRunNowRequest(token, payload) {
  const { data } = await apiClient.post("/planning/reports/automation/run-now", payload, authConfig(token));
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

export async function createTraceabilityCertificateRequest(token, payload) {
  const { data } = await apiClient.post(
    "/planning/traceability/certificates",
    payload,
    authConfig(token)
  );
  return data;
}

export async function verifyPublicTraceabilityCertificateRequest(publicId, signature) {
  const { data } = await apiClient.get(
    `/public/traceability/verify/${encodeURIComponent(publicId)}`,
    {
      params: {
        sig: signature
      }
    }
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

export async function cameraInferenceRequest(token, params) {
  const { data } = await apiClient.get("/cameras/inference", {
    ...authConfig(token),
    params
  });
  return data;
}
