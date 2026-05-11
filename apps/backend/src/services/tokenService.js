import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";

const memoryRefreshTokens = new Map();

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function signAccessToken(user) {
  const features = Array.isArray(user.features)
    ? Array.from(new Set(user.features.map((item) => String(item).trim()).filter(Boolean)))
    : undefined;
  const tenantCode = String(user.tenantCode || "").trim().toLowerCase() || undefined;

  return jwt.sign(
    {
      type: "access",
      tenantId: user.tenantId,
      tenantCode,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      features
    },
    env.jwtAccessSecret,
    {
      subject: String(user.id),
      expiresIn: env.jwtAccessTtl
    }
  );
}

export function signRefreshToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    {
      type: "refresh",
      tenantId: user.tenantId,
      role: user.role,
      jti
    },
    env.jwtRefreshSecret,
    {
      subject: String(user.id),
      expiresIn: env.jwtRefreshTtl
    }
  );

  return { token, jti };
}

export async function persistRefreshToken(token, userId, tenantId, expiresAt) {
  if (env.noPostgresMode) {
    memoryRefreshTokens.set(hashToken(token), {
      tenant_id: Number(tenantId),
      user_id: Number(userId),
      expires_at: new Date(expiresAt).toISOString(),
      revoked_at: null
    });
    return;
  }

  await query(
    `
      INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [tenantId, userId, hashToken(token), expiresAt]
  );
}

export async function findValidRefreshToken(token) {
  if (env.noPostgresMode) {
    const row = memoryRefreshTokens.get(hashToken(token));

    if (!row) {
      return null;
    }

    if (row.revoked_at) {
      return null;
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }

    return {
      id: hashToken(token),
      tenant_id: row.tenant_id,
      user_id: row.user_id
    };
  }

  const result = await query(
    `
      SELECT rt.id, rt.tenant_id, rt.user_id
      FROM refresh_tokens rt
      WHERE rt.token_hash = $1
        AND rt.revoked_at IS NULL
        AND rt.expires_at > NOW()
      LIMIT 1
    `,
    [hashToken(token)]
  );

  return result.rows[0] || null;
}

export async function revokeRefreshToken(token) {
  if (env.noPostgresMode) {
    const key = hashToken(token);
    const row = memoryRefreshTokens.get(key);

    if (row) {
      memoryRefreshTokens.set(key, {
        ...row,
        revoked_at: new Date().toISOString()
      });
    }

    return;
  }

  await query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL
    `,
    [hashToken(token)]
  );
}

export function decodeRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}
