const protocolTemplateByType = {
  oxygen: [
    {
      id: "verify-sensor",
      title: "Verificar lectura del sensor",
      description: "Confirmar calibracion, estado del sensor y ultima tendencia de oxigeno."
    },
    {
      id: "activate-aeration",
      title: "Ajustar aireacion",
      description: "Incrementar aireacion o flujo de oxigeno en la piscina afectada."
    },
    {
      id: "field-inspection",
      title: "Inspeccion de campo",
      description: "Revisar comportamiento de peces, caudal y posibles obstrucciones."
    }
  ],
  temperature: [
    {
      id: "verify-sensor",
      title: "Verificar lectura del sensor",
      description: "Comprobar calibracion y coherencia con sensor de respaldo."
    },
    {
      id: "adjust-water-flow",
      title: "Ajustar recambio de agua",
      description: "Modificar recambio o mezcla para estabilizar temperatura."
    },
    {
      id: "review-feeding-plan",
      title: "Revisar plan de alimentacion",
      description: "Reducir o escalonar alimentacion si existe estres termico."
    }
  ],
  ph: [
    {
      id: "verify-sensor",
      title: "Verificar lectura del sensor",
      description: "Confirmar calibracion de pH y consistencia historica."
    },
    {
      id: "check-alkalinity",
      title: "Revisar alcalinidad y buffers",
      description: "Verificar dosificacion y condiciones del sistema de ajuste de pH."
    },
    {
      id: "sample-manual",
      title: "Tomar muestra manual",
      description: "Realizar medicion manual y registrar diferencia con lectura automatica."
    }
  ],
  salinity: [
    {
      id: "verify-sensor",
      title: "Verificar lectura del sensor",
      description: "Comprobar conductividad/salinidad y estado del sensor."
    },
    {
      id: "check-mixture",
      title: "Revisar mezcla y recambio",
      description: "Ajustar mezcla de agua para recuperar rango operativo."
    },
    {
      id: "inspect-inlets",
      title: "Inspeccionar entradas y fugas",
      description: "Validar entradas de agua y posibles fugas o desbalances."
    }
  ],
  turbidity: [
    {
      id: "verify-sensor",
      title: "Verificar lectura del sensor",
      description: "Confirmar ensuciamiento del sensor y necesidad de limpieza."
    },
    {
      id: "check-filtration",
      title: "Revisar filtracion",
      description: "Inspeccionar filtros, retrolavado y eficiencia del tratamiento."
    },
    {
      id: "reduce-disturbance",
      title: "Reducir disturbio en piscina",
      description: "Limitar maniobras y ajustar operaciones que incrementen particulas."
    }
  ],
  default: [
    {
      id: "verify-alert",
      title: "Validar alerta",
      description: "Confirmar lectura, contexto operativo y severidad reportada."
    },
    {
      id: "apply-containment",
      title: "Aplicar accion de contencion",
      description: "Ejecutar medida temporal para estabilizar la operacion."
    },
    {
      id: "log-result",
      title: "Registrar resultado",
      description: "Documentar accion, responsable y resultado observado."
    }
  ]
};

const severityActionByLevel = {
  low: {
    id: "follow-up-window",
    title: "Seguimiento en ventana estandar",
    description: "Revisar evolucion en 60 minutos y confirmar estabilidad."
  },
  medium: {
    id: "notify-shift-lead",
    title: "Notificar jefe de turno",
    description: "Informar al responsable del turno y validar decisiones aplicadas."
  },
  high: {
    id: "escalate-supervisor",
    title: "Escalar a supervisor",
    description: "Coordinar respuesta inmediata con supervisor operativo."
  },
  critical: {
    id: "activate-emergency",
    title: "Activar protocolo de emergencia",
    description: "Escalar de inmediato, priorizar seguridad biologica y continuidad operativa."
  }
};

function sanitizeStepId(value, fallbackIndex) {
  const candidate = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return candidate || `step-${fallbackIndex + 1}`;
}

export function buildAlertProtocolTemplate(sensorType, severity = "medium") {
  const baseTemplate = protocolTemplateByType[sensorType] || protocolTemplateByType.default;
  const severityStep = severityActionByLevel[severity] || severityActionByLevel.medium;
  const template = [...baseTemplate, severityStep];

  return normalizeAlertProtocolSteps(
    template.map((step, index) => ({
      id: sanitizeStepId(step.id, index),
      title: step.title,
      description: step.description,
      done: false
    }))
  );
}

export function normalizeAlertProtocolSteps(steps) {
  if (!Array.isArray(steps)) {
    return [];
  }

  const seen = new Set();

  return steps
    .map((step, index) => {
      const id = sanitizeStepId(step?.id, index);
      const title = String(step?.title || "").trim();
      const description = String(step?.description || "").trim();

      if (!title) {
        return null;
      }

      if (seen.has(id)) {
        return null;
      }

      seen.add(id);

      return {
        id,
        title: title.slice(0, 120),
        description: description.slice(0, 320),
        done: Boolean(step?.done)
      };
    })
    .filter(Boolean);
}
