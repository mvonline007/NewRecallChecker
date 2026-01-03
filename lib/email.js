import nodemailer from "nodemailer";

import { getEmailConfig, normalizeRecipientConfigs } from "@/lib/email-config";

export const VERSION = "1.0.50";

const { GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_EMAIL_TO: ENV_ALERT_EMAIL_TO } = process.env;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  throw new Error("Missing email configuration env vars.");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD
  }
});

async function resolveRecipientConfigs() {
  const dbConfig = await getEmailConfig();
  if (dbConfig?.recipients?.length) {
    return {
      configs: dbConfig.recipients,
      source: "database",
      updatedAt: dbConfig.updatedAt
    };
  }
  const envConfigs = normalizeRecipientConfigs(ENV_ALERT_EMAIL_TO || "");
  if (envConfigs.length) {
    return {
      configs: envConfigs,
      source: "env",
      updatedAt: null
    };
  }
  return {
    configs: [],
    source: "missing",
    updatedAt: null
  };
}

export async function getEmailRecipientConfigs() {
  const resolved = await resolveRecipientConfigs();
  return resolved.configs;
}

export async function getEmailConfigSummary() {
  const resolved = await resolveRecipientConfigs();
  const recipients = resolved.configs.map((entry) => entry.email);
  return {
    service: "gmail",
    user: GMAIL_USER || null,
    recipients,
    recipientConfigs: resolved.configs,
    appPasswordConfigured: Boolean(GMAIL_APP_PASSWORD),
    appPasswordLength: GMAIL_APP_PASSWORD ? GMAIL_APP_PASSWORD.length : 0,
    configSource: resolved.source,
    configuredRecipients: resolved.configs.length ? resolved.configs : null,
    updatedAt: resolved.updatedAt
  };
}

function normalizeFilterList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
}

export function filterItemsByDistributeurs(items, distributeurs) {
  if (!Array.isArray(items)) return [];
  const filters = normalizeFilterList(distributeurs);
  if (filters.length === 0) return items;
  return items.filter((item) => {
    const list = Array.isArray(item?.distributeursList) ? item.distributeursList : [];
    const normalizedList = list.map((entry) => String(entry).trim().toLowerCase());
    const raw = String(item?.distributeursRaw || "").toLowerCase();
    return filters.some(
      (filter) => normalizedList.includes(filter) || (raw && raw.includes(filter))
    );
  });
}

export async function sendAlertEmail({ subject, text, html, recipients }) {
  let resolvedRecipients = Array.isArray(recipients) ? recipients : [];
  if (resolvedRecipients.length === 0) {
    const resolved = await resolveRecipientConfigs();
    resolvedRecipients = resolved.configs.map((entry) => entry.email);
  }
  const normalizedRecipients = resolvedRecipients.map((email) => email.trim()).filter(Boolean);
  if (normalizedRecipients.length === 0) {
    throw new Error("No alert email recipients configured.");
  }

  const info = await transporter.sendMail({
    from: GMAIL_USER,
    to: normalizedRecipients,
    subject,
    text,
    html
  });

  return info.messageId;
}
