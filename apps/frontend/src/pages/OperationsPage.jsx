import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import {
  createOperationRequest,
  inventoryItemsRequest,
  operationsRequest,
  pondsRequest
} from "../api/services";
import { useAuth } from "../context/AuthContext";
import "./OperationsPage.css";

const DAY_MS = 24 * 60 * 60 * 1000;
const sections = new Set(["alimentacion", "transferencia", "tratamiento", "vaciado-limpieza"]);

const feedingSlots = [
  { field: "morningKg", label: "Mañana", eventHour: 8, slotLabel: "manana" },
  { field: "afternoonKg", label: "Tarde", eventHour: 15, slotLabel: "tarde" },
  { field: "nightKg", label: "Noche", eventHour: 21, slotLabel: "noche" }
];

function toLocalDateTimeInput(value = new Date()) {
  const timezoneOffset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function toLocalDateInput(value = new Date()) {
  const timezoneOffset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function toLocalDateKey(dateValue) {
  if (!dateValue) {
    return "";
  }

  return toLocalDateInput(new Date(dateValue));
}

function classifyFeedingSlot(dateValue) {
  const date = new Date(dateValue);
  const hours = date.getHours();

  if (!Number.isFinite(hours)) {
    return null;
  }

  if (hours < 12) {
    return "manana";
  }

  if (hours < 19) {
    return "tarde";
  }

  return "noche";
}

function parseQuantityValue(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatPlanQuantity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  return numeric.toFixed(2);
}

function buildEventIsoForPlan(dateInput, eventHour) {
  const [year, month, day] = String(dateInput || "").split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date().toISOString();
  }

  const localDate = new Date(year, month - 1, day, eventHour, 0, 0, 0);
  return localDate.toISOString();
}

function formatDateForDisplay(dateInput) {
  if (!dateInput) {
    return "";
  }

  const [year, month, day] = String(dateInput).split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return String(dateInput);
  }

  return new Date(year, month - 1, day).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function toFileDateSegment(dateInput) {
  const fallbackDate = toLocalDateInput();
  return String(dateInput || fallbackDate).replace(/[^0-9-]/g, "");
}

function normalizePublicBaseUrl(rawValue) {
  const trimmed = String(rawValue || "").trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isFeedItem(item) {
  const category = String(item?.category || "").toLowerCase();
  const name = String(item?.name || "").toLowerCase();
  const sku = String(item?.sku || "").toLowerCase();

  return (
    category.includes("pienso") ||
    category.includes("aliment") ||
    category.includes("feed") ||
    name.includes("pienso") ||
    name.includes("aliment") ||
    name.includes("feed") ||
    sku.includes("pienso") ||
    sku.includes("feed")
  );
}

function sortOperationsByDate(rows) {
  return [...rows].sort((left, right) => {
    const leftDate = new Date(left.event_at || left.created_at).getTime();
    const rightDate = new Date(right.event_at || right.created_at).getTime();
    const safeLeft = Number.isFinite(leftDate) ? leftDate : Number.NEGATIVE_INFINITY;
    const safeRight = Number.isFinite(rightDate) ? rightDate : Number.NEGATIVE_INFINITY;
    return safeRight - safeLeft;
  });
}

function extractLabelValue(labelTags, prefix) {
  const normalizedPrefix = String(prefix || "").toLowerCase();

  for (const label of labelTags || []) {
    const [key, ...rest] = String(label || "").split(":");
    if (String(key || "").trim().toLowerCase() === normalizedPrefix) {
      return rest.join(":").trim() || null;
    }
  }

  return null;
}

function formatShiftLabel(shiftValue) {
  const normalized = String(shiftValue || "").toLowerCase();

  if (normalized === "manana") {
    return "Mañana";
  }

  if (normalized === "tarde") {
    return "Tarde";
  }

  if (normalized === "noche") {
    return "Noche";
  }

  return "-";
}

function formatActionLabel(operation) {
  const actionTag = extractLabelValue(operation.label_tags, "accion");
  if (actionTag) {
    if (actionTag === "vaciado") {
      return "Vaciado";
    }

    if (actionTag === "limpieza") {
      return "Limpieza";
    }

    return actionTag;
  }

  if (operation.type === "cleaning") {
    return "Limpieza";
  }

  if (operation.type === "maintenance") {
    return "Vaciado";
  }

  return operation.type;
}

function buildLocalOperationRowFromPayload(payload, pondName, idSuffix = "") {
  const eventAt = payload.eventAt || new Date().toISOString();
  const eventEpoch = new Date(eventAt).getTime();
  const withdrawalUntil =
    payload.withdrawalDays && Number(payload.withdrawalDays) > 0
      ? new Date(eventEpoch + Number(payload.withdrawalDays) * DAY_MS).toISOString()
      : null;

  return {
    id: `manual-operation-${Date.now()}-${idSuffix || "x"}`,
    pond_id: payload.pondId,
    pond_name: pondName || "Piscina demo",
    type: payload.type,
    quantity: Number(payload.quantity),
    quantity_unit: payload.quantityUnit || "kg",
    lot_code: payload.lotCode || null,
    mix_with_lot_code: payload.mixWithLotCode || null,
    label_tags: payload.labels || [],
    withdrawal_days: payload.withdrawalDays ?? null,
    withdrawal_until: withdrawalUntil,
    event_at: eventAt,
    created_at: eventAt,
    note: payload.note || null,
    isDemo: true,
    isManual: true
  };
}

function buildDemoPonds() {
  const speciesByZone = {
    F: "Dorada",
    E: "Lubina",
    D: "Trucha",
    A: "Dorada",
    B: "Lubina",
    C: "Trucha"
  };
  const codes = ["F1", "F2", "E1", "E2", "D1", "A4", "B4", "C7"];

  return codes.map((code, index) => ({
    id: `demo-pond-${index + 1}`,
    name: `Piscina ${code}`,
    species: speciesByZone[code.charAt(0)] || null,
    isDemo: true
  }));
}

function buildDemoOperations(ponds) {
  const availablePonds = ponds.length > 0 ? ponds : buildDemoPonds();
  const now = Date.now();
  const templates = [
    {
      type: "feeding",
      quantity: 58,
      quantityUnit: "kg",
      lotCode: "LOT-C7-220",
      labels: ["plan", "turno:manana"],
      note: "Ración ajustada por temperatura",
      hoursAgo: 2,
      withdrawalDays: null
    },
    {
      type: "maintenance",
      quantity: 2,
      quantityUnit: "units",
      lotCode: null,
      labels: ["accion:vaciado", "responsable:Equipo B"],
      note: "Vaciado parcial para inspección",
      hoursAgo: 6,
      withdrawalDays: null
    },
    {
      type: "transfer",
      quantity: 180,
      quantityUnit: "units",
      lotCode: "LOT-D1-118",
      labels: ["clasificación", "destino:Piscina E2"],
      note: "Transferencia parcial a tanque auxiliar",
      hoursAgo: 14,
      withdrawalDays: null
    },
    {
      type: "treatment",
      quantity: 12,
      quantityUnit: "kg",
      lotCode: "LOT-F2-031",
      labels: ["medicamento:Oxitetraciclina", "via:oral", "duracion:7d"],
      note: "Tratamiento preventivo planificado",
      hoursAgo: 28,
      withdrawalDays: 21
    },
    {
      type: "cleaning",
      quantity: 1,
      quantityUnit: "units",
      lotCode: null,
      labels: ["accion:limpieza", "responsable:Equipo A"],
      note: "Limpieza fondo y líneas de salida",
      hoursAgo: 36,
      withdrawalDays: null
    },
    {
      type: "feeding",
      quantity: 61,
      quantityUnit: "kg",
      lotCode: "LOT-E2-410",
      labels: ["plan", "turno:tarde"],
      note: "Plan de alimentación ciclo PM",
      hoursAgo: 48,
      withdrawalDays: null
    }
  ];

  return templates.map((template, index) => {
    const pond = availablePonds[index % availablePonds.length];
    const eventAt = new Date(now - template.hoursAgo * 3600 * 1000).toISOString();
    const withdrawalUntil =
      template.withdrawalDays === null
        ? null
        : new Date(now + template.withdrawalDays * 24 * 3600 * 1000).toISOString();

    return {
      id: `demo-operation-${index + 1}`,
      pond_id: pond.id,
      pond_name: pond.name,
      type: template.type,
      quantity: Number(template.quantity.toFixed(2)),
      quantity_unit: template.quantityUnit,
      lot_code: template.lotCode,
      label_tags: template.labels,
      withdrawal_until: withdrawalUntil,
      event_at: eventAt,
      created_at: eventAt,
      note: template.note,
      isDemo: true
    };
  });
}

export function OperationsPage() {
  const { accessToken } = useAuth();
  const { section = "alimentacion" } = useParams();
  const activeSection = sections.has(String(section || "").toLowerCase())
    ? String(section).toLowerCase()
    : "alimentacion";

  const queryClient = useQueryClient();
  const [manualOperationsRows, setManualOperationsRows] = useState([]);

  const [feedingPlanDate, setFeedingPlanDate] = useState(() => toLocalDateInput());
  const [feedingPlanRows, setFeedingPlanRows] = useState([]);
  const [isSavingFeedingPlan, setIsSavingFeedingPlan] = useState(false);
  const [isGeneratingFeedingPdf, setIsGeneratingFeedingPdf] = useState(false);
  const [selectedFeedItemId, setSelectedFeedItemId] = useState("");
  const [qrPublicBaseUrl, setQrPublicBaseUrl] = useState(() => {
    const envValue = String(import.meta.env.VITE_PUBLIC_CONFIRM_BASE_URL || "").trim();

    if (typeof window === "undefined") {
      return envValue;
    }

    const storedValue = String(window.localStorage.getItem("feedingQrPublicBaseUrl") || "").trim();

    if (storedValue) {
      return storedValue;
    }

    if (envValue) {
      return envValue;
    }

    return window.location.origin;
  });

  const [isSavingTransfer, setIsSavingTransfer] = useState(false);
  const [isSavingTreatment, setIsSavingTreatment] = useState(false);
  const [isSavingCleanup, setIsSavingCleanup] = useState(false);

  const pondsQuery = useQuery({
    queryKey: ["ponds"],
    queryFn: () => pondsRequest(accessToken)
  });

  const operationsQuery = useQuery({
    queryKey: ["operations"],
    queryFn: () => operationsRequest(accessToken)
  });

  const inventoryItemsQuery = useQuery({
    queryKey: ["operations", "inventory", "items", "feeding"],
    queryFn: () => inventoryItemsRequest(accessToken)
  });

  const pondsState = useMemo(() => {
    const rows = pondsQuery.data || [];
    if (rows.length > 0) {
      return {
        rows,
        isDemo: false
      };
    }

    return {
      rows: buildDemoPonds(),
      isDemo: true
    };
  }, [pondsQuery.data]);

  const pondNameById = useMemo(() => {
    const byId = new Map();
    for (const pond of pondsState.rows) {
      byId.set(String(pond.id), pond.name);
    }
    return byId;
  }, [pondsState.rows]);

  const operationsTableState = useMemo(() => {
    const rows = operationsQuery.data || [];

    if (operationsQuery.isLoading && rows.length === 0 && manualOperationsRows.length === 0) {
      return {
        rows: [],
        isDemo: false,
        isLoading: true
      };
    }

    if (rows.length > 0) {
      return {
        rows: sortOperationsByDate([...manualOperationsRows, ...rows]),
        isDemo: false,
        isLoading: false
      };
    }

    return {
      rows: sortOperationsByDate([...manualOperationsRows, ...buildDemoOperations(pondsState.rows)]),
      isDemo: true,
      isLoading: false
    };
  }, [operationsQuery.isLoading, operationsQuery.data, manualOperationsRows, pondsState.rows]);

  const feedingHistoryRows = useMemo(
    () => operationsTableState.rows.filter((operation) => operation.type === "feeding"),
    [operationsTableState.rows]
  );

  const feedItems = useMemo(() => {
    const rows = inventoryItemsQuery.data || [];
    return rows.filter(isFeedItem);
  }, [inventoryItemsQuery.data]);

  useEffect(() => {
    if (feedItems.length === 0) {
      setSelectedFeedItemId("");
      return;
    }

    setSelectedFeedItemId((current) => {
      const exists = feedItems.some((item) => String(item.id) === String(current));
      return exists ? current : String(feedItems[0].id);
    });
  }, [feedItems]);

  const selectedFeedItem = useMemo(
    () => feedItems.find((item) => String(item.id) === String(selectedFeedItemId)) || null,
    [feedItems, selectedFeedItemId]
  );

  const transferRows = useMemo(
    () =>
      operationsTableState.rows
        .filter((operation) => operation.type === "transfer")
        .map((operation) => ({
          ...operation,
          destinationPond:
            extractLabelValue(operation.label_tags, "destino") || operation.mix_with_lot_code || "-"
        })),
    [operationsTableState.rows]
  );

  const treatmentRows = useMemo(
    () =>
      operationsTableState.rows
        .filter((operation) => operation.type === "treatment")
        .map((operation) => ({
          ...operation,
          medicationName: extractLabelValue(operation.label_tags, "medicamento") || "-",
          activeIngredient: extractLabelValue(operation.label_tags, "ingrediente") || "-",
          route: extractLabelValue(operation.label_tags, "via") || "-",
          treatmentDuration: extractLabelValue(operation.label_tags, "duracion") || "-"
        })),
    [operationsTableState.rows]
  );

  const cleanupRows = useMemo(
    () =>
      operationsTableState.rows
        .filter((operation) => operation.type === "cleaning" || operation.type === "maintenance")
        .map((operation) => ({
          ...operation,
          actionLabel: formatActionLabel(operation),
          responsible: extractLabelValue(operation.label_tags, "responsable") || "-"
        })),
    [operationsTableState.rows]
  );

  const feedingPlanBaseRows = useMemo(() => {
    const rowsByPond = new Map();

    for (const pond of pondsState.rows) {
      rowsByPond.set(String(pond.id), {
        rowId: String(pond.id),
        pondId: pond.id,
        pondName: pond.name,
        morningKg: "",
        afternoonKg: "",
        nightKg: ""
      });
    }

    for (const operation of feedingHistoryRows) {
      const operationDateKey = toLocalDateKey(operation.event_at || operation.created_at);
      if (operationDateKey !== feedingPlanDate) {
        continue;
      }

      const quantityUnit = String(operation.quantity_unit || "kg").toLowerCase();
      if (quantityUnit !== "kg") {
        continue;
      }

      const shiftTag =
        extractLabelValue(operation.label_tags, "turno") ||
        classifyFeedingSlot(operation.event_at || operation.created_at);

      const field =
        shiftTag === "manana"
          ? "morningKg"
          : shiftTag === "tarde"
            ? "afternoonKg"
            : shiftTag === "noche"
              ? "nightKg"
              : null;

      if (!field) {
        continue;
      }

      const row = rowsByPond.get(String(operation.pond_id));
      if (!row) {
        continue;
      }

      const existing = parseQuantityValue(row[field]);
      const incoming = parseQuantityValue(operation.quantity);
      row[field] = formatPlanQuantity(existing + incoming);
    }

    return Array.from(rowsByPond.values()).sort((left, right) =>
      left.pondName.localeCompare(right.pondName)
    );
  }, [pondsState.rows, feedingHistoryRows, feedingPlanDate]);

  useEffect(() => {
    setFeedingPlanRows(feedingPlanBaseRows);
  }, [feedingPlanBaseRows]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("feedingQrPublicBaseUrl", qrPublicBaseUrl);
  }, [qrPublicBaseUrl]);

  const [transferForm, setTransferForm] = useState({
    sourcePondId: "",
    targetPondId: "",
    quantityUnits: "",
    lotCode: "",
    eventAt: toLocalDateTimeInput(),
    note: ""
  });

  const [treatmentForm, setTreatmentForm] = useState({
    pondId: "",
    medicationName: "",
    activeIngredient: "",
    totalDose: "",
    doseUnit: "kg",
    route: "oral",
    treatmentDays: "",
    withdrawalDays: "",
    eventAt: toLocalDateTimeInput(),
    note: ""
  });

  const [cleanupForm, setCleanupForm] = useState({
    pondId: "",
    actionType: "vaciado",
    quantity: "",
    quantityUnit: "units",
    responsible: "",
    eventAt: toLocalDateTimeInput(),
    note: ""
  });

  const appendLocalOperations = (rows) => {
    setManualOperationsRows((currentRows) =>
      sortOperationsByDate([...rows, ...currentRows]).slice(0, 300)
    );
  };

  const persistOperationPayloads = async (payloads) => {
    if (payloads.length === 0) {
      return;
    }

    if (pondsState.isDemo) {
      const localRows = payloads.map((payload, index) =>
        buildLocalOperationRowFromPayload(
          payload,
          pondNameById.get(String(payload.pondId)) || "Piscina demo",
          `${Date.now()}-${index}`
        )
      );
      appendLocalOperations(localRows);
      return;
    }

    await Promise.all(payloads.map((payload) => createOperationRequest(accessToken, payload)));
    await queryClient.invalidateQueries({ queryKey: ["operations"] });
    await queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  const handleFeedingPlanCellChange = (rowId, field, value) => {
    const sanitized = value.replace(/[^0-9.,]/g, "");

    setFeedingPlanRows((currentRows) =>
      currentRows.map((row) =>
        row.rowId === rowId
          ? {
              ...row,
              [field]: sanitized
            }
          : row
      )
    );
  };

  const calculateFeedingRowTotal = (row) =>
    feedingSlots.reduce((sum, slot) => sum + parseQuantityValue(row[slot.field]), 0);

  const canSaveFeedingPlan = feedingPlanRows.some((row) =>
    feedingSlots.some((slot) => parseQuantityValue(row[slot.field]) > 0)
  );

  const handleSaveFeedingPlan = async () => {
    const payloads = [];

    for (const row of feedingPlanRows) {
      for (const slot of feedingSlots) {
        const quantity = parseQuantityValue(row[slot.field]);
        if (quantity <= 0) {
          continue;
        }

        payloads.push({
          pondId: Number(row.pondId),
          type: "feeding",
          quantity: Number(quantity.toFixed(2)),
          quantityUnit: "kg",
          lotCode: selectedFeedItem?.sku || null,
          mixWithLotCode: null,
          labels: [
            "plan",
            `turno:${slot.slotLabel}`,
            selectedFeedItem?.sku ? `piensoSku:${selectedFeedItem.sku}` : null,
            selectedFeedItem?.name ? `piensoNombre:${selectedFeedItem.name}` : null
          ].filter(Boolean),
          withdrawalDays: null,
          eventAt: buildEventIsoForPlan(feedingPlanDate, slot.eventHour),
          note: `Plan de alimentación (${slot.label.toLowerCase()})${selectedFeedItem?.name ? ` - ${selectedFeedItem.name}` : ""}`
        });
      }
    }

    if (payloads.length === 0) {
      return;
    }

    setIsSavingFeedingPlan(true);
    try {
      await persistOperationPayloads(payloads);
    } finally {
      setIsSavingFeedingPlan(false);
    }
  };

  const handleDownloadFeedingPlanPdf = async () => {
    const rowsForPdf = feedingPlanRows
      .map((row) => {
        const morning = parseQuantityValue(row.morningKg);
        const afternoon = parseQuantityValue(row.afternoonKg);
        const night = parseQuantityValue(row.nightKg);
        const total = morning + afternoon + night;

        return {
          pondName: row.pondName,
          morning,
          afternoon,
          night,
          total
        };
      })
      .filter((row) => row.total > 0);

    if (rowsForPdf.length === 0) {
      window.alert("No hay cantidades planificadas para exportar en la fecha seleccionada.");
      return;
    }

    const totalKg = rowsForPdf.reduce((sum, row) => sum + row.total, 0);
    const humanDate = formatDateForDisplay(feedingPlanDate);
    const generatedAt = new Date().toLocaleString("es-ES");
    const planId = `ALIM-${toFileDateSegment(feedingPlanDate)}-${Date.now().toString().slice(-6)}`;
    const selectedFeedLabel = selectedFeedItem
      ? `${selectedFeedItem.sku} - ${selectedFeedItem.name}`
      : "No especificado";
    const feedStockLabel =
      selectedFeedItem && Number.isFinite(Number(selectedFeedItem.current_stock))
        ? `${Number(selectedFeedItem.current_stock).toFixed(2)} ${selectedFeedItem.unit || "kg"}`
        : "--";
    const normalizedPublicBaseUrl = normalizePublicBaseUrl(qrPublicBaseUrl);

    if (!normalizedPublicBaseUrl) {
      window.alert("Introduce una URL pública válida para el QR (por ejemplo, https://tu-dominio.com).");
      return;
    }

    const publicBaseUrl = new URL(normalizedPublicBaseUrl);
    if (isLocalHostname(publicBaseUrl.hostname)) {
      window.alert(
        "La URL del QR no puede ser localhost/127.0.0.1 porque no es accesible desde el móvil."
      );
      return;
    }

    const confirmationUrl = new URL("/confirmacion/alimentacion", normalizedPublicBaseUrl);
    confirmationUrl.searchParams.set("planId", planId);
    confirmationUrl.searchParams.set("fecha", new Date(feedingPlanDate).toISOString());
    confirmationUrl.searchParams.set("totalKg", totalKg.toFixed(2));
    confirmationUrl.searchParams.set("piscinas", String(rowsForPdf.length));

    setIsGeneratingFeedingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const qrDataUrl = await QRCode.toDataURL(confirmationUrl.toString(), {
        width: 256,
        margin: 1,
        errorCorrectionLevel: "M"
      });

      doc.setFillColor(14, 64, 106);
      doc.rect(0, 0, 210, 42, "F");
      doc.addImage(qrDataUrl, "PNG", 168, 1, 40, 40);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Plan diario de alimentación", 14, 15);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(humanDate ? `Fecha: ${humanDate}` : "Fecha: -", 14, 25);

      doc.setTextColor(28, 52, 78);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Generado: ${generatedAt}`, 14, 48);
      doc.text(`Plan ID: ${planId}`, 14, 53);
      doc.text(`Piscinas con trabajo: ${rowsForPdf.length}`, 14, 58);
      doc.text(`Total alimento del día: ${totalKg.toFixed(2)} kg`, 88, 58);
      doc.text(`Tipo de pienso: ${selectedFeedLabel}`, 14, 63);
      doc.text(`Stock en almacén: ${feedStockLabel}`, 14, 68);

      doc.setTextColor(70, 92, 120);

      autoTable(doc, {
        startY: 72,
        head: [["Piscina", "Mañana (kg)", "Tarde (kg)", "Noche (kg)", "Total día (kg)"]],
        body: rowsForPdf.map((row) => [
          row.pondName,
          row.morning > 0 ? row.morning.toFixed(2) : "-",
          row.afternoon > 0 ? row.afternoon.toFixed(2) : "-",
          row.night > 0 ? row.night.toFixed(2) : "-",
          row.total.toFixed(2)
        ]),
        styles: {
          fontSize: 10,
          cellPadding: 2.8,
          textColor: [38, 57, 82],
          lineColor: [213, 225, 241],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [17, 83, 139],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center"
        },
        alternateRowStyles: {
          fillColor: [246, 250, 255]
        },
        columnStyles: {
          0: { cellWidth: 62, halign: "left" },
          1: { cellWidth: 31, halign: "right" },
          2: { cellWidth: 31, halign: "right" },
          3: { cellWidth: 31, halign: "right" },
          4: { cellWidth: 36, halign: "right" }
        }
      });

      const firstTableEndY = doc.lastAutoTable?.finalY || 60;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(28, 52, 78);
      doc.text("Hoja de seguimiento técnico", 14, firstTableEndY + 10);

      autoTable(doc, {
        startY: firstTableEndY + 14,
        head: [["Turno", "Hora planificada", "Responsable", "Firma"]],
        body: [
          ["Mañana", "08:00", "", ""],
          ["Tarde", "15:00", "", ""],
          ["Noche", "21:00", "", ""]
        ],
        styles: {
          fontSize: 10,
          cellPadding: 4,
          lineColor: [213, 225, 241],
          lineWidth: 0.1,
          minCellHeight: 12
        },
        headStyles: {
          fillColor: [227, 238, 252],
          textColor: [31, 68, 106],
          fontStyle: "bold"
        },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 40 },
          2: { cellWidth: 60 },
          3: { cellWidth: 50 }
        }
      });

      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(88, 109, 138);
      doc.text("Documento operativo para alimentación diaria en planta.", 14, pageHeight - 10);
      doc.text(`Confirmación: ${confirmationUrl.toString()}`, 14, pageHeight - 5);

      doc.save(`plan-alimentacion-${toFileDateSegment(feedingPlanDate)}.pdf`);
    } finally {
      setIsGeneratingFeedingPdf(false);
    }
  };

  const handleTransferSubmit = async (event) => {
    event.preventDefault();

    const sourcePondId = Number(transferForm.sourcePondId);
    const targetPondId = Number(transferForm.targetPondId);
    const quantityUnits = Number(transferForm.quantityUnits);

    if (!Number.isFinite(sourcePondId) || !Number.isFinite(targetPondId)) {
      return;
    }

    if (sourcePondId === targetPondId || !Number.isFinite(quantityUnits) || quantityUnits <= 0) {
      return;
    }

    const targetPondName = pondNameById.get(String(targetPondId)) || "Destino";

    const payload = {
      pondId: sourcePondId,
      type: "transfer",
      quantity: Math.round(quantityUnits),
      quantityUnit: "units",
      lotCode: transferForm.lotCode || null,
      mixWithLotCode: null,
      labels: [`destino:${targetPondName}`],
      withdrawalDays: null,
      eventAt: transferForm.eventAt ? new Date(transferForm.eventAt).toISOString() : undefined,
      note: transferForm.note || `Transferencia hacia ${targetPondName}`
    };

    setIsSavingTransfer(true);
    try {
      await persistOperationPayloads([payload]);
      setTransferForm({
        sourcePondId: "",
        targetPondId: "",
        quantityUnits: "",
        lotCode: "",
        eventAt: toLocalDateTimeInput(),
        note: ""
      });
    } finally {
      setIsSavingTransfer(false);
    }
  };

  const handleTreatmentSubmit = async (event) => {
    event.preventDefault();

    const pondId = Number(treatmentForm.pondId);
    const totalDose = Number(treatmentForm.totalDose);
    const withdrawalDays = treatmentForm.withdrawalDays ? Number(treatmentForm.withdrawalDays) : null;

    if (!Number.isFinite(pondId) || !Number.isFinite(totalDose) || totalDose <= 0) {
      return;
    }

    const labels = [
      "tratamiento",
      treatmentForm.medicationName ? `medicamento:${treatmentForm.medicationName}` : null,
      treatmentForm.activeIngredient ? `ingrediente:${treatmentForm.activeIngredient}` : null,
      treatmentForm.route ? `via:${treatmentForm.route}` : null,
      treatmentForm.treatmentDays ? `duracion:${treatmentForm.treatmentDays}d` : null
    ].filter(Boolean);

    const payload = {
      pondId,
      type: "treatment",
      quantity: Number(totalDose.toFixed(2)),
      quantityUnit: treatmentForm.doseUnit,
      lotCode: null,
      mixWithLotCode: null,
      labels,
      withdrawalDays: Number.isFinite(withdrawalDays) && withdrawalDays > 0 ? withdrawalDays : null,
      eventAt: treatmentForm.eventAt ? new Date(treatmentForm.eventAt).toISOString() : undefined,
      note: treatmentForm.note || null
    };

    setIsSavingTreatment(true);
    try {
      await persistOperationPayloads([payload]);
      setTreatmentForm({
        pondId: "",
        medicationName: "",
        activeIngredient: "",
        totalDose: "",
        doseUnit: "kg",
        route: "oral",
        treatmentDays: "",
        withdrawalDays: "",
        eventAt: toLocalDateTimeInput(),
        note: ""
      });
    } finally {
      setIsSavingTreatment(false);
    }
  };

  const handleCleanupSubmit = async (event) => {
    event.preventDefault();

    const pondId = Number(cleanupForm.pondId);
    const quantity = Number(cleanupForm.quantity);

    if (!Number.isFinite(pondId) || !Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    const operationType = cleanupForm.actionType === "limpieza" ? "cleaning" : "maintenance";
    const labels = [
      `accion:${cleanupForm.actionType}`,
      cleanupForm.responsible ? `responsable:${cleanupForm.responsible}` : null
    ].filter(Boolean);

    const payload = {
      pondId,
      type: operationType,
      quantity: Number(quantity.toFixed(2)),
      quantityUnit: cleanupForm.quantityUnit,
      lotCode: null,
      mixWithLotCode: null,
      labels,
      withdrawalDays: null,
      eventAt: cleanupForm.eventAt ? new Date(cleanupForm.eventAt).toISOString() : undefined,
      note: cleanupForm.note || null
    };

    setIsSavingCleanup(true);
    try {
      await persistOperationPayloads([payload]);
      setCleanupForm({
        pondId: "",
        actionType: "vaciado",
        quantity: "",
        quantityUnit: "units",
        responsible: "",
        eventAt: toLocalDateTimeInput(),
        note: ""
      });
    } finally {
      setIsSavingCleanup(false);
    }
  };

  if (activeSection === "alimentacion") {
    return (
      <section className="operations-page">
        <article className="panel operations-feeding-panel">
          <h3>Plan de alimentación por piscina</h3>
          <p className="operations-feeding-note">
            Define los kg de pienso para cada piscina en los turnos de mañana, tarde y noche.
          </p>

          <div className="operations-feeding-toolbar">
            <label htmlFor="feedingPlanDate">Fecha del plan</label>
            <input
              id="feedingPlanDate"
              type="date"
              value={feedingPlanDate}
              onChange={(event) => setFeedingPlanDate(event.target.value)}
            />

            <label htmlFor="feedingFeedItem">Tipo de pienso</label>
            <select
              id="feedingFeedItem"
              className="operations-feed-select"
              value={selectedFeedItemId}
              onChange={(event) => setSelectedFeedItemId(event.target.value)}
            >
              {feedItems.length === 0 ? (
                <option value="">Sin ítems de pienso en inventario</option>
              ) : (
                feedItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} - {item.name}
                  </option>
                ))
              )}
            </select>

            <span className="operations-feed-stock-chip">
              Stock almacén: {selectedFeedItem
                ? `${Number(selectedFeedItem.current_stock || 0).toFixed(2)} ${selectedFeedItem.unit || "kg"}`
                : "--"}
            </span>

            <label htmlFor="qrPublicBaseUrl">URL pública QR</label>
            <input
              id="qrPublicBaseUrl"
              type="url"
              className="operations-public-url-input"
              value={qrPublicBaseUrl}
              onChange={(event) => setQrPublicBaseUrl(event.target.value)}
              placeholder="https://tu-dominio.com"
            />

            <button
              type="button"
              className="primary-button"
              onClick={handleSaveFeedingPlan}
              disabled={!canSaveFeedingPlan || isSavingFeedingPlan}
            >
              {isSavingFeedingPlan
                ? "Guardando plan..."
                : pondsState.isDemo
                  ? "Guardar plan (demo local)"
                  : "Guardar plan de alimentación"}
            </button>

            <button
              type="button"
              className="operations-pdf-button"
              onClick={handleDownloadFeedingPlanPdf}
              disabled={isGeneratingFeedingPdf}
            >
              {isGeneratingFeedingPdf ? "Preparando PDF..." : "Descargar PDF diario"}
            </button>
          </div>

          <div className="table-wrap">
            <table className="operations-feeding-table">
              <thead>
                <tr>
                  <th>Piscina</th>
                  <th>Mañana (kg)</th>
                  <th>Tarde (kg)</th>
                  <th>Noche (kg)</th>
                  <th>Total día (kg)</th>
                </tr>
              </thead>
              <tbody>
                {feedingPlanRows.length > 0 ? (
                  feedingPlanRows.map((row) => (
                    <tr key={row.rowId}>
                      <td>{row.pondName}</td>
                      {feedingSlots.map((slot) => (
                        <td key={`${row.rowId}-${slot.field}`}>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="operations-feeding-input"
                            value={row[slot.field]}
                            onChange={(event) =>
                              handleFeedingPlanCellChange(row.rowId, slot.field, event.target.value)
                            }
                            placeholder="0.00"
                          />
                        </td>
                      ))}
                      <td>{formatPlanQuantity(calculateFeedingRowTotal(row)) || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="operations-table-empty">No hay piscinas para planificar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h3>Historial de alimentación</h3>
          {operationsTableState.isDemo ? (
            <p className="operations-demo-note">
              No hay operaciones reales todavía. Se muestran operaciones demo y también las que
              registres en modo local.
            </p>
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Piscina</th>
                  <th>Pienso</th>
                  <th>Turno</th>
                  <th>Cantidad</th>
                  <th>Lote</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {operationsTableState.isLoading ? (
                  <tr>
                    <td colSpan={7} className="operations-table-empty">Cargando operaciones...</td>
                  </tr>
                ) : feedingHistoryRows.length > 0 ? (
                  feedingHistoryRows.map((operation) => {
                    const shiftTag =
                      extractLabelValue(operation.label_tags, "turno") ||
                      classifyFeedingSlot(operation.event_at || operation.created_at);
                    const feedSku = extractLabelValue(operation.label_tags, "piensoSku");
                    const feedName = extractLabelValue(operation.label_tags, "piensoNombre");
                    const feedLabel =
                      [feedSku, feedName].filter(Boolean).join(" - ") ||
                      feedName ||
                      feedSku ||
                      "-";

                    return (
                      <tr key={operation.id}>
                        <td>{new Date(operation.event_at || operation.created_at).toLocaleString()}</td>
                        <td>{operation.pond_name}</td>
                        <td>{feedLabel}</td>
                        <td>{formatShiftLabel(shiftTag)}</td>
                        <td>
                          {operation.quantity} {operation.quantity_unit || "kg"}
                        </td>
                        <td>{operation.lot_code || "-"}</td>
                        <td>{operation.note || "-"}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="operations-table-empty">No hay alimentaciones para mostrar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    );
  }

  if (activeSection === "transferencia") {
    return (
      <section className="operations-page">
        <article className="panel">
          <h3>Nueva transferencia</h3>
          {pondsState.isDemo ? (
            <p className="operations-demo-note">
              Estás en modo demo: las transferencias se guardan localmente para pruebas.
            </p>
          ) : null}
          <form onSubmit={handleTransferSubmit} className="stack-form">
            <label htmlFor="transferSource">Piscina origen</label>
            <select
              id="transferSource"
              value={transferForm.sourcePondId}
              onChange={(event) =>
                setTransferForm((prev) => ({ ...prev, sourcePondId: event.target.value }))
              }
              required
            >
              <option value="">Selecciona</option>
              {pondsState.rows.map((pond) => (
                <option key={pond.id} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>

            <label htmlFor="transferTarget">Piscina destino</label>
            <select
              id="transferTarget"
              value={transferForm.targetPondId}
              onChange={(event) =>
                setTransferForm((prev) => ({ ...prev, targetPondId: event.target.value }))
              }
              required
            >
              <option value="">Selecciona</option>
              {pondsState.rows.map((pond) => (
                <option key={`dest-${pond.id}`} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>

            <label htmlFor="transferQty">Cantidad (peces)</label>
            <input
              id="transferQty"
              type="number"
              min="1"
              step="1"
              value={transferForm.quantityUnits}
              onChange={(event) =>
                setTransferForm((prev) => ({ ...prev, quantityUnits: event.target.value }))
              }
              required
            />

            <label htmlFor="transferLot">Lote</label>
            <input
              id="transferLot"
              type="text"
              value={transferForm.lotCode}
              onChange={(event) =>
                setTransferForm((prev) => ({ ...prev, lotCode: event.target.value }))
              }
              placeholder="Ej. LOT-D1-118"
            />

            <label htmlFor="transferDate">Fecha del evento</label>
            <input
              id="transferDate"
              type="datetime-local"
              value={transferForm.eventAt}
              onChange={(event) =>
                setTransferForm((prev) => ({ ...prev, eventAt: event.target.value }))
              }
            />

            <label htmlFor="transferNote">Nota</label>
            <textarea
              id="transferNote"
              rows={3}
              value={transferForm.note}
              onChange={(event) =>
                setTransferForm((prev) => ({ ...prev, note: event.target.value }))
              }
            />

            <button type="submit" className="primary-button" disabled={isSavingTransfer}>
              {isSavingTransfer
                ? "Guardando..."
                : pondsState.isDemo
                  ? "Guardar transferencia (demo local)"
                  : "Guardar transferencia"}
            </button>
          </form>
        </article>

        <article className="panel">
          <h3>Transferencias registradas</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Piscina origen</th>
                  <th>Piscina destino</th>
                  <th>Cantidad</th>
                  <th>Lote</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {operationsTableState.isLoading ? (
                  <tr>
                    <td colSpan={6} className="operations-table-empty">Cargando transferencias...</td>
                  </tr>
                ) : transferRows.length > 0 ? (
                  transferRows.map((operation) => (
                    <tr key={operation.id}>
                      <td>{new Date(operation.event_at || operation.created_at).toLocaleString()}</td>
                      <td>{operation.pond_name}</td>
                      <td>{operation.destinationPond}</td>
                      <td>
                        {operation.quantity} {operation.quantity_unit || "units"}
                      </td>
                      <td>{operation.lot_code || "-"}</td>
                      <td>{operation.note || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="operations-table-empty">No hay transferencias para mostrar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    );
  }

  if (activeSection === "tratamiento") {
    return (
      <section className="operations-page">
        <article className="panel">
          <h3>Nuevo tratamiento</h3>
          {pondsState.isDemo ? (
            <p className="operations-demo-note">
              Estás en modo demo: los tratamientos se guardan localmente para pruebas.
            </p>
          ) : null}
          <form onSubmit={handleTreatmentSubmit} className="stack-form">
            <label htmlFor="treatPond">Piscina</label>
            <select
              id="treatPond"
              value={treatmentForm.pondId}
              onChange={(event) =>
                setTreatmentForm((prev) => ({ ...prev, pondId: event.target.value }))
              }
              required
            >
              <option value="">Selecciona</option>
              {pondsState.rows.map((pond) => (
                <option key={`treat-${pond.id}`} value={pond.id}>
                  {pond.name}
                </option>
              ))}
            </select>

            <label htmlFor="treatMedication">Medicamento</label>
            <input
              id="treatMedication"
              type="text"
              value={treatmentForm.medicationName}
              onChange={(event) =>
                setTreatmentForm((prev) => ({ ...prev, medicationName: event.target.value }))
              }
              placeholder="Ej. Oxitetraciclina"
              required
            />

            <label htmlFor="treatIngredient">Ingrediente activo</label>
            <input
              id="treatIngredient"
              type="text"
              value={treatmentForm.activeIngredient}
              onChange={(event) =>
                setTreatmentForm((prev) => ({ ...prev, activeIngredient: event.target.value }))
              }
              placeholder="Opcional"
            />

            <label htmlFor="treatDose">Dosis total</label>
            <input
              id="treatDose"
              type="number"
              min="0.01"
              step="0.01"
              value={treatmentForm.totalDose}
              onChange={(event) =>
                setTreatmentForm((prev) => ({ ...prev, totalDose: event.target.value }))
              }
              required
            />

            <label htmlFor="treatDoseUnit">Unidad dosis</label>
            <select
              id="treatDoseUnit"
              value={treatmentForm.doseUnit}
              onChange={(event) =>
                setTreatmentForm((prev) => ({ ...prev, doseUnit: event.target.value }))
              }
            >
              <option value="kg">kg</option>
              <option value="units">unidades</option>
            </select>

            <label htmlFor="treatRoute">Vía administración</label>
            <select
              id="treatRoute"
              value={treatmentForm.route}
              onChange={(event) =>
                setTreatmentForm((prev) => ({ ...prev, route: event.target.value }))
              }
            >
              <option value="oral">Oral</option>
              <option value="banio">Baño</option>
              <option value="inyeccion">Inyección</option>
            </select>

            <label htmlFor="treatDays">Días tratamiento</label>
            <input
              id="treatDays"
              type="number"
              min="1"
              value={treatmentForm.treatmentDays}
              onChange={(event) =>
                setTreatmentForm((prev) => ({ ...prev, treatmentDays: event.target.value }))
              }
              placeholder="Ej. 7"
            />

            <label htmlFor="treatWithdrawal">Días retiro</label>
            <input
              id="treatWithdrawal"
              type="number"
              min="1"
              value={treatmentForm.withdrawalDays}
              onChange={(event) =>
                setTreatmentForm((prev) => ({ ...prev, withdrawalDays: event.target.value }))
              }
              placeholder="Ej. 21"
            />

            <label htmlFor="treatDate">Fecha del evento</label>
            <input
              id="treatDate"
              type="datetime-local"
              value={treatmentForm.eventAt}
              onChange={(event) =>
                setTreatmentForm((prev) => ({ ...prev, eventAt: event.target.value }))
              }
            />

            <label htmlFor="treatNote">Nota</label>
            <textarea
              id="treatNote"
              rows={3}
              value={treatmentForm.note}
              onChange={(event) =>
                setTreatmentForm((prev) => ({ ...prev, note: event.target.value }))
              }
            />

            <button type="submit" className="primary-button" disabled={isSavingTreatment}>
              {isSavingTreatment
                ? "Guardando..."
                : pondsState.isDemo
                  ? "Guardar tratamiento (demo local)"
                  : "Guardar tratamiento"}
            </button>
          </form>
        </article>

        <article className="panel">
          <h3>Tratamientos registrados</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Piscina</th>
                  <th>Medicamento</th>
                  <th>Ingrediente</th>
                  <th>Dosis</th>
                  <th>Vía</th>
                  <th>Duración</th>
                  <th>Retiro</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {operationsTableState.isLoading ? (
                  <tr>
                    <td colSpan={9} className="operations-table-empty">Cargando tratamientos...</td>
                  </tr>
                ) : treatmentRows.length > 0 ? (
                  treatmentRows.map((operation) => (
                    <tr key={operation.id}>
                      <td>{new Date(operation.event_at || operation.created_at).toLocaleString()}</td>
                      <td>{operation.pond_name}</td>
                      <td>{operation.medicationName}</td>
                      <td>{operation.activeIngredient}</td>
                      <td>
                        {operation.quantity} {operation.quantity_unit || "kg"}
                      </td>
                      <td>{operation.route}</td>
                      <td>{operation.treatmentDuration}</td>
                      <td>
                        {operation.withdrawal_until
                          ? new Date(operation.withdrawal_until).toLocaleDateString()
                          : "-"}
                      </td>
                      <td>{operation.note || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="operations-table-empty">No hay tratamientos para mostrar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="operations-page">
      <article className="panel">
        <h3>Vaciado y limpieza</h3>
        {pondsState.isDemo ? (
          <p className="operations-demo-note">
            Estás en modo demo: las acciones se guardan localmente para pruebas.
          </p>
        ) : null}
        <form onSubmit={handleCleanupSubmit} className="stack-form">
          <label htmlFor="cleanupPond">Piscina</label>
          <select
            id="cleanupPond"
            value={cleanupForm.pondId}
            onChange={(event) =>
              setCleanupForm((prev) => ({ ...prev, pondId: event.target.value }))
            }
            required
          >
            <option value="">Selecciona</option>
            {pondsState.rows.map((pond) => (
              <option key={`cleanup-${pond.id}`} value={pond.id}>
                {pond.name}
              </option>
            ))}
          </select>

          <label htmlFor="cleanupType">Tipo de acción</label>
          <select
            id="cleanupType"
            value={cleanupForm.actionType}
            onChange={(event) =>
              setCleanupForm((prev) => ({ ...prev, actionType: event.target.value }))
            }
          >
            <option value="vaciado">Vaciado</option>
            <option value="limpieza">Limpieza</option>
          </select>

          <label htmlFor="cleanupQty">Cantidad</label>
          <input
            id="cleanupQty"
            type="number"
            min="0.01"
            step="0.01"
            value={cleanupForm.quantity}
            onChange={(event) =>
              setCleanupForm((prev) => ({ ...prev, quantity: event.target.value }))
            }
            required
          />

          <label htmlFor="cleanupUnit">Unidad</label>
          <select
            id="cleanupUnit"
            value={cleanupForm.quantityUnit}
            onChange={(event) =>
              setCleanupForm((prev) => ({ ...prev, quantityUnit: event.target.value }))
            }
          >
            <option value="units">unidades</option>
            <option value="kg">kg</option>
          </select>

          <label htmlFor="cleanupResponsible">Responsable</label>
          <input
            id="cleanupResponsible"
            type="text"
            value={cleanupForm.responsible}
            onChange={(event) =>
              setCleanupForm((prev) => ({ ...prev, responsible: event.target.value }))
            }
            placeholder="Ej. Turno B"
          />

          <label htmlFor="cleanupDate">Fecha del evento</label>
          <input
            id="cleanupDate"
            type="datetime-local"
            value={cleanupForm.eventAt}
            onChange={(event) =>
              setCleanupForm((prev) => ({ ...prev, eventAt: event.target.value }))
            }
          />

          <label htmlFor="cleanupNote">Nota</label>
          <textarea
            id="cleanupNote"
            rows={3}
            value={cleanupForm.note}
            onChange={(event) =>
              setCleanupForm((prev) => ({ ...prev, note: event.target.value }))
            }
          />

          <button type="submit" className="primary-button" disabled={isSavingCleanup}>
            {isSavingCleanup
              ? "Guardando..."
              : pondsState.isDemo
                ? "Guardar acción (demo local)"
                : "Guardar acción"}
          </button>
        </form>
      </article>

      <article className="panel">
        <h3>Historial de vaciado y limpieza</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Piscina</th>
                <th>Acción</th>
                <th>Cantidad</th>
                <th>Responsable</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {operationsTableState.isLoading ? (
                <tr>
                  <td colSpan={6} className="operations-table-empty">Cargando tareas...</td>
                </tr>
              ) : cleanupRows.length > 0 ? (
                cleanupRows.map((operation) => (
                  <tr key={operation.id}>
                    <td>{new Date(operation.event_at || operation.created_at).toLocaleString()}</td>
                    <td>{operation.pond_name}</td>
                    <td>{operation.actionLabel}</td>
                    <td>
                      {operation.quantity} {operation.quantity_unit || "units"}
                    </td>
                    <td>{operation.responsible}</td>
                    <td>{operation.note || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="operations-table-empty">No hay tareas para mostrar.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
