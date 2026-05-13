import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FEATURE_KEYS } from "../features/featureCatalog";
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
    to: "/proyecto/piscifactoria",
    label: "Automatización Piscifactoría",
    icon: (
      <>
        <path d="M4 18.5V8l8-4 8 4v10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 18.5V12h8v6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    children: [
      {
        to: "/planta",
        label: "Planta SCADA",
        group: "Supervisión en tiempo real"
      },
      {
        to: "/planta/caudal",
        label: "Caudal entrante/saliente",
        group: "Supervisión en tiempo real"
      },
      {
        to: "/oxigeno/electrovalvulas",
        label: "Electroválvulas",
        group: "Supervisión en tiempo real"
      },
      {
        to: "/oxigeno/economia",
        label: "Economía oxígeno",
        group: "Supervisión en tiempo real"
      },
      {
        to: "/consignas/oxigeno",
        label: "Consigna oxígeno",
        group: "Supervisión en tiempo real"
      },
      {
        to: "/consignas/temperatura",
        label: "Consigna temperatura",
        group: "Supervisión en tiempo real"
      },
      {
        to: "/avisos/consignas-telefonicas",
        label: "Consignas telefónicas",
        group: "Alertas y avisos"
      },
      {
        to: "/avisos/consignas-sms",
        label: "Consignas SMS",
        group: "Alertas y avisos"
      },
      {
        to: "/alertas/alertas",
        label: "Alertas operativas",
        group: "Alertas y avisos"
      },
      {
        to: "/alertas/prediccion-riesgo",
        label: "Predicción riesgo 24-72h",
        group: "Alertas y avisos"
      },
      {
        to: "/historico/piscina",
        label: "Analítica por piscina",
        group: "Analítica histórica"
      },
      {
        to: "/historico/parametros",
        label: "Analítica por parámetros",
        group: "Analítica histórica"
      },
      {
        to: "/historico/xy",
        label: "Relación calidad X-Y",
        group: "Analítica histórica"
      },
      {
        to: "/historico/heatmap",
        label: "Heatmap mensual",
        group: "Analítica histórica"
      },
      {
        to: "/planificacion",
        label: "Planificación",
        group: "Planificación y biomasa"
      },
      {
        to: "/trazabilidad",
        label: "Trazabilidad",
        group: "Planificación y biomasa"
      },
      {
        to: "/biomasa/resumen",
        label: "Resumen biomasa",
        group: "Planificación y biomasa"
      },
      {
        to: "/biomasa/historial",
        label: "Historial biomasa",
        group: "Planificación y biomasa"
      },
      {
        to: "/biomasa/densidad-peces",
        label: "Densidad de peces",
        group: "Planificación y biomasa"
      },
      {
        to: "/operaciones/alimentacion",
        label: "Alimentación",
        group: "Producción diaria"
      },
      {
        to: "/operaciones/sanidad-bioseguridad",
        label: "Sanidad y bioseguridad",
        group: "Producción diaria"
      },
      {
        to: "/operaciones/tratamiento",
        label: "Tratamiento",
        group: "Producción diaria"
      },
      {
        to: "/operaciones/mantenimiento-preventivo",
        label: "Mantenimiento preventivo",
        group: "Soporte técnico"
      },
      {
        to: "/operaciones/inventario-operativo",
        label: "Inventario operativo",
        group: "Soporte técnico"
      },
      {
        to: "/operaciones/transferencia",
        label: "Transferencia",
        group: "Logística y cierre"
      },
      {
        to: "/operaciones/transporte-vivo",
        label: "Transporte de peces vivo",
        group: "Logística y cierre"
      },
      {
        to: "/operaciones/cosecha-logistica",
        label: "Cosecha y logística",
        group: "Logística y cierre"
      },
      {
        to: "/operaciones/vaciado-limpieza",
        label: "Vaciado y limpieza",
        group: "Logística y cierre"
      },
      {
        to: "/operaciones/auditoria-compliance",
        label: "Auditoría y compliance",
        group: "Gestión y cumplimiento"
      },
      {
        to: "/operaciones/coste-margen",
        label: "Coste y margen",
        group: "Gestión y cumplimiento"
      },
      {
        to: "/operaciones/prevision-12-36",
        label: "Previsión 12-36 meses",
        group: "Escalado y expansión"
      },
      {
        to: "/operaciones/hatchery-larval",
        label: "Hatchery / Larval",
        group: "Escalado y expansión"
      },
      {
        to: "/operaciones/consolidacion-multi-sitio",
        label: "Consolidación multi-sitio",
        group: "Escalado y expansión"
      }
    ]
  },
  {
    to: "/proyecto/argosai",
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
    to: "/proyecto/boyas",
    label: "Boyas Oceanográficas",
    icon: (
      <>
        <circle cx="12" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 9.3v4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path
          d="M3.8 16.2c1.6-1.2 3.2-1.2 4.8 0 1.6 1.2 3.2 1.2 4.8 0 1.6-1.2 3.2-1.2 4.8 0"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </>
    ),
    children: [
      {
        to: "/boyas/parametros",
        label: "Parámetros"
      },
      {
        to: "/boyas/energia-sistema",
        label: "Energía y autonomía"
      },
      {
        to: "/boyas/recorrido-gps",
        label: "Recorrido GPS"
      },
      {
        to: "/boyas/corrientes-heatmap",
        label: "Corrientes (heatmap)"
      },
      {
        to: "/boyas/rosa-vientos",
        label: "Rosa de los vientos"
      }
    ]
  }
];

const featureByPath = {
  "/dashboard": FEATURE_KEYS.DASHBOARD_VIEW,
  "/proyecto/piscifactoria": FEATURE_KEYS.PLANT_VIEW,
  "/proyecto/argosai": FEATURE_KEYS.MACHINE_VIEW,
  "/proyecto/boyas": FEATURE_KEYS.BUOYS_VIEW,
  "/planta": FEATURE_KEYS.PLANT_VIEW,
  "/planta/caudal": FEATURE_KEYS.PLANT_VIEW,
  "/oxigeno": FEATURE_KEYS.OXYGEN_VIEW,
  "/oxigeno/electrovalvulas": FEATURE_KEYS.OXYGEN_VIEW,
  "/oxigeno/economia": FEATURE_KEYS.OXYGEN_VIEW,
  "/consignas": FEATURE_KEYS.SETPOINTS_VIEW,
  "/consignas/oxigeno": FEATURE_KEYS.SETPOINTS_VIEW,
  "/consignas/temperatura": FEATURE_KEYS.SETPOINTS_VIEW,
  "/avisos": FEATURE_KEYS.SETPOINTS_VIEW,
  "/avisos/consignas-telefonicas": FEATURE_KEYS.SETPOINTS_VIEW,
  "/avisos/consignas-sms": FEATURE_KEYS.SETPOINTS_VIEW,
  "/maquina": FEATURE_KEYS.MACHINE_VIEW,
  "/maquina/growth-nano": FEATURE_KEYS.MACHINE_VIEW,
  "/maquina/growth-s": FEATURE_KEYS.MACHINE_VIEW,
  "/maquina/growth-l": FEATURE_KEYS.MACHINE_VIEW,
  "/maquina/grader": FEATURE_KEYS.MACHINE_VIEW,
  "/historico": FEATURE_KEYS.HISTORY_VIEW,
  "/historico/piscina": FEATURE_KEYS.HISTORY_VIEW,
  "/historico/parametros": FEATURE_KEYS.HISTORY_VIEW,
  "/historico/xy": FEATURE_KEYS.HISTORY_VIEW,
  "/historico/heatmap": FEATURE_KEYS.HISTORY_VIEW,
  "/alertas": FEATURE_KEYS.ALERTS_VIEW,
  "/alertas/prediccion-riesgo": FEATURE_KEYS.ALERTS_VIEW,
  "/alertas/alertas": FEATURE_KEYS.ALERTS_VIEW,
  "/operaciones": FEATURE_KEYS.OPERATIONS_VIEW,
  "/planificacion": FEATURE_KEYS.PLANNING_VIEW,
  "/trazabilidad": FEATURE_KEYS.TRACEABILITY_VIEW,
  "/operaciones/hatchery-larval": FEATURE_KEYS.HATCHERY_VIEW,
  "/operaciones/consolidacion-multi-sitio": FEATURE_KEYS.CONSOLIDATION_VIEW,
  "/operaciones/prevision-12-36": FEATURE_KEYS.PLANNING_VIEW,
  "/operaciones/mantenimiento-preventivo": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/inventario-operativo": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/sanidad-bioseguridad": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/transporte-vivo": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/cosecha-logistica": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/coste-margen": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/auditoria-compliance": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/alimentacion": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/transferencia": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/tratamiento": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/vaciado-limpieza": FEATURE_KEYS.OPERATIONS_VIEW,
  "/biomasa": FEATURE_KEYS.BIOMASS_VIEW,
  "/biomasa/resumen": FEATURE_KEYS.BIOMASS_VIEW,
  "/biomasa/historial": FEATURE_KEYS.BIOMASS_VIEW,
  "/biomasa/densidad-peces": FEATURE_KEYS.BIOMASS_VIEW,
  "/boyas": FEATURE_KEYS.BUOYS_VIEW,
  "/boyas/parametros": FEATURE_KEYS.BUOYS_VIEW,
  "/boyas/energia-sistema": FEATURE_KEYS.BUOYS_VIEW,
  "/boyas/recorrido-gps": FEATURE_KEYS.BUOYS_VIEW,
  "/boyas/corrientes-heatmap": FEATURE_KEYS.BUOYS_VIEW,
  "/boyas/rosa-vientos": FEATURE_KEYS.BUOYS_VIEW,
  "/camara": FEATURE_KEYS.CAMERA_VIEW
};

function featureForPath(pathname) {
  return featureByPath[pathname] || null;
}

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

function buildExpandedGroups(items, pathname) {
  const expanded = items.reduce((acc, item) => {
    if (item.children) {
      acc[item.to] = false;
    }
    return acc;
  }, {});

  const matchingGroup = items.find((item) => isPathInGroup(item, pathname));
  if (matchingGroup) {
    expanded[matchingGroup.to] = true;
  }

  return expanded;
}

function buildSingleExpandedState(items, groupToOpen) {
  return items.reduce((acc, item) => {
    if (item.children) {
      acc[item.to] = item.to === groupToOpen;
    }

    return acc;
  }, {});
}

function groupChildrenBySection(children) {
  const orderedGroups = [];
  const groupsByName = new Map();

  for (const child of children || []) {
    const sectionName = String(child.group || "").trim();
    const groupKey = sectionName || "_default";

    if (!groupsByName.has(groupKey)) {
      const groupEntry = {
        key: groupKey,
        title: sectionName,
        children: []
      };

      groupsByName.set(groupKey, groupEntry);
      orderedGroups.push(groupEntry);
    }

    groupsByName.get(groupKey).children.push(child);
  }

  return orderedGroups;
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
  const { user, logout, hasFeature } = useAuth();
  const initials = userInitials(user?.fullName);
  const sidebarRef = useRef(null);
  const visibleNavItems = useMemo(() => {
    return navItems.reduce((acc, item) => {
      if (!item.children) {
        if (hasFeature(featureForPath(item.to))) {
          acc.push(item);
        }
        return acc;
      }

      const parentFeature = featureForPath(item.to);
      const visibleChildren = item.children.filter((child) => {
        const childFeature = featureForPath(child.to) || parentFeature;
        return hasFeature(childFeature);
      });

      if (visibleChildren.length === 0 && !hasFeature(parentFeature)) {
        return acc;
      }

      acc.push({
        ...item,
        children: visibleChildren
      });

      return acc;
    }, []);
  }, [hasFeature]);
  const [expandedGroups, setExpandedGroups] = useState(() =>
    collapsed
      ? buildSingleExpandedState(visibleNavItems, null)
      : buildExpandedGroups(visibleNavItems, location.pathname)
  );

  useEffect(() => {
    setExpandedGroups((current) => {
      const next = collapsed
        ? buildSingleExpandedState(visibleNavItems, null)
        : buildExpandedGroups(visibleNavItems, location.pathname);
      const keys = Object.keys(next);
      const sameKeys =
        keys.length === Object.keys(current).length &&
        keys.every((key) => Object.prototype.hasOwnProperty.call(current, key));

      if (!sameKeys) {
        return next;
      }

      const isEqual = keys.every((key) => Boolean(current[key]) === Boolean(next[key]));
      return isEqual ? current : next;
    });
  }, [visibleNavItems, location.pathname, collapsed]);

  useEffect(() => {
    if (collapsed) {
      return;
    }

    const matchingGroup = visibleNavItems.find((item) => isPathInGroup(item, location.pathname));

    if (!matchingGroup) {
      return;
    }

    setExpandedGroups((current) => {
      const next = buildSingleExpandedState(visibleNavItems, matchingGroup.to);
      const isEqual = Object.keys(next).every((key) => Boolean(current[key]) === Boolean(next[key]));

      if (isEqual) {
        return current;
      }

      return next;
    });
  }, [collapsed, location.pathname, visibleNavItems]);

  useEffect(() => {
    if (!collapsed) {
      return;
    }

    function handleOutsideClick(event) {
      if (sidebarRef.current?.contains(event.target)) {
        return;
      }

      setExpandedGroups(buildSingleExpandedState(visibleNavItems, null));
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [collapsed, visibleNavItems]);

  const sidebarClassName = `sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-mobile-open" : ""}`.trim();

  return (
    <aside className={sidebarClassName} ref={sidebarRef}>
      <div className="brand">
        <h1>{collapsed ? "AI" : "ArgosAI"}</h1>
        <p>{collapsed ? "PF" : "Piscifactoría"}</p>
      </div>

      <nav className="sidebar-nav">
        {visibleNavItems.map((item) => {
          const isGroupRouteActive = isPathInGroup(item, location.pathname);
          const isGroupExpanded = Boolean(expandedGroups[item.to]);
          const flyoutId = `sidebar-flyout-${item.to.replace(/[^a-z0-9]+/gi, "-")}`;
          const groupedChildren = item.children ? groupChildrenBySection(item.children) : [];

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
                    setExpandedGroups((current) => {
                      const isCurrentlyExpanded = Boolean(current[item.to]);
                      return buildSingleExpandedState(
                        visibleNavItems,
                        isCurrentlyExpanded ? null : item.to
                      );
                    });
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
                  {groupedChildren.map((group) => (
                    <div key={`${item.to}-${group.key}`} className="sidebar-subgroup">
                      {group.title ? <div className="sidebar-subgroup-title">{group.title}</div> : null}
                      {group.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          onClick={() => {
                            setExpandedGroups(buildSingleExpandedState(visibleNavItems, null));
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
                  setExpandedGroups((current) => {
                    const isCurrentlyExpanded = Boolean(current[item.to]);
                    return buildSingleExpandedState(
                      visibleNavItems,
                      isCurrentlyExpanded ? null : item.to
                    );
                  });
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
                {groupedChildren.map((group) => (
                  <div key={`${item.to}-${group.key}`} className="sidebar-subgroup">
                    {group.title ? <div className="sidebar-subgroup-title">{group.title}</div> : null}
                    {group.children.map((child) => (
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
