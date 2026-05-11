import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

export function requireAuth(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new HttpError(401, "Authorization header is required"));
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.jwtAccessSecret);

    if (payload.type !== "access") {
      return next(new HttpError(401, "Invalid access token"));
    }

    req.user = {
      id: Number(payload.sub),
      tenantId: Number(payload.tenantId),
      tenantCode: payload.tenantCode,
      role: payload.role,
      email: payload.email,
      fullName: payload.fullName,
      features: Array.isArray(payload.features) ? payload.features : null
    };

    return next();
  } catch {
    return next(new HttpError(401, "Invalid or expired token"));
  }
}
