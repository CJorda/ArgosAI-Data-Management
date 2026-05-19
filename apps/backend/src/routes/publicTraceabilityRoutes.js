import { createHash, timingSafeEqual } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { query } from "../database/pool.js";
import { getDemoTraceabilityCertificate } from "../services/noDbDemoService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

const verifyParamsSchema = z.object({
  publicId: z.string().uuid()
});

function stableStringify(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  const mapped = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${mapped.join(",")}}`;
}

function signatureMatches(expected, provided) {
  if (!expected || !provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(String(expected), "hex");
  const providedBuffer = Buffer.from(String(provided), "hex");

  if (expectedBuffer.length === 0 || providedBuffer.length === 0) {
    return false;
  }

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export const publicTraceabilityRoutes = Router();

publicTraceabilityRoutes.get(
  "/traceability/verify/:publicId",
  asyncHandler(async (req, res) => {
    const parseResult = verifyParamsSchema.safeParse(req.params);
    if (!parseResult.success) {
      throw new HttpError(400, "Invalid certificate id");
    }

    const providedSignature = String(req.query.sig || "").trim();
    if (!providedSignature) {
      throw new HttpError(400, "Missing signature");
    }

    const { publicId } = parseResult.data;

    let certificate = null;

    if (env.noPostgresMode) {
      certificate = getDemoTraceabilityCertificate(publicId);
    } else {
      const certificateResult = await query(
        `
          SELECT
            public_id,
            lot_code,
            payload,
            payload_hash,
            verification_signature,
            status,
            created_at,
            revoked_at,
            replaced_by_public_id
          FROM traceability_certificates
          WHERE public_id = $1
          LIMIT 1
        `,
        [publicId]
      );

      certificate = certificateResult.rowCount > 0 ? certificateResult.rows[0] : null;
    }

    if (!certificate) {
      throw new HttpError(404, "Certificate not found");
    }
    const signatureValid = signatureMatches(certificate.verification_signature, providedSignature);

    if (!signatureValid) {
      throw new HttpError(401, "Invalid signature");
    }

    const canonicalPayload = stableStringify(certificate.payload || {});
    const recomputedHash = createHash("sha256").update(canonicalPayload).digest("hex");
    const integrityValid = recomputedHash === certificate.payload_hash;

    res.json({
      certificate: {
        publicId: certificate.public_id,
        lotCode: certificate.lot_code,
        status: certificate.status,
        createdAt: certificate.created_at,
        revokedAt: certificate.revoked_at,
        replacedByPublicId: certificate.replaced_by_public_id,
        payload: certificate.payload
      },
      verification: {
        signatureValid,
        integrityValid,
        verifiedAt: new Date().toISOString()
      }
    });
  })
);
