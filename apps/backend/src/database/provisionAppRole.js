import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const { Pool } = pg;

function parseDatabaseName(connectionString) {
  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "").trim();

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name");
  }

  return databaseName;
}

function validateRoleName(roleName) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(roleName)) {
    throw new Error("DB_APP_ROLE must match ^[A-Za-z_][A-Za-z0-9_]*$");
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildDatabaseUrlTemplate(connectionString, roleName) {
  const parsed = new URL(connectionString);

  parsed.username = roleName;
  parsed.password = "<DB_APP_PASSWORD>";

  return parsed.toString();
}

async function provisionAppRole() {
  if (env.noPostgresMode) {
    throw new Error("Cannot provision DB role while NO_POSTGRES mode is enabled");
  }

  const roleName = String(env.dbAppRole || "").trim();
  validateRoleName(roleName);

  if (!env.dbAppPassword) {
    throw new Error("DB_APP_PASSWORD is required to provision the app role");
  }

  const databaseName = parseDatabaseName(env.databaseUrl);
  const adminConnectionString = env.dbAdminUrl || env.databaseUrl;
  const roleIdentifier = quoteIdentifier(roleName);
  const databaseIdentifier = quoteIdentifier(databaseName);
  const roleLiteral = quoteLiteral(roleName);
  const rolePasswordLiteral = quoteLiteral(env.dbAppPassword);

  const pool = new Pool({ connectionString: adminConnectionString });

  try {
    await pool.query("BEGIN");

    await pool.query(
      `
        SELECT pg_advisory_xact_lock(hashtext('argosai:provision_app_role'))
      `
    );

    await pool.query(
      `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_roles
            WHERE rolname = ${roleLiteral}
          ) THEN
            CREATE ROLE ${roleIdentifier}
              LOGIN
              PASSWORD ${rolePasswordLiteral}
              NOSUPERUSER
              NOCREATEDB
              NOCREATEROLE
              NOINHERIT
              NOREPLICATION
              NOBYPASSRLS;
          ELSE
            ALTER ROLE ${roleIdentifier}
              LOGIN
              PASSWORD ${rolePasswordLiteral}
              NOSUPERUSER
              NOCREATEDB
              NOCREATEROLE
              NOINHERIT
              NOREPLICATION
              NOBYPASSRLS;
          END IF;
        END
        $$;
      `
    );

    await pool.query(`GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${roleIdentifier}`);
    await pool.query("CREATE SCHEMA IF NOT EXISTS app");

    await pool.query(`GRANT USAGE ON SCHEMA public TO ${roleIdentifier}`);
    await pool.query(`GRANT USAGE ON SCHEMA app TO ${roleIdentifier}`);

    await pool.query(
      `
        GRANT SELECT, INSERT, UPDATE, DELETE
        ON ALL TABLES IN SCHEMA public
        TO ${roleIdentifier}
      `
    );

    await pool.query(
      `
        GRANT USAGE, SELECT, UPDATE
        ON ALL SEQUENCES IN SCHEMA public
        TO ${roleIdentifier}
      `
    );

    await pool.query(
      `
        GRANT EXECUTE
        ON ALL FUNCTIONS IN SCHEMA app
        TO ${roleIdentifier}
      `
    );

    await pool.query(
      `
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
        TO ${roleIdentifier}
      `
    );

    await pool.query(
      `
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT, UPDATE ON SEQUENCES
        TO ${roleIdentifier}
      `
    );

    await pool.query(
      `
        ALTER DEFAULT PRIVILEGES IN SCHEMA app
        GRANT EXECUTE ON FUNCTIONS
        TO ${roleIdentifier}
      `
    );

    await pool.query("COMMIT");

    logger.info(
      {
        role: roleName,
        database: databaseName,
        databaseUrlTemplate: buildDatabaseUrlTemplate(env.databaseUrl, roleName)
      },
      "App role provisioned without BYPASSRLS"
    );

    logger.info(
      "Set DATABASE_URL with the app role and enable ENFORCE_RLS_SAFE_ROLE=true for production"
    );
  } catch (error) {
    try {
      await pool.query("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }

    throw error;
  } finally {
    await pool.end();
  }
}

provisionAppRole()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, "Failed to provision app role");
    process.exit(1);
  });
