import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FEATURE_KEYS } from "../features/featureCatalog";
import "./Sidebar.css";

const SIDEBAR_AVATAR_STORAGE_PREFIX = "argosai_sidebar_avatar_v1";
const MAX_AVATAR_FILE_SIZE_BYTES = 4 * 1024 * 1024;

function slugToken(rawValue, fallback = "na") {
  const value = String(rawValue || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return value || fallback;
}

function buildAvatarStorageKey(user) {
  const tenantToken = slugToken(user?.tenant?.code || user?.tenantCode || user?.tenant?.name, "tenant");
  const userToken = slugToken(user?.email || user?.fullName || user?.id, "user");

  return `${SIDEBAR_AVATAR_STORAGE_PREFIX}:${tenantToken}:${userToken}`;
}

function clientNameLabel(user) {
  const tenantName = String(user?.tenant?.name || "").trim();

  if (tenantName) {
    return tenantName;
  }

  const tenantCode = String(user?.tenant?.code || user?.tenantCode || "").trim();
  if (tenantCode) {
    return tenantCode.toUpperCase();
  }

  return "";
}

function SidebarIcon({ children }) {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

function SidebarSubIcon({ path }) {
  const normalizedPath = String(path || "").toLowerCase();

  if (normalizedPath.includes("/compuertas")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2.5 3.5h11v3.2h-11zM2.5 9.3h11v3.2h-11z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4.4 6.7V9.3M11.6 6.7V9.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedPath.includes("/grupo-electrogeno")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2.5" y="3.2" width="11" height="9.6" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5.2 8h2.1l-1.2 2.1h2.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="11.2" cy="8.1" r="1.1" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    );
  }

  if (normalizedPath.includes("/consumo-electrico")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2.6" y="3" width="10.8" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5 10.7h1.5L5.7 12h2.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 6.2v3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedPath.includes("/generacion-solar")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="4.3" cy="4.2" r="1.3" stroke="currentColor" strokeWidth="1.1" />
        <path d="M4.3 1.7v1M4.3 5.7v1M2 4.2h1M5.6 4.2h1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <rect x="7.1" y="8" width="6.2" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.1" />
        <path d="M7.1 9.35h6.2M9.15 8v4M11.2 8v4" stroke="currentColor" strokeWidth="0.9" />
      </svg>
    );
  }

  if (normalizedPath.includes("/estacion-meteorologica")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="4.1" r="1.8" stroke="currentColor" strokeWidth="1.1" />
        <path d="M8 6v6.6M8 10.4h3.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="11.7" cy="10.4" r="1.25" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    );
  }

  if (normalizedPath.includes("/bombas")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="6.4" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9 8h4.5M11.2 5.8V10.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedPath.includes("/quitahojas")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8.2 2.8c2.4.8 3.5 2.2 3.4 4.4-.1 2.2-1.5 4.2-4.2 6-1.6-2.1-2.2-3.9-1.8-5.7.4-1.7 1.3-3.3 2.6-4.7Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M6.2 9.1c1.2-.5 2.3-1.1 3.5-1.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedPath.includes("/salud-sensores")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2.4" y="2.7" width="11.2" height="10.6" rx="1.5" stroke="currentColor" strokeWidth="1.15" />
        <path d="M3.7 8h1.7l1-1.6 1.8 3 1.1-1.7h2.9" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (normalizedPath.startsWith("/planta") || normalizedPath.includes("/caudal")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 10.5c1-.8 2-.8 3 0s2 .8 3 0 2-.8 3 0 2 .8 3 0" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        <path d="M8 3.3c1.3 1.4 1.3 2.4 0 3.5-1.3-1.1-1.3-2.1 0-3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    );
  }

  if (normalizedPath.startsWith("/oxigeno")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="6" cy="8.2" r="2.6" stroke="currentColor" strokeWidth="1.25" />
        <circle cx="10.8" cy="5.3" r="1.25" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }

  if (normalizedPath.startsWith("/consignas")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="6" cy="4" r="1.2" fill="currentColor" />
        <circle cx="10" cy="8" r="1.2" fill="currentColor" />
        <circle cx="7.2" cy="12" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  if (normalizedPath.startsWith("/avisos") || normalizedPath.startsWith("/alertas")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 3a2.2 2.2 0 0 1 2.2 2.2v1c0 .55.16 1.1.47 1.55l.42.63c.24.35-.01.82-.43.82H5.32c-.42 0-.67-.47-.43-.82l.42-.63c.31-.45.47-1 .47-1.55v-1A2.2 2.2 0 0 1 8 3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M7 11.2a1 1 0 0 0 2 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedPath.startsWith("/historico")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2.8 12.5h10.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="m3.6 10.2 2.1-2.1 2 1.3 3.2-3.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (normalizedPath.startsWith("/planificacion") || normalizedPath.startsWith("/trazabilidad") || normalizedPath.startsWith("/biomasa")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 4.5h10v8H3z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5 3v2.2M11 3v2.2M3 6.8h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (normalizedPath.startsWith("/operaciones") || normalizedPath.startsWith("/maquina")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6.4 3.2 4.8 4.8l.9 1.2-1.6 1.6-1.2-.9-1.1 1.1.9 1.2-1.1 1.1 2.2 2.2 1.1-1.1 1.2.9 1.1-1.1-.9-1.2 1.6-1.6 1.2.9 1.6-1.6Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    );
  }

  if (normalizedPath.startsWith("/boyas")) {
    return (
      <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5" r="1.7" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 6.8v2.1M2.5 11c1-.7 2-.7 3 0s2 .7 3 0 2-.7 3 0 2 .7 3 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className="sidebar-sub-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" />
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
        to: "/planta/salud-sensores",
        label: "Salud de sensores",
        group: "Supervisión en tiempo real"
      },
      {
        to: "/planta/estacion-meteorologica",
        label: "Estación meteorológica",
        group: "Supervisión en tiempo real"
      },
      {
        to: "/planta/compuertas",
        label: "Compuertas entrada/salida",
        group: "Control hidráulico"
      },
      {
        to: "/planta/bombas",
        label: "Bombas de impulsión",
        group: "Control hidráulico"
      },
      {
        to: "/planta/grupo-electrogeno",
        label: "Grupo electrógeno",
        group: "Soporte energético"
      },
      {
        to: "/planta/consumo-electrico",
        label: "Consumo eléctrico planta",
        group: "Soporte energético"
      },
      {
        to: "/planta/generacion-solar",
        label: "Generación solar",
        group: "Soporte energético"
      },
      {
        to: "/planta/quitahojas",
        label: "Quitahojas",
        group: "Limpieza y sólidos"
      },
      {
        to: "/planta/piscinas",
        label: "Configuración de piscinas",
        group: "Configuración base"
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
        to: "/oxigeno/depositos",
        label: "Depósitos O2 líquido",
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
        to: "/historico/avanzada",
        label: "Analítica avanzada",
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
        to: "/operaciones/vacunacion",
        label: "Vacunación",
        group: "Producción diaria"
      },
      {
        to: "/operaciones/medicacion",
        label: "Medicación",
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
        label: "ArgosAI Growth Nano",
        group: "Línea Growth"
      },
      {
        to: "/maquina/growth-s",
        label: "ArgosAI Growth S",
        group: "Línea Growth"
      },
      {
        to: "/maquina/growth-l",
        label: "ArgosAI Growth L",
        group: "Línea Growth"
      },
      {
        to: "/maquina/grader",
        label: "ArgosAI Grader",
        group: "Clasificación"
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
        label: "Parámetros",
        group: "Estado y seguimiento"
      },
      {
        to: "/boyas/energia-sistema",
        label: "Energía y autonomía",
        group: "Estado y seguimiento"
      },
      {
        to: "/boyas/recorrido-gps",
        label: "Recorrido GPS",
        group: "Estado y seguimiento"
      },
      {
        to: "/boyas/corrientes-heatmap",
        label: "Corrientes (heatmap)",
        group: "Análisis ambiental"
      },
      {
        to: "/boyas/rosa-vientos",
        label: "Rosa de los vientos",
        group: "Análisis ambiental"
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
  "/planta/salud-sensores": FEATURE_KEYS.PLANT_VIEW,
  "/planta/estacion-meteorologica": FEATURE_KEYS.PLANT_VIEW,
  "/planta/compuertas": FEATURE_KEYS.PLANT_VIEW,
  "/planta/grupo-electrogeno": FEATURE_KEYS.PLANT_VIEW,
  "/planta/consumo-electrico": FEATURE_KEYS.PLANT_VIEW,
  "/planta/generacion-solar": FEATURE_KEYS.PLANT_VIEW,
  "/planta/bombas": FEATURE_KEYS.PLANT_VIEW,
  "/planta/quitahojas": FEATURE_KEYS.PLANT_VIEW,
  "/planta/piscinas": FEATURE_KEYS.PLANT_VIEW,
  "/oxigeno": FEATURE_KEYS.OXYGEN_VIEW,
  "/oxigeno/electrovalvulas": FEATURE_KEYS.OXYGEN_VIEW,
  "/oxigeno/economia": FEATURE_KEYS.OXYGEN_VIEW,
  "/oxigeno/depositos": FEATURE_KEYS.OXYGEN_VIEW,
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
  "/historico/avanzada": FEATURE_KEYS.HISTORY_VIEW,
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
  "/operaciones/vacunacion": FEATURE_KEYS.OPERATIONS_VIEW,
  "/operaciones/medicacion": FEATURE_KEYS.OPERATIONS_VIEW,
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
  const clientName = clientNameLabel(user);
  const brandSubtitle = collapsed
    ? "PF"
    : clientName
      ? `Piscifactoría · ${clientName}`
      : "Piscifactoría";
  const sidebarRef = useRef(null);
  const avatarInputRef = useRef(null);
  const avatarStorageKey = useMemo(() => buildAvatarStorageKey(user), [user]);
  const [avatarDataUrl, setAvatarDataUrl] = useState(null);
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
    try {
      const storedAvatar = localStorage.getItem(avatarStorageKey);
      setAvatarDataUrl(storedAvatar || null);
    } catch {
      setAvatarDataUrl(null);
    }
  }, [avatarStorageKey]);

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

  function handleAvatarPickerOpen() {
    avatarInputRef.current?.click();
  }

  function handleAvatarFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const imageData = typeof reader.result === "string" ? reader.result : null;

      if (!imageData) {
        return;
      }

      setAvatarDataUrl(imageData);

      try {
        localStorage.setItem(avatarStorageKey, imageData);
      } catch {
        // Ignore storage failures and keep the in-memory preview.
      }
    };

    reader.readAsDataURL(file);
  }

  const sidebarClassName = `sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-mobile-open" : ""}`.trim();

  return (
    <aside className={sidebarClassName} ref={sidebarRef}>
      <div className="brand">
        <h1 className="sidebar-brand-title" aria-label="ArgosAI">
          {collapsed ? (
            "AI"
          ) : (
            <>
              <span className="sidebar-brand-mark">Argos</span>
              <span className="sidebar-brand-accent">AI</span>
            </>
          )}
        </h1>
        <p className="sidebar-brand-subtitle">{brandSubtitle}</p>
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
                          <SidebarSubIcon path={child.to} />
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
                        <SidebarSubIcon path={child.to} />
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
            <button
              type="button"
              className="sidebar-session-avatar sidebar-session-avatar-button"
              onClick={handleAvatarPickerOpen}
              aria-label={avatarDataUrl ? "Cambiar imagen de perfil" : "Subir imagen de perfil"}
              title="Cambiar imagen"
            >
              {avatarDataUrl ? (
                <img
                  className="sidebar-session-avatar-image"
                  src={avatarDataUrl}
                  alt="Imagen de perfil del cliente"
                />
              ) : (
                initials
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFileChange}
              className="sidebar-session-avatar-input"
              tabIndex={-1}
              aria-hidden="true"
            />
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
