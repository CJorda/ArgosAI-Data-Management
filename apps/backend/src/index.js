import http from "http";
import jwt from "jsonwebtoken";
import { Server as SocketServer } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { pool } from "./database/pool.js";
import { setIo, tenantRoom } from "./services/realtimeHub.js";
import {
  startExecutiveReportScheduler,
  stopExecutiveReportScheduler
} from "./services/executiveReportScheduler.js";
import {
  startSensorHealthAlertSyncScheduler,
  stopSensorHealthAlertSyncScheduler
} from "./services/sensorHealthAlertSyncScheduler.js";
import { startSimulator, stopSimulator } from "./services/simulatorService.js";

const app = createApp();
const server = http.createServer(app);
let simulatorStarted = false;
let schedulerStarted = false;
let sensorHealthAlertSchedulerStarted = false;
let warnedBypassRlsRole = false;

const io = new SocketServer(server, {
  cors: {
    origin: env.clientOrigins,
    credentials: true
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Unauthorized"));
  }

  try {
    const payload = jwt.verify(token, env.jwtAccessSecret);

    if (payload.type !== "access") {
      return next(new Error("Unauthorized"));
    }

    socket.data.user = {
      id: Number(payload.sub),
      tenantId: Number(payload.tenantId),
      tenantCode: payload.tenantCode,
      role: payload.role,
      features: Array.isArray(payload.features) ? payload.features : null
    };

    return next();
  } catch {
    return next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const { tenantId } = socket.data.user;
  socket.join(tenantRoom(tenantId));

  socket.emit("socket:ready", {
    tenantId,
    now: new Date().toISOString()
  });
});

setIo(io);

async function ensureDbConnection() {
  try {
    await pool.query("SELECT 1");

    const roleResult = await pool.query(
      `
        SELECT current_user AS role_name, rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname = current_user
        LIMIT 1
      `
    );

    if (roleResult.rowCount > 0) {
      const role = roleResult.rows[0];
      const bypassesRls = role.rolsuper || role.rolbypassrls;

      if (bypassesRls && !warnedBypassRlsRole) {
        if (env.enforceRlsSafeRole) {
          const bypassError = new Error(
            `Current PostgreSQL role (${role.role_name}) bypasses RLS, but ENFORCE_RLS_SAFE_ROLE=true`
          );

          bypassError.code = "RLS_ROLE_BYPASS";
          throw bypassError;
        }

        warnedBypassRlsRole = true;
        logger.warn(
          {
            role: role.role_name,
            rolsuper: role.rolsuper,
            rolbypassrls: role.rolbypassrls
          },
          "Current PostgreSQL role bypasses RLS. Use a dedicated non-superuser role in production."
        );
      }

      if (!bypassesRls) {
        warnedBypassRlsRole = false;
      }
    }

    if (!simulatorStarted) {
      startSimulator();
      simulatorStarted = true;
    }
    if (!schedulerStarted) {
      startExecutiveReportScheduler();
      schedulerStarted = true;
    }
    if (!sensorHealthAlertSchedulerStarted) {
      startSensorHealthAlertSyncScheduler();
      sensorHealthAlertSchedulerStarted = true;
    }
    logger.info("Database connection is available");
  } catch (error) {
    if (error?.code === "RLS_ROLE_BYPASS") {
      logger.error({ err: error }, "RLS role enforcement failed");
      throw error;
    }

    logger.warn(
      { err: error },
      "Database unavailable. API is up but DB-dependent endpoints will fail until DATABASE_URL is fixed"
    );
  }
}

async function start() {
  server.listen(env.port, () => {
    logger.info({ port: env.port }, "Backend listening");
  });

  if (env.noPostgresMode) {
    logger.warn("NO_POSTGRES mode enabled. Serving demo data from memory.");
    return;
  }

  await ensureDbConnection();

  setInterval(() => {
    ensureDbConnection().catch(() => {
      // Error is already logged inside ensureDbConnection.
    });
  }, 15000);
}

async function shutdown() {
  stopSimulator();
  stopExecutiveReportScheduler();
  stopSensorHealthAlertSyncScheduler();
  io.removeAllListeners();
  await pool.end();
  server.close(() => {
    logger.info("Backend stopped");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((error) => {
  logger.error({ err: error }, "Backend failed to start");
  process.exit(1);
});
