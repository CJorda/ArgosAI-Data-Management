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
import { startSimulator, stopSimulator } from "./services/simulatorService.js";

const app = createApp();
const server = http.createServer(app);
let simulatorStarted = false;
let schedulerStarted = false;

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
      role: payload.role
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
    if (!simulatorStarted) {
      startSimulator();
      simulatorStarted = true;
    }
    if (!schedulerStarted) {
      startExecutiveReportScheduler();
      schedulerStarted = true;
    }
    logger.info("Database connection is available");
  } catch (error) {
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
  io.removeAllListeners();
  await pool.end();
  server.close(() => {
    logger.info("Backend stopped");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
