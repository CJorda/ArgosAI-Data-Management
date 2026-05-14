import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { query } from "../database/pool.js";
import { syncSensorHealthAlertsForTenant } from "../routes/alertsRoutes.js";

let timer = null;
let isRunning = false;

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

async function runSchedulerTick() {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const windowHours = clampInteger(env.sensorHealthAlertSyncWindowHours, 24, 4, 168);
    const staleMinutes = clampInteger(env.sensorHealthAlertSyncStaleMinutes, 35, 5, 240);

    const tenantsResult = await query(
      `
        SELECT id
        FROM tenants
        ORDER BY id ASC
      `
    );

    const totals = {
      created: 0,
      updated: 0,
      autoResolved: 0,
      expectedIncidents: 0,
      openManaged: 0
    };

    for (const tenant of tenantsResult.rows) {
      const tenantId = Number(tenant.id);

      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        continue;
      }

      try {
        const payload = await syncSensorHealthAlertsForTenant({
          tenantId,
          actorUserId: null,
          windowHours,
          staleMinutes
        });
        const summary = payload?.summary || {};

        totals.created += Number(summary.created) || 0;
        totals.updated += Number(summary.updated) || 0;
        totals.autoResolved += Number(summary.autoResolved) || 0;
        totals.expectedIncidents += Number(summary.expectedIncidents) || 0;
        totals.openManaged += Number(summary.openManaged) || 0;

        if ((Number(summary.created) || 0) > 0 || (Number(summary.autoResolved) || 0) > 0) {
          logger.info(
            {
              tenantId,
              windowHours,
              staleMinutes,
              summary
            },
            "Sensor health alerts synchronized by scheduler"
          );
        }
      } catch (error) {
        logger.error(
          {
            err: error,
            tenantId,
            windowHours,
            staleMinutes
          },
          "Sensor health alert scheduler failed for tenant"
        );
      }
    }

    if (totals.created > 0 || totals.autoResolved > 0) {
      logger.info(
        {
          windowHours,
          staleMinutes,
          totals
        },
        "Sensor health alert scheduler tick applied changes"
      );
    }
  } catch (error) {
    logger.error({ err: error }, "Sensor health alert scheduler tick failed");
  } finally {
    isRunning = false;
  }
}

export function startSensorHealthAlertSyncScheduler() {
  if (!env.sensorHealthAlertSyncSchedulerEnabled) {
    logger.info("Sensor health alert scheduler disabled by configuration");
    return;
  }

  const pollMs = clampInteger(env.sensorHealthAlertSyncSchedulerPollMs, 300000, 60000, 86400000);

  if (timer) {
    clearInterval(timer);
  }

  runSchedulerTick().catch((error) => {
    logger.error({ err: error }, "Initial sensor health alert scheduler run failed");
  });

  timer = setInterval(() => {
    runSchedulerTick().catch((error) => {
      logger.error({ err: error }, "Sensor health alert scheduler run failed");
    });
  }, pollMs);

  logger.info(
    {
      pollMs,
      windowHours: env.sensorHealthAlertSyncWindowHours,
      staleMinutes: env.sensorHealthAlertSyncStaleMinutes
    },
    "Sensor health alert scheduler started"
  );
}

export function stopSensorHealthAlertSyncScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
