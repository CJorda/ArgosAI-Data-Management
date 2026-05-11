import dotenv from "dotenv";

dotenv.config();

const rawClientOrigins =
  process.env.CLIENT_ORIGIN || "http://localhost:5173,http://localhost:5174";
const clientOrigins = rawClientOrigins
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const schedulerFrequencyRaw = String(
  process.env.EXECUTIVE_REPORT_SCHEDULER_FREQUENCY || "daily"
).toLowerCase();
const schedulerFrequency = schedulerFrequencyRaw === "weekly" ? "weekly" : "daily";

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
  cameraDefaultProtocol: process.env.CAMERA_DEFAULT_PROTOCOL || "webrtc",
  executiveReportSchedulerEnabled:
    String(process.env.EXECUTIVE_REPORT_SCHEDULER_ENABLED || "true") === "true",
  executiveReportSchedulerFrequency: schedulerFrequency,
  executiveReportSchedulerHourUtc: Number(process.env.EXECUTIVE_REPORT_SCHEDULER_HOUR_UTC || 6),
  executiveReportSchedulerMinuteUtc: Number(process.env.EXECUTIVE_REPORT_SCHEDULER_MINUTE_UTC || 0),
  executiveReportSchedulerPollMs: Number(process.env.EXECUTIVE_REPORT_SCHEDULER_POLL_MS || 300000),
  executiveReportSchedulerLookbackDays: Number(
    process.env.EXECUTIVE_REPORT_SCHEDULER_LOOKBACK_DAYS || 14
  )
};
