import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { FeatureGate } from "./components/FeatureGate";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { FEATURE_KEYS } from "./features/featureCatalog";
import { AlertsPage } from "./pages/AlertsPage";
import { ArgosMachinePage } from "./pages/ArgosMachinePage";
import { BiomassPage } from "./pages/BiomassPage";
import { BuoysPage } from "./pages/BuoysPage";
import { CameraPage } from "./pages/CameraPage";
import { CompliancePage } from "./pages/CompliancePage";
import { ConsolidationPage } from "./pages/ConsolidationPage";
import { CostMarginPage } from "./pages/CostMarginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HatcheryLarvalPage } from "./pages/HatcheryLarvalPage";
import { HarvestLogisticsPage } from "./pages/HarvestLogisticsPage";
import { HealthBiosecurityPage } from "./pages/HealthBiosecurityPage";
import { HistoryPage } from "./pages/HistoryPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LiveTransportPage } from "./pages/LiveTransportPage";
import { LoginPage } from "./pages/LoginPage";
import { OxygenPage } from "./pages/OxygenPage";
import { OxygenColorSetpointsPage } from "./pages/OxygenColorSetpointsPage";
import { OperationsPage } from "./pages/OperationsPage";
import { PhoneAlertSetpointsPage } from "./pages/PhoneAlertSetpointsPage";
import { PlantMapPage } from "./pages/PlantMapPage";
import { PlanningPage } from "./pages/PlanningPage";
import { PreventiveMaintenancePage } from "./pages/PreventiveMaintenancePage";
import { SmsAlertSetpointsPage } from "./pages/SmsAlertSetpointsPage";
import { StrategicForecastPage } from "./pages/StrategicForecastPage";
import { TemperatureColorSetpointsPage } from "./pages/TemperatureColorSetpointsPage";
import { TraceabilityPage } from "./pages/TraceabilityPage";
import "./App.css";

function NotFoundPage() {
  return <div className="app-not-found">Pagina no encontrada</div>;
}

function withFeature(feature, element) {
  return <FeatureGate feature={feature}>{element}</FeatureGate>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route
            path="/"
            element={withFeature(FEATURE_KEYS.DASHBOARD_VIEW, <Navigate to="/dashboard" replace />)}
          />
          <Route
            path="/dashboard"
            element={withFeature(FEATURE_KEYS.DASHBOARD_VIEW, <DashboardPage />)}
          />
          <Route path="/planta" element={withFeature(FEATURE_KEYS.PLANT_VIEW, <PlantMapPage />)} />
          <Route
            path="/oxigeno"
            element={withFeature(
              FEATURE_KEYS.OXYGEN_VIEW,
              <Navigate to="/oxigeno/electrovalvulas" replace />
            )}
          />
          <Route
            path="/oxigeno/electrovalvulas"
            element={withFeature(FEATURE_KEYS.OXYGEN_VIEW, <OxygenPage mode="electrovalvulas" />)}
          />
          <Route
            path="/oxigeno/economia"
            element={withFeature(FEATURE_KEYS.OXYGEN_VIEW, <OxygenPage mode="economia" />)}
          />
          <Route
            path="/consignas"
            element={withFeature(
              FEATURE_KEYS.SETPOINTS_VIEW,
              <Navigate to="/consignas/oxigeno" replace />
            )}
          />
          <Route
            path="/consignas/oxigeno"
            element={withFeature(FEATURE_KEYS.SETPOINTS_VIEW, <OxygenColorSetpointsPage />)}
          />
          <Route
            path="/consignas/temperatura"
            element={withFeature(FEATURE_KEYS.SETPOINTS_VIEW, <TemperatureColorSetpointsPage />)}
          />
          <Route
            path="/avisos"
            element={withFeature(
              FEATURE_KEYS.SETPOINTS_VIEW,
              <Navigate to="/avisos/consignas-telefonicas" replace />
            )}
          />
          <Route
            path="/avisos/consignas-telefonicas"
            element={withFeature(FEATURE_KEYS.SETPOINTS_VIEW, <PhoneAlertSetpointsPage />)}
          />
          <Route
            path="/avisos/consignas-sms"
            element={withFeature(FEATURE_KEYS.SETPOINTS_VIEW, <SmsAlertSetpointsPage />)}
          />
          <Route
            path="/maquina"
            element={withFeature(
              FEATURE_KEYS.MACHINE_VIEW,
              <Navigate to="/maquina/growth-nano" replace />
            )}
          />
          <Route
            path="/maquina/:machineKey"
            element={withFeature(FEATURE_KEYS.MACHINE_VIEW, <ArgosMachinePage />)}
          />
          <Route
            path="/historico"
            element={withFeature(
              FEATURE_KEYS.HISTORY_VIEW,
              <Navigate to="/historico/piscina" replace />
            )}
          />
          <Route
            path="/historico/piscina"
            element={withFeature(FEATURE_KEYS.HISTORY_VIEW, <HistoryPage />)}
          />
          <Route
            path="/historico/parametros"
            element={withFeature(FEATURE_KEYS.HISTORY_VIEW, <HistoryPage />)}
          />
          <Route path="/historico/xy" element={withFeature(FEATURE_KEYS.HISTORY_VIEW, <HistoryPage />)} />
          <Route
            path="/historico/heatmap"
            element={withFeature(FEATURE_KEYS.HISTORY_VIEW, <HistoryPage />)}
          />
          <Route
            path="/planificacion"
            element={withFeature(FEATURE_KEYS.PLANNING_VIEW, <PlanningPage />)}
          />
          <Route
            path="/trazabilidad"
            element={withFeature(FEATURE_KEYS.TRACEABILITY_VIEW, <TraceabilityPage />)}
          />
          <Route
            path="/alertas"
            element={withFeature(FEATURE_KEYS.ALERTS_VIEW, <Navigate to="/alertas/alertas" replace />)}
          />
          <Route path="/alertas/alertas" element={withFeature(FEATURE_KEYS.ALERTS_VIEW, <AlertsPage />)} />
          <Route
            path="/alertas/prediccion-riesgo"
            element={withFeature(FEATURE_KEYS.ALERTS_VIEW, <AlertsPage />)}
          />
          <Route
            path="/operaciones"
            element={withFeature(
              FEATURE_KEYS.OPERATIONS_VIEW,
              <Navigate to="/operaciones/alimentacion" replace />
            )}
          />
          <Route
            path="/operaciones/hatchery-larval"
            element={withFeature(FEATURE_KEYS.HATCHERY_VIEW, <HatcheryLarvalPage />)}
          />
          <Route
            path="/operaciones/consolidacion-multi-sitio"
            element={withFeature(FEATURE_KEYS.CONSOLIDATION_VIEW, <ConsolidationPage />)}
          />
          <Route
            path="/operaciones/prevision-12-36"
            element={withFeature(FEATURE_KEYS.PLANNING_VIEW, <StrategicForecastPage />)}
          />
          <Route
            path="/operaciones/mantenimiento-preventivo"
            element={withFeature(FEATURE_KEYS.OPERATIONS_VIEW, <PreventiveMaintenancePage />)}
          />
          <Route
            path="/operaciones/inventario-operativo"
            element={withFeature(FEATURE_KEYS.OPERATIONS_VIEW, <InventoryPage />)}
          />
          <Route
            path="/operaciones/sanidad-bioseguridad"
            element={withFeature(FEATURE_KEYS.OPERATIONS_VIEW, <HealthBiosecurityPage />)}
          />
          <Route
            path="/operaciones/transporte-vivo"
            element={withFeature(FEATURE_KEYS.OPERATIONS_VIEW, <LiveTransportPage />)}
          />
          <Route
            path="/operaciones/cosecha-logistica"
            element={withFeature(FEATURE_KEYS.OPERATIONS_VIEW, <HarvestLogisticsPage />)}
          />
          <Route
            path="/operaciones/coste-margen"
            element={withFeature(FEATURE_KEYS.OPERATIONS_VIEW, <CostMarginPage />)}
          />
          <Route
            path="/operaciones/auditoria-compliance"
            element={withFeature(FEATURE_KEYS.OPERATIONS_VIEW, <CompliancePage />)}
          />
          <Route
            path="/operaciones/:section"
            element={withFeature(FEATURE_KEYS.OPERATIONS_VIEW, <OperationsPage />)}
          />
          <Route
            path="/biomasa"
            element={withFeature(FEATURE_KEYS.BIOMASS_VIEW, <Navigate to="/biomasa/resumen" replace />)}
          />
          <Route
            path="/biomasa/:section"
            element={withFeature(FEATURE_KEYS.BIOMASS_VIEW, <BiomassPage />)}
          />
          <Route
            path="/boyas"
            element={withFeature(FEATURE_KEYS.BUOYS_VIEW, <Navigate to="/boyas/parametros" replace />)}
          />
          <Route
            path="/boyas/:section"
            element={withFeature(FEATURE_KEYS.BUOYS_VIEW, <BuoysPage />)}
          />
          <Route path="/camara" element={withFeature(FEATURE_KEYS.CAMERA_VIEW, <CameraPage />)} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
