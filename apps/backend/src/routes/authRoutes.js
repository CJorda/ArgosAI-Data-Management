import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  getDemoUserIdentity,
  getDemoUserResponse,
  isDemoLoginValid
} from "../services/noDbDemoService.js";
import { getTenantEnabledFeatures } from "../services/featureAccessService.js";
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
