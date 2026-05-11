import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { query, withDbClient } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  getDemoUserIdentity,
  getDemoUserResponse,
  isDemoLoginValid
} from "../services/noDbDemoService.js";
import {
  clearTenantFeatureCache,
  getTenantEnabledFeatures
} from "../services/featureAccessService.js";
import { ALL_FEATURE_KEYS, isKnownFeature } from "../security/featureCatalog.js";
import {
  decodeRefreshToken,
  findValidRefreshToken,
  persistRefreshToken,
  revokeRefreshToken,
  signAccessToken,
  signRefreshToken
} from "../services/tokenService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const loginSchema = z.object({
  tenantCode: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

const tenantCodeParamsSchema = z.object({
  tenantCode: z.string().min(2).max(64)
});

const featureKeySchema = z
  .string()
  .min(1)
  .max(80)
  .transform((value) => String(value).trim().toLowerCase())
  .refine((value) => isKnownFeature(value), {
    message: "Unknown feature key"
  });

const updateTenantViewsSchema = z.object({
  views: z.array(featureKeySchema).max(ALL_FEATURE_KEYS.length)
});

function normalizeTenantCode(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeViews(views) {
  return Array.from(new Set((views || []).map((item) => String(item).trim().toLowerCase())));
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function ensureCanManageTenant(req, tenantCode) {
  const normalizedRole = normalizeRole(req.user?.role);
  const normalizedTargetCode = normalizeTenantCode(tenantCode);
  const normalizedOwnCode = normalizeTenantCode(req.user?.tenantCode);

  if (normalizedRole === "superadmin" || normalizedRole === "super_admin") {
    return;
  }

  if (normalizedRole !== "admin") {
    throw new HttpError(403, "Admin role is required to manage tenant views");
  }

  if (normalizedOwnCode !== normalizedTargetCode) {
    throw new HttpError(403, "You can only manage views for your own tenant");
  }
}

async function findTenantByCode(tenantCode) {
  const normalizedCode = normalizeTenantCode(tenantCode);

  const result = await query(
    `
      SELECT id, code, name
      FROM tenants
      WHERE LOWER(code) = $1
      LIMIT 1
    `,
    [normalizedCode]
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, "Tenant not found");
  }

  return {
    id: Number(result.rows[0].id),
    code: normalizeTenantCode(result.rows[0].code),
    name: result.rows[0].name
  };
}

async function replaceTenantViews(tenantId, views) {
  await withDbClient(async (client) => {
    try {
      await client.query("BEGIN");

      await client.query(
        `
          CREATE TABLE IF NOT EXISTS tenant_features (
            id BIGSERIAL PRIMARY KEY,
            tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            feature_key TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (tenant_id, feature_key)
          )
        `
      );

      await client.query(
        `
          DELETE FROM tenant_features
          WHERE tenant_id = $1
        `,
        [tenantId]
      );

      if (views.length > 0) {
        await client.query(
          `
            INSERT INTO tenant_features (tenant_id, feature_key, enabled, created_at, updated_at)
            SELECT $1, feature_key, TRUE, NOW(), NOW()
            FROM UNNEST($2::text[]) AS feature_key
          `,
          [tenantId, views]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function tenantFeaturesResponse(tenant) {
  const views = await getTenantEnabledFeatures({
    tenantId: tenant.id,
    tenantCode: tenant.code
  });

  return {
    tenant: {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name || null
    },
    strictMode: env.tenantFeaturesStrictMode,
    availableViews: [...ALL_FEATURE_KEYS],
    views
  };
}

export const authRoutes = Router();

authRoutes.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { tenantCode, email, password } = req.body;

    if (env.noPostgresMode) {
      if (!isDemoLoginValid({ tenantCode, email, password })) {
        throw new HttpError(401, "Invalid credentials");
      }

      const user = getDemoUserIdentity();
      const accessToken = signAccessToken(user);
      const { token: refreshToken } = signRefreshToken(user);
      const refreshPayload = decodeRefreshToken(refreshToken);

      await persistRefreshToken(
        refreshToken,
        user.id,
        user.tenantId,
        new Date(refreshPayload.exp * 1000)
      );

      res.json({
        accessToken,
        refreshToken,
        user: getDemoUserResponse()
      });
      return;
    }

    const userResult = await query(
      `
        SELECT
          u.id,
          u.tenant_id,
          u.full_name,
          u.email,
          u.role,
          u.password_hash,
          t.code AS tenant_code,
          t.name AS tenant_name
        FROM users u
        JOIN tenants t ON t.id = u.tenant_id
        WHERE t.code = $1
          AND u.email = $2
        LIMIT 1
      `,
      [tenantCode, email]
    );

    if (userResult.rowCount === 0) {
      throw new HttpError(401, "Invalid credentials");
    }

    const userRow = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, userRow.password_hash);

    if (!isMatch) {
      throw new HttpError(401, "Invalid credentials");
    }

    const user = {
      id: Number(userRow.id),
      tenantId: Number(userRow.tenant_id),
      tenantCode: String(userRow.tenant_code || "").trim().toLowerCase(),
      fullName: userRow.full_name,
      email: userRow.email,
      role: userRow.role,
      features: await getTenantEnabledFeatures({
        tenantId: userRow.tenant_id,
        tenantCode: userRow.tenant_code
      })
    };

    const accessToken = signAccessToken(user);
    const { token: refreshToken } = signRefreshToken(user);
    const refreshPayload = decodeRefreshToken(refreshToken);

    await persistRefreshToken(
      refreshToken,
      user.id,
      user.tenantId,
      new Date(refreshPayload.exp * 1000)
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        features: user.features,
        tenant: {
          code: userRow.tenant_code,
          name: userRow.tenant_name
        }
      }
    });
  })
);

authRoutes.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    let payload;

    try {
      payload = decodeRefreshToken(refreshToken);
    } catch {
      throw new HttpError(401, "Invalid refresh token");
    }

    const persisted = await findValidRefreshToken(refreshToken);

    if (!persisted) {
      throw new HttpError(401, "Refresh token is not valid anymore");
    }

    if (
      Number(payload.sub) !== Number(persisted.user_id) ||
      Number(payload.tenantId) !== Number(persisted.tenant_id)
    ) {
      throw new HttpError(401, "Refresh token mismatch");
    }

    if (env.noPostgresMode) {
      const demoUser = getDemoUserIdentity();

      if (
        Number(payload.sub) !== Number(demoUser.id) ||
        Number(payload.tenantId) !== Number(demoUser.tenantId)
      ) {
        throw new HttpError(401, "User not found for refresh token");
      }

      await revokeRefreshToken(refreshToken);

      const newAccessToken = signAccessToken(demoUser);
      const { token: newRefreshToken } = signRefreshToken(demoUser);
      const newPayload = decodeRefreshToken(newRefreshToken);

      await persistRefreshToken(
        newRefreshToken,
        demoUser.id,
        demoUser.tenantId,
        new Date(newPayload.exp * 1000)
      );

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      });
      return;
    }

    const userResult = await query(
      `
        SELECT
          u.id,
          u.tenant_id,
          u.full_name,
          u.email,
          u.role,
          t.code AS tenant_code
        FROM users u
        JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = $1
          AND u.tenant_id = $2
        LIMIT 1
      `,
      [persisted.user_id, persisted.tenant_id]
    );

    if (userResult.rowCount === 0) {
      throw new HttpError(401, "User not found for refresh token");
    }

    await revokeRefreshToken(refreshToken);

    const userRow = userResult.rows[0];

    const user = {
      id: Number(userRow.id),
      tenantId: Number(userRow.tenant_id),
      tenantCode: String(userRow.tenant_code || "").trim().toLowerCase(),
      fullName: userRow.full_name,
      email: userRow.email,
      role: userRow.role,
      features: await getTenantEnabledFeatures({
        tenantId: userRow.tenant_id,
        tenantCode: userRow.tenant_code
      })
    };

    const newAccessToken = signAccessToken(user);
    const { token: newRefreshToken } = signRefreshToken(user);
    const newPayload = decodeRefreshToken(newRefreshToken);

    await persistRefreshToken(
      newRefreshToken,
      user.id,
      user.tenantId,
      new Date(newPayload.exp * 1000)
    );

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  })
);

authRoutes.post(
  "/logout",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    await revokeRefreshToken(refreshToken);
    res.status(204).send();
  })
);

authRoutes.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (env.noPostgresMode) {
      res.json(getDemoUserResponse());
      return;
    }

    const userResult = await query(
      `
        SELECT
          u.id,
          u.tenant_id,
          u.full_name,
          u.email,
          u.role,
          t.code AS tenant_code,
          t.name AS tenant_name
        FROM users u
        JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = $1
          AND u.tenant_id = $2
        LIMIT 1
      `,
      [req.user.id, req.user.tenantId]
    );

    if (userResult.rowCount === 0) {
      throw new HttpError(404, "User not found");
    }

    const user = userResult.rows[0];
    const features = await getTenantEnabledFeatures({
      tenantId: user.tenant_id,
      tenantCode: user.tenant_code
    });

    res.json({
      id: user.id,
      tenantId: user.tenant_id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      features,
      tenant: {
        code: user.tenant_code,
        name: user.tenant_name
      }
    });
  })
);

authRoutes.get(
  "/tenant/features",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!env.noPostgresMode) {
      const tenantResult = await query(
        `
          SELECT id, code, name
          FROM tenants
          WHERE id = $1
          LIMIT 1
        `,
        [req.user.tenantId]
      );

      if (tenantResult.rowCount === 0) {
        throw new HttpError(404, "Tenant not found");
      }

      const tenant = {
        id: Number(tenantResult.rows[0].id),
        code: normalizeTenantCode(tenantResult.rows[0].code),
        name: tenantResult.rows[0].name
      };

      res.json(await tenantFeaturesResponse(tenant));
      return;
    }

    const tenant = {
      id: Number(req.user.tenantId),
      code: normalizeTenantCode(req.user.tenantCode || env.demoTenantCode),
      name: env.demoTenantName
    };

    res.json(await tenantFeaturesResponse(tenant));
  })
);

authRoutes.put(
  "/tenant/features",
  requireAuth,
  validate(updateTenantViewsSchema),
  asyncHandler(async (req, res) => {
    ensureCanManageTenant(req, req.user.tenantCode);

    if (env.noPostgresMode) {
      throw new HttpError(400, "Tenant view management requires PostgreSQL mode");
    }

    const normalizedViews = normalizeViews(req.body.views);
    await replaceTenantViews(req.user.tenantId, normalizedViews);
    clearTenantFeatureCache(req.user.tenantId);

    const updated = await tenantFeaturesResponse({
      id: req.user.tenantId,
      code: req.user.tenantCode,
      name: null
    });

    const nextAccessToken = signAccessToken({
      id: req.user.id,
      tenantId: req.user.tenantId,
      tenantCode: req.user.tenantCode,
      role: req.user.role,
      email: req.user.email,
      fullName: req.user.fullName,
      features: updated.views
    });

    res.json({
      ...updated,
      accessToken: nextAccessToken
    });
  })
);

authRoutes.get(
  "/tenants/:tenantCode/features",
  requireAuth,
  validate(tenantCodeParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const targetCode = normalizeTenantCode(req.params.tenantCode);
    ensureCanManageTenant(req, targetCode);

    if (env.noPostgresMode) {
      const demoCode = normalizeTenantCode(env.demoTenantCode);

      if (targetCode !== demoCode) {
        throw new HttpError(404, "Tenant not found");
      }

      res.json(
        await tenantFeaturesResponse({
          id: Number(req.user.tenantId),
          code: demoCode,
          name: env.demoTenantName
        })
      );
      return;
    }

    const tenant = await findTenantByCode(targetCode);
    res.json(await tenantFeaturesResponse(tenant));
  })
);

authRoutes.put(
  "/tenants/:tenantCode/features",
  requireAuth,
  validate(tenantCodeParamsSchema, "params"),
  validate(updateTenantViewsSchema),
  asyncHandler(async (req, res) => {
    const targetCode = normalizeTenantCode(req.params.tenantCode);
    ensureCanManageTenant(req, targetCode);

    if (env.noPostgresMode) {
      throw new HttpError(400, "Tenant view management requires PostgreSQL mode");
    }

    const tenant = await findTenantByCode(targetCode);
    const normalizedViews = normalizeViews(req.body.views);
    await replaceTenantViews(tenant.id, normalizedViews);
    clearTenantFeatureCache(tenant.id);

    const updated = await tenantFeaturesResponse(tenant);
    const response = {
      ...updated
    };

    if (Number(tenant.id) === Number(req.user.tenantId)) {
      response.accessToken = signAccessToken({
        id: req.user.id,
        tenantId: req.user.tenantId,
        tenantCode: req.user.tenantCode,
        role: req.user.role,
        email: req.user.email,
        fullName: req.user.fullName,
        features: updated.views
      });
    }

    res.json(response);
  })
);
