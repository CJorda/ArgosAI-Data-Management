import { useAuth } from "../context/AuthContext";
import "./HeaderBar.css";

export function HeaderBar({
  onToggleSidebar,
  onToggleAlerts,
  alertsCount,
  isAlertsOpen,
  isMobileView,
  isSidebarOpenMobile,
  isSidebarCollapsed
}) {
  const { user } = useAuth();
  const menuLabel = isMobileView
    ? isSidebarOpenMobile
      ? "Cerrar menú"
      : "Abrir menú"
    : isSidebarCollapsed
      ? "Expandir menú"
      : "Colapsar menú";

  return (
    <header className="top-header">
      <div className="header-main">
        <button
          type="button"
          className="icon-toggle-button"
          onClick={onToggleSidebar}
          aria-label={menuLabel}
        >
          <span className="burger-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <div>
          <h2>{user?.tenant?.name || "Piscifactoría"}</h2>
          <p>Monitoreo en tiempo real y gestión operativa</p>
        </div>
      </div>

      <div className="header-actions">
        <button
          type="button"
          className={`alert-toggle-button ${isAlertsOpen ? "alert-toggle-button-active" : ""}`}
          onClick={onToggleAlerts}
          aria-label="Mostrar alertas abiertas"
        >
          <span>Alertas</span>
          <strong>{alertsCount}</strong>
        </button>
      </div>
    </header>
  );
}
