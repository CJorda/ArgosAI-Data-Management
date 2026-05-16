import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAnyFeature } from "../middleware/featureAccess.js";
import { FEATURE_KEYS } from "../security/featureCatalog.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createSessionSchema = z.object({
  machineType: z.string().min(2).default("Contadora S/L"),
  machineId: z.string().min(2).default("BFS-PGE-16S2C-CS"),
  durationMinutes: z.number().int().min(1).max(120).default(20)
});

const inferenceQuerySchema = z.object({
  machineId: z.string().trim().min(1).max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional()
});

function toNullableNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseMassHistogram(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split("|");
  if (parts.length < 3) {
    return null;
  }

  const xMin = toNullableNumber(parts[0]);
  const xMax = toNullableNumber(parts[1]);
  if (xMin === null || xMax === null || xMax <= xMin) {
    return null;
  }

  const bins = parts
    .slice(2)
    .join("|")
    .split(",")
    .map((item) => toNullableNumber(item))
    .filter((item) => item !== null)
    .map((item) => Number(item));

  if (bins.length === 0) {
    return null;
  }

  const binWidth = (xMax - xMin) / bins.length;
  const labels = bins.map((_value, index) => {
    const start = xMin + index * binWidth;
    const end = start + binWidth;
    return `${start.toFixed(1)}-${end.toFixed(1)}`;
  });

  return {
    xMin,
    xMax,
    binWidth: Number.isFinite(binWidth) ? Number(binWidth.toFixed(5)) : null,
    bins,
    labels,
    totalSamples: bins.reduce((sum, item) => sum + item, 0)
  };
}

async function queryInferenceRows({ machineId, from, to, limit, tenantId, includeTenantFilter }) {
  if (includeTenantFilter) {
    return query(
      `
        SELECT
          i.id_inference,
          i.created_at,
          i.start_timestamp,
          i.end_timestamp,
          i.total_count,
          i.total_mass_kg,
          i.mean_mass_g,
          i.std_deviation,
          i.machine_id,
          i.mass_hist,
          COALESCE(i.end_timestamp, i.start_timestamp, i.created_at) AS event_at
        FROM inference i
        WHERE ($1::bigint IS NULL OR i.tenant_id = $1)
          AND ($2::text IS NULL OR i.machine_id = $2)
          AND ($3::timestamptz IS NULL OR COALESCE(i.end_timestamp, i.start_timestamp, i.created_at) >= $3)
          AND ($4::timestamptz IS NULL OR COALESCE(i.end_timestamp, i.start_timestamp, i.created_at) <= $4)
        ORDER BY event_at DESC
        LIMIT $5
      `,
      [tenantId, machineId || null, from || null, to || null, limit]
    );
  }

  return query(
    `
      SELECT
        i.id_inference,
        i.created_at,
        i.start_timestamp,
        i.end_timestamp,
        i.total_count,
        i.total_mass_kg,
        i.mean_mass_g,
        i.std_deviation,
        i.machine_id,
        i.mass_hist,
        COALESCE(i.end_timestamp, i.start_timestamp, i.created_at) AS event_at
      FROM inference i
      WHERE ($1::text IS NULL OR i.machine_id = $1)
        AND ($2::timestamptz IS NULL OR COALESCE(i.end_timestamp, i.start_timestamp, i.created_at) >= $2)
        AND ($3::timestamptz IS NULL OR COALESCE(i.end_timestamp, i.start_timestamp, i.created_at) <= $3)
      ORDER BY event_at DESC
      LIMIT $4
    `,
    [machineId || null, from || null, to || null, limit]
  );
}

export const cameraRoutes = Router();

cameraRoutes.use(
  requireAuth,
  requireAnyFeature([FEATURE_KEYS.CAMERA_VIEW, FEATURE_KEYS.MACHINE_VIEW])
);

cameraRoutes.post(
  "/session",
  validate(createSessionSchema),
  asyncHandler(async (req, res) => {
    const { machineType, machineId, durationMinutes } = req.body;

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    const protocol = env.cameraDefaultProtocol;

    const streamUrl =
      protocol === "webrtc"
        ? `wss://jetson.local/mock-webrtc?tenant=${req.user.tenantId}&machine=${encodeURIComponent(machineId)}`
        : `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`;

    const fallbackUrl = "https://placehold.co/1280x720?text=FLIR+Blackfly+Mock+Stream";

    const result = await query(
      `
        INSERT INTO camera_sessions (
          tenant_id,
          machine_type,
          machine_id,
          viewer_user_id,
          stream_protocol,
          stream_url,
          fallback_url,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, machine_type, machine_id, stream_protocol, stream_url, fallback_url, expires_at, created_at
      `,
      [
        req.user.tenantId,
        machineType,
        machineId,
        req.user.id,
        protocol,
        streamUrl,
        fallbackUrl,
        expiresAt.toISOString()
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

cameraRoutes.get(
  "/session",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT id, machine_type, machine_id, stream_protocol, stream_url, fallback_url, expires_at, created_at
        FROM camera_sessions
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [req.user.tenantId]
    );

    res.json(result.rows);
  })
);

cameraRoutes.get(
  "/inference",
  asyncHandler(async (req, res) => {
    const parseResult = inferenceQuerySchema.safeParse(req.query || {});

    if (!parseResult.success) {
      return res.status(400).json({
        message: "Invalid query params"
      });
    }

    const payload = parseResult.data;
    const limit = payload.limit ?? 240;
    const machineId = payload.machineId ? payload.machineId.trim() : null;

    let result;
    let tenantScoped = true;

    try {
      result = await queryInferenceRows({
        machineId,
        from: payload.from || null,
        to: payload.to || null,
        limit,
        tenantId: req.user.tenantId,
        includeTenantFilter: true
      });
    } catch (error) {
      if (error?.code === "42P01") {
        return res.json({
          rows: [],
          summary: {
            totalInferences: 0,
            totalCount: 0,
            totalMassKg: 0,
            meanMassG: null,
            stdDeviationG: null,
            lastEventAt: null,
            byMachine: [],
            tenantScoped: false
          },
          notice: "inference table not found"
        });
      }

      if (error?.code === "42703") {
        tenantScoped = false;
        result = await queryInferenceRows({
          machineId,
          from: payload.from || null,
          to: payload.to || null,
          limit,
          tenantId: null,
          includeTenantFilter: false
        });
      } else {
        throw error;
      }
    }

    const rows = result.rows.map((row) => ({
      idInference: Number(row.id_inference),
      machineId: String(row.machine_id || ""),
      createdAt: row.created_at,
      startTimestamp: row.start_timestamp,
      endTimestamp: row.end_timestamp,
      eventAt: row.event_at,
      totalCount: toNullableNumber(row.total_count) ?? 0,
      totalMassKg: toNullableNumber(row.total_mass_kg) ?? 0,
      meanMassG: toNullableNumber(row.mean_mass_g),
      stdDeviationG: toNullableNumber(row.std_deviation),
      massHistRaw: row.mass_hist || null,
      histogram: parseMassHistogram(row.mass_hist)
    }));

    const byMachineMap = new Map();
    let totalCount = 0;
    let totalMassKg = 0;
    let meanMassWeightedSum = 0;
    let meanMassWeight = 0;

    for (const row of rows) {
      const machineKey = row.machineId || "unknown";
      const machineBucket = byMachineMap.get(machineKey) || {
        machineId: machineKey,
        inferences: 0,
        totalCount: 0,
        totalMassKg: 0,
        lastEventAt: null
      };

      machineBucket.inferences += 1;
      machineBucket.totalCount += row.totalCount || 0;
      machineBucket.totalMassKg += row.totalMassKg || 0;

      if (!machineBucket.lastEventAt || new Date(row.eventAt).getTime() > new Date(machineBucket.lastEventAt).getTime()) {
        machineBucket.lastEventAt = row.eventAt;
      }

      byMachineMap.set(machineKey, machineBucket);

      totalCount += row.totalCount || 0;
      totalMassKg += row.totalMassKg || 0;

      if (Number.isFinite(row.meanMassG) && (row.totalCount || 0) > 0) {
        meanMassWeightedSum += row.meanMassG * row.totalCount;
        meanMassWeight += row.totalCount;
      }
    }

    const latest = rows[0] || null;

    res.json({
      rows,
      summary: {
        totalInferences: rows.length,
        totalCount,
        totalMassKg: Number(totalMassKg.toFixed(3)),
        meanMassG: meanMassWeight > 0 ? Number((meanMassWeightedSum / meanMassWeight).toFixed(3)) : null,
        stdDeviationG: latest?.stdDeviationG ?? null,
        lastEventAt: latest?.eventAt || null,
        byMachine: Array.from(byMachineMap.values()).sort(
          (left, right) => right.inferences - left.inferences || right.totalCount - left.totalCount
        ),
        tenantScoped
      }
    });
  })
);
