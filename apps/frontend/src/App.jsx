import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AlertsPage } from "./pages/AlertsPage";
import { ArgosMachinePage } from "./pages/ArgosMachinePage";
import { BiomassPage } from "./pages/BiomassPage";
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/planta" element={<PlantMapPage />} />
          <Route path="/oxigeno" element={<Navigate to="/oxigeno/electrovalvulas" replace />} />
          <Route path="/oxigeno/electrovalvulas" element={<OxygenPage mode="electrovalvulas" />} />
          <Route path="/oxigeno/economia" element={<OxygenPage mode="economia" />} />
          <Route path="/consignas" element={<Navigate to="/consignas/oxigeno" replace />} />
          <Route path="/consignas/oxigeno" element={<OxygenColorSetpointsPage />} />
          <Route path="/consignas/temperatura" element={<TemperatureColorSetpointsPage />} />
          <Route path="/avisos" element={<Navigate to="/avisos/consignas-telefonicas" replace />} />
          <Route path="/avisos/consignas-telefonicas" element={<PhoneAlertSetpointsPage />} />
          <Route path="/avisos/consignas-sms" element={<SmsAlertSetpointsPage />} />
          <Route path="/maquina" element={<Navigate to="/maquina/growth-nano" replace />} />
          <Route path="/maquina/:machineKey" element={<ArgosMachinePage />} />
          <Route path="/historico" element={<Navigate to="/historico/piscina" replace />} />
          <Route path="/historico/piscina" element={<HistoryPage />} />
          <Route path="/historico/parametros" element={<HistoryPage />} />
          <Route path="/historico/xy" element={<HistoryPage />} />
          <Route path="/historico/heatmap" element={<HistoryPage />} />
          <Route path="/planificacion" element={<PlanningPage />} />
          <Route path="/trazabilidad" element={<TraceabilityPage />} />
          <Route path="/alertas" element={<Navigate to="/alertas/alertas" replace />} />
          <Route path="/alertas/alertas" element={<AlertsPage />} />
          <Route path="/alertas/prediccion-riesgo" element={<AlertsPage />} />
          <Route path="/operaciones" element={<Navigate to="/operaciones/alimentacion" replace />} />
          <Route path="/operaciones/hatchery-larval" element={<HatcheryLarvalPage />} />
          <Route path="/operaciones/consolidacion-multi-sitio" element={<ConsolidationPage />} />
          <Route path="/operaciones/prevision-12-36" element={<StrategicForecastPage />} />
          <Route path="/operaciones/mantenimiento-preventivo" element={<PreventiveMaintenancePage />} />
          <Route path="/operaciones/inventario-operativo" element={<InventoryPage />} />
          <Route path="/operaciones/sanidad-bioseguridad" element={<HealthBiosecurityPage />} />
          <Route path="/operaciones/cosecha-logistica" element={<HarvestLogisticsPage />} />
          <Route path="/operaciones/coste-margen" element={<CostMarginPage />} />
          <Route path="/operaciones/auditoria-compliance" element={<CompliancePage />} />
          <Route path="/operaciones/:section" element={<OperationsPage />} />
          <Route path="/biomasa" element={<Navigate to="/biomasa/resumen" replace />} />
          <Route path="/biomasa/:section" element={<BiomassPage />} />
          <Route path="/camara" element={<CameraPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
