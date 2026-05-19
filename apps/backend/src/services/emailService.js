import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

let cachedTransporter = null;

function isSmtpConfigured() {
  return Boolean(env.smtpHost && Number.isFinite(env.smtpPort) && env.smtpPort > 0 && env.smtpFrom);
}

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const transportConfig = {
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: env.smtpUser
      ? {
          user: env.smtpUser,
          pass: env.smtpPassword || ""
        }
      : undefined,
    tls: {
      rejectUnauthorized: env.smtpRejectUnauthorized
    }
  };

  cachedTransporter = nodemailer.createTransport(transportConfig);
  return cachedTransporter;
}

export function getEmailDeliveryStatus() {
  return {
    enabled: env.emailDeliveryEnabled,
    configured: isSmtpConfigured()
  };
}

export function isEmailDeliveryAvailable() {
  const status = getEmailDeliveryStatus();
  return status.enabled && status.configured;
}

export async function sendEmailWithAttachment({ recipients, subject, text, attachment }) {
  if (!isEmailDeliveryAvailable()) {
    throw new Error("Email delivery is not enabled or configured.");
  }

  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: env.smtpFrom,
    to: recipients,
    subject,
    text,
    attachments: [attachment]
  });

  logger.info(
    {
      recipientsCount: recipients.length,
      messageId: info.messageId,
      subject
    },
    "Water quality report email sent"
  );

  return info;
}
