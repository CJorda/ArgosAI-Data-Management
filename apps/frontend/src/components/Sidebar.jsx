import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Sidebar.css";

function SidebarIcon({ children }) {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

const navItems = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: (
      <>
        <path d="M4 13h7v7H4zM13 4h7v7h-7zM4 4h7v7H4zM13 13h7v7h-7z" stroke="currentColor" strokeWidth="1.7" />
      </>
    )
  },
  {
    to: "/planta",
    label: "Planta SCADA",
    icon: (
      <>
        <path d="M4 18.5V8l8-4 8 4v10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 18.5V12h8v6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    )
  },
  {
    to: "/oxigeno",
    label: "Oxígeno",
    icon: (
      <>
        <path
          d="M12 3.7s5.1 5.5 5.1 9.2A5.1 5.1 0 1 1 6.9 12.9C6.9 9.2 12 3.7 12 3.7z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    children: [
      {
        to: "/oxigeno/electrovalvulas",
        label: "Electroválvulas"
      },
      {
        to: "/oxigeno/economia",
        label: "Economía oxígeno"
      }
    ]
  },
  {
    to: "/consignas",
    label: "Consignas PLC",
    icon: (
      <>
        <path d="M6 6h12M6 12h12M6 18h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="9" cy="6" r="1.7" fill="currentColor" />
        <circle cx="15" cy="12" r="1.7" fill="currentColor" />
        <circle cx="11" cy="18" r="1.7" fill="currentColor" />
      </>
    ),
    children: [
      {
        to: "/consignas/oxigeno",
        label: "Oxígeno color"
      },
      {
        to: "/consignas/temperatura",
        label: "Temperatura color"
      }
    ]
  },
  {
    to: "/avisos",
    label: "Avisos telefónicos",
    icon: (
      <>
        <path d="M7.4 4.8h3.2v3.4H7.4zM13.4 4.8h3.2v3.4h-3.2zM7.4 10.3h3.2v3.4H7.4zM13.4 10.3h3.2v3.4h-3.2z" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8.7 17.6c2.2 1.7 4.4 1.7 6.6 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
    children: [
      {
        to: "/avisos/consignas-telefonicas",
        label: "Consignas telefónicas"
      },
      {
        to: "/avisos/consignas-sms",
        label: "Consignas SMS"
      }
    ]
  },
  {
    to: "/maquina",
    label: "Máquina ArgosAI",
    icon: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 9h8M8 12h4M8 15h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
    children: [
      {
        to: "/maquina/growth-nano",
        label: "ArgosAI Growth Nano"
      },
      {
        to: "/maquina/growth-s",
        label: "ArgosAI Growth S"
      },
      {
        to: "/maquina/growth-l",
        label: "ArgosAI Growth L"
      },
      {
        to: "/maquina/grader",
        label: "ArgosAI Grader"
      }
    ]
  },
  {
    to: "/historico",
    label: "Históricos",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 8v4.1l2.8 1.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
    children: [
      {
        to: "/historico/piscina",
        label: "Analítica por piscina"
      },
      {
        to: "/historico/parametros",
        label: "Analítica por parámetros"
      },
      {
        to: "/historico/xy",
        label: "Relación calidad X-Y"
      },
      {
        to: "/historico/heatmap",
        label: "Heatmap mensual"
      }
    ]
  },
  {
    to: "/alertas",
    label: "Alertas",
    icon: (
      <>
        <path d="M12 4a4.4 4.4 0 0 0-4.4 4.4v2.1c0 .9-.3 1.8-.9 2.4L5.8 14h12.4l-.9-1.1a3.6 3.6 0 0 1-.9-2.4V8.4A4.4 4.4 0 0 0 12 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M10 17.2a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
    children: [
      {
        to: "/alertas/prediccion-riesgo",
        label: "Prediccion de riesgo 24-72h"
      },
      {
        to: "/alertas/alertas",
        label: "Alertas"
      }
    ]
  },
  {
    to: "/operaciones",
    label: "Operaciones",
    icon: (
      <>
        <path d="M14 4l6 6-3 3-6-6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M11 7 5 13l-1.8 5.2L8.4 17 14 11" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </>
    ),
    children: [
      {
        to: "/planificacion",
        label: "Planificación"
      },
      {
        to: "/trazabilidad",
        label: "Trazabilidad"
      },
      {
        to: "/operaciones/hatchery-larval",
        label: "Hatchery / Larval"
      },
      {
        to: "/operaciones/consolidacion-multi-sitio",
        label: "Consolidación multi-sitio"
      },
      {
        to: "/operaciones/prevision-12-36",
        label: "Previsión 12-36 meses"
      },
      {
        to: "/operaciones/mantenimiento-preventivo",
        label: "Mantenimiento preventivo"
      },
      {
        to: "/operaciones/inventario-operativo",
        label: "Inventario operativo"
      },
      {
        to: "/operaciones/sanidad-bioseguridad",
        label: "Sanidad y bioseguridad"
      },
      {
        to: "/operaciones/transporte-vivo",
        label: "Transporte de Peces Vivo"
      },
      {
        to: "/operaciones/cosecha-logistica",
        label: "Cosecha y logística"
      },
      {
        to: "/operaciones/coste-margen",
        label: "Coste y margen"
      },
      {
        to: "/operaciones/auditoria-compliance",
        label: "Auditoría y compliance"
      },
      {
        to: "/operaciones/alimentacion",
        label: "Alimentación"
      },
      {
        to: "/operaciones/transferencia",
        label: "Transferencia"
      },
      {
        to: "/operaciones/tratamiento",
        label: "Tratamiento"
      },
      {
        to: "/operaciones/vaciado-limpieza",
        label: "Vaciado y limpieza"
      }
    ]
  },
  {
    to: "/biomasa",
    label: "Biomasa",
    icon: (
      <>
        <path d="M6 18V9M12 18V6M18 18v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M4.5 18h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
    children: [
      {
        to: "/biomasa/resumen",
        label: "Resumen biomasa"
      },
      {
        to: "/biomasa/historial",
        label: "Historial biomasa"
      },
      {
        to: "/biomasa/densidad-peces",
        label: "Densidad de peces"
      }
    ]
  }
];

function isPathInGroup(item, pathname) {
  if (!item?.children) {
    return false;
  }

  if (pathname.startsWith(item.to)) {
    return true;
  }

  return item.children.some(
    (child) => pathname === child.to || pathname.startsWith(`${child.to}/`)
  );
}

function buildExpandedGroups(pathname) {
  const expanded = navItems.reduce((acc, item) => {
    if (item.children) {
      acc[item.to] = false;
    }
    return acc;
  }, {});

  const matchingGroup = navItems.find((item) => isPathInGroup(item, pathname));
  if (matchingGroup) {
    expanded[matchingGroup.to] = true;
  }

  return expanded;
}

function buildSingleExpandedState(groupToOpen) {
  return navItems.reduce((acc, item) => {
    if (item.children) {
      acc[item.to] = item.to === groupToOpen;
    }

    return acc;
  }, {});
}

function userInitials(fullName) {
  const raw = String(fullName || "").trim();

  if (!raw) {
    return "AD";
  }

  return raw
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function Sidebar({ collapsed, mobileOpen, onNavigate }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const initials = userInitials(user?.fullName);
  const sidebarRef = useRef(null);
  const [expandedGroups, setExpandedGroups] = useState(() =>
    buildExpandedGroups(location.pathname)
  );

  useEffect(() => {
    if (collapsed) {
      return;
    }

    const matchingGroup = navItems.find((item) => isPathInGroup(item, location.pathname));

    if (!matchingGroup) {
      return;
    }

    setExpandedGroups((current) => {
      const next = buildSingleExpandedState(matchingGroup.to);
      const isEqual = Object.keys(next).every((key) => Boolean(current[key]) === Boolean(next[key]));

      if (isEqual) {
        return current;
      }

      return next;
    });
  }, [collapsed, location.pathname]);

  useEffect(() => {
    if (!collapsed) {
      return;
    }

    function handleOutsideClick(event) {
      if (sidebarRef.current?.contains(event.target)) {
        return;
      }

      setExpandedGroups(buildSingleExpandedState(null));
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [collapsed]);

  const sidebarClassName = `sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-mobile-open" : ""}`.trim();

  return (
    <aside className={sidebarClassName} ref={sidebarRef}>
      <div className="brand">
        <h1>{collapsed ? "AI" : "ArgosAI"}</h1>
        <p>{collapsed ? "PF" : "Piscifactoría"}</p>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isGroupRouteActive = isPathInGroup(item, location.pathname);
          const isGroupExpanded = Boolean(expandedGroups[item.to]);
          const flyoutId = `sidebar-flyout-${item.to.replace(/[^a-z0-9]+/gi, "-")}`;

          if (!item.children) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  isActive || isGroupRouteActive
                    ? "sidebar-link sidebar-link-active"
                    : "sidebar-link"
                }
              >
                <SidebarIcon>{item.icon}</SidebarIcon>
                <span className="sidebar-link-text">{item.label}</span>
              </NavLink>
            );
          }

          if (collapsed) {
            return (
              <div key={item.to} className="sidebar-group sidebar-group-collapsed">
                <button
                  type="button"
                  className={`sidebar-link sidebar-link-button ${isGroupRouteActive ? "sidebar-link-active" : ""}`.trim()}
                  onClick={() => {
                    setExpandedGroups(buildSingleExpandedState(isGroupExpanded ? null : item.to));
                  }}
                  aria-expanded={isGroupExpanded}
                  aria-controls={flyoutId}
                >
                  <SidebarIcon>{item.icon}</SidebarIcon>
                  <span className="sidebar-link-text">{item.label}</span>
                </button>

                <div
                  id={flyoutId}
                  className={`sidebar-subnav sidebar-subnav-flyout ${isGroupExpanded ? "" : "sidebar-subnav-collapsed"}`.trim()}
                  aria-label={`Subsecciones de ${item.label.toLowerCase()}`}
                >
                  <div className="sidebar-subnav-flyout-title">{item.label}</div>
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      onClick={() => {
                        setExpandedGroups(buildSingleExpandedState(null));
                        onNavigate?.();
                      }}
                      className={({ isActive }) =>
                        isActive ? "sidebar-sub-link sidebar-sub-link-active" : "sidebar-sub-link"
                      }
                    >
                      <span className="sidebar-sub-link-dot" aria-hidden="true" />
                      <span className="sidebar-sub-link-text">{child.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div key={item.to} className="sidebar-group">
              <NavLink
                to={item.to}
                onClick={(event) => {
                  event.preventDefault();

                  if (isGroupExpanded) {
                    setExpandedGroups(buildSingleExpandedState(null));
                    return;
                  }

                  setExpandedGroups(buildSingleExpandedState(item.to));
                }}
                className={({ isActive }) =>
                  isActive || isGroupRouteActive
                    ? "sidebar-link sidebar-link-active"
                    : "sidebar-link"
                }
              >
                <SidebarIcon>{item.icon}</SidebarIcon>
                <span className="sidebar-link-text">{item.label}</span>
                <span
                  className={`sidebar-group-caret ${isGroupExpanded ? "sidebar-group-caret-open" : ""}`.trim()}
                  aria-hidden="true"
                />
              </NavLink>

              <div
                className={`sidebar-subnav ${isGroupExpanded ? "" : "sidebar-subnav-collapsed"}`.trim()}
                aria-label={`Subsecciones de ${item.label.toLowerCase()}`}
              >
                {item.children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      isActive ? "sidebar-sub-link sidebar-sub-link-active" : "sidebar-sub-link"
                    }
                  >
                    <span className="sidebar-sub-link-dot" aria-hidden="true" />
                    <span className="sidebar-sub-link-text">{child.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-session-card" aria-label="Sesión del cliente">
          <div className="sidebar-session-head">
            <div className="sidebar-session-avatar" aria-hidden="true">
              {initials}
            </div>
            <div className="sidebar-session-info">
              <strong className="sidebar-session-name">{user?.fullName || "Cliente"}</strong>
              <button
                type="button"
                className="sidebar-session-exit"
                onClick={async () => {
                  await logout();
                  onNavigate?.();
                }}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
