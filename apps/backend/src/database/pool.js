import { AsyncLocalStorage } from "async_hooks";
import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;
const requestDbContext = new AsyncLocalStorage();

function normalizeTenantId(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.trunc(numeric);
}

function getEffectiveRlsContext() {
  const store = requestDbContext.getStore();

  if (!store) {
    return {
      tenantId: null,
      bypassRls: true
    };
  }

  return {
    tenantId: normalizeTenantId(store.tenantId),
    bypassRls: Boolean(store.bypassRls)
  };
}

async function applyRlsContext(client) {
  const { tenantId, bypassRls } = getEffectiveRlsContext();

  await client.query(
    `
      SELECT
        set_config('app.tenant_id', $1, FALSE),
        set_config('app.rls_bypass', $2, FALSE)
    `,
    [tenantId ? String(tenantId) : "", bypassRls ? "on" : "off"]
  );
}

async function queryWithRlsContext(client, text, params = []) {
  await applyRlsContext(client);
  return client.query(text, params);
}

export const pool = new Pool({
  connectionString: env.databaseUrl
});

export function runWithRequestDbContext(callback) {
  return requestDbContext.run(
    {
      tenantId: null,
      bypassRls: false
    },
    callback
  );
}

export function setRequestTenantId(tenantId) {
  const store = requestDbContext.getStore();

  if (!store) {
    return;
  }

  store.tenantId = normalizeTenantId(tenantId);
}

export function setRequestRlsBypass(enabled) {
  const store = requestDbContext.getStore();

  if (!store) {
    return;
  }

  store.bypassRls = Boolean(enabled);
}

export async function withDbClient(callback) {
  const client = await pool.connect();
  const scopedClient = {
    query: (text, params = []) => queryWithRlsContext(client, text, params)
  };

  try {
    return await callback(scopedClient);
  } finally {
    client.release();
  }
}

export async function query(text, params = []) {
  const client = await pool.connect();

  try {
    return await queryWithRlsContext(client, text, params);
  } finally {
    client.release();
  }
}
