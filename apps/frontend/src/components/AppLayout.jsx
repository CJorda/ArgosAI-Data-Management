import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { io } from "socket.io-client";
import { alertsRequest } from "../api/services";
import { useAuth } from "../context/AuthContext";
import { FEATURE_KEYS } from "../features/featureCatalog";
import { useRealtimeStore } from "../store/realtimeStore";
import { AlertsPanel } from "./AlertsPanel";
import { HeaderBar } from "./HeaderBar";
import { Sidebar } from "./Sidebar";
import "./AppLayout.css";

const socketBaseUrl = (import.meta.env.VITE_API_URL || "http://localhost:3001/api").replace(/\/api\/?$/, "");

export function AppLayout() {
  const { accessToken, hasFeature } = useAuth();
  const canUseAlerts = hasFeature(FEATURE_KEYS.ALERTS_VIEW);
  const openAlerts = useRealtimeStore((state) => state.openAlerts);
  const setOpenAlerts = useRealtimeStore((state) => state.setOpenAlerts);
  const pushReading = useRealtimeStore((state) => state.pushReading);
  const addAlert = useRealtimeStore((state) => state.addAlert);
  const updateAlert = useRealtimeStore((state) => state.updateAlert);
  const resolveAlert = useRealtimeStore((state) => state.resolveAlert);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);

  const alertsQuery = useQuery({
    queryKey: ["alerts", "open"],
    queryFn: () => alertsRequest(accessToken, "open"),
    enabled: Boolean(accessToken && canUseAlerts),
    refetchInterval: 20000
  });

  useEffect(() => {
    if (!canUseAlerts) {
      setOpenAlerts([]);
      return;
    }

    if (alertsQuery.data) {
      setOpenAlerts(alertsQuery.data);
    }
  }, [alertsQuery.data, canUseAlerts, setOpenAlerts]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");

    const syncView = () => {
      const mobile = mediaQuery.matches;
      setIsMobileView(mobile);

      if (!mobile) {
        setIsSidebarOpenMobile(false);
      }
    };

    syncView();
    mediaQuery.addEventListener("change", syncView);

    return () => {
      mediaQuery.removeEventListener("change", syncView);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const socket = io(socketBaseUrl, {
      auth: {
        token: accessToken
      },
      transports: ["websocket"]
    });

    socket.on("reading:new", (payload) => {
      pushReading(payload);
    });

    if (canUseAlerts) {
      socket.on("alert:new", (payload) => {
        addAlert(payload);
      });

      socket.on("alert:updated", (payload) => {
        updateAlert(payload);
      });

      socket.on("alert:resolved", (payload) => {
        resolveAlert(payload.id);
      });
    }

    return () => {
      socket.disconnect();
    };
  }, [accessToken, canUseAlerts, pushReading, addAlert, updateAlert, resolveAlert]);

  const handleSidebarToggle = () => {
    if (isMobileView) {
      setIsSidebarOpenMobile((previous) => !previous);
      return;
    }

    setIsSidebarCollapsed((previous) => !previous);
  };

  const handleSidebarNavigate = () => {
    if (isMobileView) {
      setIsSidebarOpenMobile(false);
    }
  };

  const handleAlertsToggle = () => {
    if (!canUseAlerts) {
      return;
    }

    setIsAlertsOpen((previous) => !previous);
  };

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell-sidebar-collapsed" : ""}`}>
      <Sidebar
        collapsed={!isMobileView && isSidebarCollapsed}
        mobileOpen={isSidebarOpenMobile}
        onNavigate={handleSidebarNavigate}
      />

      {isSidebarOpenMobile ? (
        <button
          type="button"
          className="layout-backdrop"
          onClick={() => setIsSidebarOpenMobile(false)}
          aria-label="Cerrar menú lateral"
        />
      ) : null}

      <div className="center-area">
        <HeaderBar
          onToggleSidebar={handleSidebarToggle}
          onToggleAlerts={handleAlertsToggle}
          alertsCount={openAlerts.length}
          isAlertsOpen={isAlertsOpen}
          isMobileView={isMobileView}
          isSidebarOpenMobile={isSidebarOpenMobile}
          isSidebarCollapsed={!isMobileView && isSidebarCollapsed}
        />
        <main className="page-content">
          <Outlet />
        </main>
      </div>

      {canUseAlerts && isAlertsOpen ? (
        <button
          type="button"
          className="alerts-backdrop"
          onClick={() => setIsAlertsOpen(false)}
          aria-label="Cerrar panel de alertas"
        />
      ) : null}

      {canUseAlerts ? <AlertsPanel isOpen={isAlertsOpen} onClose={() => setIsAlertsOpen(false)} /> : null}
    </div>
  );
}
