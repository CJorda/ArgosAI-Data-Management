import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      type: "access",
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      fullName: user.fullName
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
  await query(
    `
      INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [tenantId, userId, hashToken(token), expiresAt]
  );
}

export async function findValidRefreshToken(token) {
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
