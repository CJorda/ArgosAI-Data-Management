import dotenv from "dotenv";

dotenv.config();

const rawClientOrigins =
  process.env.CLIENT_ORIGIN || "http://localhost:5173,http://localhost:5174";
const clientOrigins = rawClientOrigins
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3001),
  clientOrigins,
  databaseUrl: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/argosai",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev_access_secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev_refresh_secret",
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || "7d",
  simulatorEnabled: String(process.env.SIMULATOR_ENABLED || "true") === "true",
  simulatorIntervalMs: Number(process.env.SIMULATOR_INTERVAL_MS || 5000),
  cameraDefaultProtocol: process.env.CAMERA_DEFAULT_PROTOCOL || "webrtc"
};
