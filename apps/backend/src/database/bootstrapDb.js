import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const { Pool } = pg;

function parseConnection() {
  const parsed = new URL(env.databaseUrl);
  const targetDb = parsed.pathname.replace(/^\//, "");

  if (!targetDb) {
    throw new Error("DATABASE_URL must include a database name");
  }

  if (!/^[a-zA-Z0-9_]+$/.test(targetDb)) {
    throw new Error("Database name can only contain letters, numbers and underscore");
  }

  const adminUrl = new URL(env.databaseUrl);
  adminUrl.pathname = "/postgres";

  return {
    targetDb,
    adminUrl: adminUrl.toString()
  };
}

async function bootstrapDb() {
  const { targetDb, adminUrl } = parseConnection();
  const pool = new Pool({ connectionString: adminUrl });

  try {
    const exists = await pool.query(
      `
        SELECT 1
        FROM pg_database
        WHERE datname = $1
      `,
      [targetDb]
    );

    if (exists.rowCount > 0) {
      logger.info({ database: targetDb }, "Database already exists");
      return;
    }

    await pool.query(`CREATE DATABASE "${targetDb}"`);
    logger.info({ database: targetDb }, "Database created");
  } finally {
    await pool.end();
  }
}

bootstrapDb()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error({ err: error }, "Database bootstrap failed");
    process.exit(1);
  });
