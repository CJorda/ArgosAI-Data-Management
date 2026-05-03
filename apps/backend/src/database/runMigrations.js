import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../config/logger.js";
import { pool, query } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = await fs.readFile(schemaPath, "utf8");

  await query(sql);
  logger.info("Database schema is up to date");
}

runMigrations()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error({ err: error }, "Failed to run migrations");
    await pool.end();
    process.exit(1);
  });
