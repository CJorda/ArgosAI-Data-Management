import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createSessionSchema = z.object({
  machineType: z.string().min(2).default("Contadora S/L"),
  machineId: z.string().min(2).default("BFS-PGE-16S2C-CS"),
  durationMinutes: z.number().int().min(1).max(120).default(20)
});

export const cameraRoutes = Router();

cameraRoutes.use(requireAuth);

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
