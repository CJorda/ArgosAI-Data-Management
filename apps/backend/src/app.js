import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { runWithRequestDbContext } from "./database/pool.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { alertsRoutes } from "./routes/alertsRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { biomassRoutes } from "./routes/biomassRoutes.js";
import { cameraRoutes } from "./routes/cameraRoutes.js";
import { consolidationRoutes } from "./routes/consolidationRoutes.js";
import { dataRoutes } from "./routes/dataRoutes.js";
import { hatcheryRoutes } from "./routes/hatcheryRoutes.js";
import { operationsRoutes } from "./routes/operationsRoutes.js";
import { planningRoutes } from "./routes/planningRoutes.js";
import { statsRoutes } from "./routes/statsRoutes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.clientOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("CORS origin not allowed"));
      },
      credentials: true
    })
  );
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));
  app.use((_req, _res, next) => {
    runWithRequestDbContext(() => next());
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "argosai-backend",
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/data", dataRoutes);
  app.use("/api/alerts", alertsRoutes);
  app.use("/api/operations", operationsRoutes);
  app.use("/api/biomass", biomassRoutes);
  app.use("/api/planning", planningRoutes);
  app.use("/api/hatchery", hatcheryRoutes);
  app.use("/api/consolidation", consolidationRoutes);
  app.use("/api/cameras", cameraRoutes);
  app.use("/api/stats", statsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
