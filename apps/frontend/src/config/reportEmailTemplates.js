export const REPORT_EMAIL_TEMPLATES = [
  {
    id: "operativo-diario",
    label: "Operativo diario",
    subjectTemplate: "Reporte operativo calidad agua {{fromDate}} - {{toDate}}",
    bodyTemplate:
      "Hola equipo,\n\nAdjuntamos el reporte de calidad de agua del periodo {{fromDate}} - {{toDate}}.\n\nFormato: {{format}}\nAgrupacion: {{bucket}}\nSensores incluidos: {{sensorCount}}\nFilas exportadas: {{rowCount}}\n\nGenerado: {{generatedAt}}\n\nUn saludo."
  },
  {
    id: "cumplimiento-che",
    label: "Cumplimiento CHE",
    subjectTemplate: "Entrega CHE - Calidad agua y caudal {{fromDate}} - {{toDate}}",
    bodyTemplate:
      "Buenos dias,\n\nSe remite informacion operativa para cumplimiento con Confederacion Hidrografica.\n\nRango: {{fromDate}} - {{toDate}}\nFormato: {{format}}\nAgrupacion: {{bucket}}\nFilas exportadas: {{rowCount}}\n\nGenerado por: {{requestedBy}}\nFecha de envio: {{generatedAt}}\n\nQuedamos a disposicion para cualquier aclaracion."
  },
  {
    id: "alerta-incidencia",
    label: "Incidencia y seguimiento",
    subjectTemplate: "Incidencia calidad agua {{fromDate}} - {{toDate}}",
    bodyTemplate:
      "Hola,\n\nSe envia reporte de seguimiento por incidencia detectada en calidad del agua.\n\nPeriodo analizado: {{fromDate}} - {{toDate}}\nSensores: {{sensorCount}}\nFilas: {{rowCount}}\n\nNotas:\n- Revisar tendencias y valores extremos.\n- Confirmar acciones correctivas en planta.\n\nGenerado: {{generatedAt}}"
  }
];

export function resolveReportEmailTemplate(templateId) {
  return REPORT_EMAIL_TEMPLATES.find((template) => template.id === templateId) || REPORT_EMAIL_TEMPLATES[0];
}

export function applyEmailTemplate(templateText, context) {
  const safeContext = context || {};

  return String(templateText || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const value = safeContext[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
