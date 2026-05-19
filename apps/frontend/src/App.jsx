import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { FeatureGate } from "./components/FeatureGate";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { FEATURE_KEYS } from "./features/featureCatalog";
import { AlertsPage } from "./pages/AlertsPage";
import { AdvancedAnalyticsPage } from "./pages/AdvancedAnalyticsPage";
import { ArgosMachinePage } from "./pages/ArgosMachinePage";
import { BiomassPage } from "./pages/BiomassPage";
import { BuoysPage } from "./pages/BuoysPage";
import { CameraPage } from "./pages/CameraPage";
import { CompliancePage } from "./pages/CompliancePage";
import { ConsolidationPage } from "./pages/ConsolidationPage";
import { CostMarginPage } from "./pages/CostMarginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FeedingConfirmationPage } from "./pages/FeedingConfirmationPage";
import { HatcheryLarvalPage } from "./pages/HatcheryLarvalPage";
import { HarvestLogisticsPage } from "./pages/HarvestLogisticsPage";
import { HealthBiosecurityPage } from "./pages/HealthBiosecurityPage";
import { HistoryPage } from "./pages/HistoryPage";
import { HydroConfederationsPage } from "./pages/HydroConfederationsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LiveTransportPage } from "./pages/LiveTransportPage";
import { LoginPage } from "./pages/LoginPage";
import { CheDataDeliveryPage } from "./pages/CheDataDeliveryPage";
import { ConnectivityWatchdogPage } from "./pages/ConnectivityWatchdogPage";
import { LabWaterSamplesPage } from "./pages/LabWaterSamplesPage";
import { OxygenPage } from "./pages/OxygenPage";
import { OxygenColorSetpointsPage } from "./pages/OxygenColorSetpointsPage";
import { OperationsPage } from "./pages/OperationsPage";
import { PhoneAlertSetpointsPage } from "./pages/PhoneAlertSetpointsPage";
import { PlantMapPage } from "./pages/PlantMapPage";
import { PondsCatalogPage } from "./pages/PondsCatalogPage";
import { PlanningPage } from "./pages/PlanningPage";
import { PlantAutomationEquipmentPage } from "./pages/PlantAutomationEquipmentPage";
import { PreventiveMaintenancePage } from "./pages/PreventiveMaintenancePage";
import { SensorHealthPage } from "./pages/SensorHealthPage";
import { PlantWaterFlowPage } from "./pages/PlantWaterFlowPage";
import { SmsAlertSetpointsPage } from "./pages/SmsAlertSetpointsPage";
import { StrategicForecastPage } from "./pages/StrategicForecastPage";
import { TemperatureColorSetpointsPage } from "./pages/TemperatureColorSetpointsPage";
import { TraceabilityPage } from "./pages/TraceabilityPage";
import { TraceabilityPublicVerifyPage } from "./pages/TraceabilityPublicVerifyPage";
import "./App.css";

function NotFoundPage() {
  return <div className="app-not-found">Pagina no encontrada</div>;
}

function withFeature(feature, element) {
  return <FeatureGate feature={feature}>{element}</FeatureGate>;
}

const defaultFeatureRoutes = [
  [FEATURE_KEYS.DASHBOARD_VIEW, "/dashboard"],
  [FEATURE_KEYS.PLANT_VIEW, "/planta"],
  [FEATURE_KEYS.OXYGEN_VIEW, "/oxigeno/electrovalvulas"],
  [FEATURE_KEYS.SETPOINTS_VIEW, "/consignas/oxigeno"],
  [FEATURE_KEYS.MACHINE_VIEW, "/maquina/growth-nano"],
  [FEATURE_KEYS.HISTORY_VIEW, "/historico/piscina"],
  [FEATURE_KEYS.ALERTS_VIEW, "/alertas/alertas"],
  [FEATURE_KEYS.OPERATIONS_VIEW, "/operaciones/alimentacion"],
  [FEATURE_KEYS.HATCHERY_VIEW, "/operaciones/hatchery-larval"],
  [FEATURE_KEYS.CONSOLIDATION_VIEW, "/operaciones/consolidacion-multi-sitio"],
  [FEATURE_KEYS.PLANNING_VIEW, "/planificacion"],
  [FEATURE_KEYS.TRACEABILITY_VIEW, "/trazabilidad"],
  [FEATURE_KEYS.BIOMASS_VIEW, "/biomasa/resumen"],
  [FEATURE_KEYS.BUOYS_VIEW, "/boyas/parametros"],
  [FEATURE_KEYS.CAMERA_VIEW, "/camara"]
];

function DefaultFeatureRoute() {
  const { hasFeature, features } = useAuth();

  // If backend omits feature list, keep historical behavior and open dashboard.
  if (!Array.isArray(features)) {
    return <Navigate to="/dashboard" replace />;
  }

  const firstEnabledRoute = defaultFeatureRoutes.find(([featureKey]) => hasFeature(featureKey));

  if (!firstEnabledRoute) {
    return <div className="app-not-found">No hay secciones habilitadas para este cliente</div>;
  }

  return <Navigate to={firstEnabledRoute[1]} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/confirmacion/alimentacion" element={<FeedingConfirmationPage />} />
      <Route path="/verificacion/trazabilidad/:publicId" element={<TraceabilityPublicVerifyPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DefaultFeatureRoute />} />
          <Route
            path="/dashboard"
            element={withFeature(FEATURE_KEYS.DASHBOARD_VIEW, <DashboardPage />)}
          />
          <Route path="/planta" element={withFeature(FEATURE_KEYS.PLANT_VIEW, <PlantMapPage />)} />
          <Route
            path="/planta/reportes-calidad-agua"
            element={withFeature(FEATURE_KEYS.PLANT_VIEW, <PlantMapPage mode="reportes" />)}
          />
          <Route
            path="/planta/confederaciones-hidrograficas"
            element={withFeature(FEATURE_KEYS.PLANT_VIEW, <HydroConfederationsPage />)}
          />
          <Route
            path="/planta/envio-che"
            element={withFeature(FEATURE_KEYS.PLANT_VIEW, <CheDataDeliveryPage />)}
          />
          <Route
            path="/planta/conectividad-internet"
            element={withFeature(FEATURE_KEYS.PLANT_VIEW, <ConnectivityWatchdogPage />)}
          />
          <Route
            path="/planta/muestras-laboratorio"
            element={withFeature(FEATURE_KEYS.PLANT_VIEW, <LabWaterSamplesPage />)}
          />
          <Route
            path="/planta/piscinas"
            element={withFeature(FEATURE_KEYS.PLANT_VIEW, <PondsCatalogPage />)}
          />
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
            path="/planta/caudal"
            element={withFeature(FEATURE_KEYS.PLANT_VIEW, <PlantWaterFlowPage />)}
          />
          <Route
            path="/planta/salud-sensores"
            element={withFeature(FEATURE_KEYS.PLANT_VIEW, <SensorHealthPage />)}
          />
          <Route
            path="/planta/estacion-meteorologica"
            element={withFeature(
              FEATURE_KEYS.PLANT_VIEW,
              <PlantAutomationEquipmentPage mode="estacionMeteorologica" />
            )}
          />
          <Route
            path="/planta/compuertas"
            element={withFeature(
              FEATURE_KEYS.PLANT_VIEW,
              <PlantAutomationEquipmentPage mode="compuertas" />
            )}
          />
          <Route
            path="/planta/grupo-electrogeno"
            element={withFeature(
              FEATURE_KEYS.PLANT_VIEW,
              <PlantAutomationEquipmentPage mode="grupoElectrogeno" />
            )}
          />
          <Route
            path="/planta/consumo-electrico"
            element={withFeature(
              FEATURE_KEYS.PLANT_VIEW,
              <PlantAutomationEquipmentPage mode="consumoElectrico" />
            )}
          />
          <Route
            path="/planta/generacion-solar"
            element={withFeature(
              FEATURE_KEYS.PLANT_VIEW,
              <PlantAutomationEquipmentPage mode="generacionSolar" />
            )}
          />
          <Route
            path="/planta/bombas"
            element={withFeature(
              FEATURE_KEYS.PLANT_VIEW,
              <PlantAutomationEquipmentPage mode="bombas" />
            )}
          />
          <Route
            path="/planta/quitahojas"
            element={withFeature(
              FEATURE_KEYS.PLANT_VIEW,
              <PlantAutomationEquipmentPage mode="quitahojas" />
            )}
          />
          <Route
            path="/oxigeno/economia"
            element={withFeature(FEATURE_KEYS.OXYGEN_VIEW, <OxygenPage mode="economia" />)}
          />
          <Route
            path="/oxigeno/depositos"
            element={withFeature(FEATURE_KEYS.OXYGEN_VIEW, <OxygenPage mode="depositos" />)}
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
            path="/historico/avanzada"
            element={withFeature(FEATURE_KEYS.HISTORY_VIEW, <AdvancedAnalyticsPage />)}
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
            path="/operaciones/vacunacion"
            element={withFeature(
              FEATURE_KEYS.OPERATIONS_VIEW,
              <HealthBiosecurityPage mode="vaccination" />
            )}
          />
          <Route
            path="/operaciones/medicacion"
            element={withFeature(
              FEATURE_KEYS.OPERATIONS_VIEW,
              <HealthBiosecurityPage mode="medication" />
            )}
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
