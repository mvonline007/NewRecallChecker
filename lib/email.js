import nodemailer from "nodemailer";

import { getEmailConfig } from "@/lib/email-config";

export const VERSION = "1.0.33";

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

function parseRecipients(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

async function resolveAlertEmailTo() {
  const dbConfig = await getEmailConfig();
  return dbConfig?.alertEmailTo || ENV_ALERT_EMAIL_TO || "";
}

export async function getEmailConfigSummary() {
  const dbConfig = await getEmailConfig();
  const resolved = dbConfig?.alertEmailTo || ENV_ALERT_EMAIL_TO || "";
  const recipients = parseRecipients(resolved);
  return {
    service: "gmail",
    user: GMAIL_USER || null,
    recipients,
    appPasswordConfigured: Boolean(GMAIL_APP_PASSWORD),
    appPasswordLength: GMAIL_APP_PASSWORD ? GMAIL_APP_PASSWORD.length : 0,
    configSource: dbConfig?.alertEmailTo ? "database" : ENV_ALERT_EMAIL_TO ? "env" : "missing",
    configuredAlertEmailTo: dbConfig?.alertEmailTo || null,
    updatedAt: dbConfig?.updatedAt || null
  };
}

export async function sendAlertEmail({ subject, text, html }) {
  const rawRecipients = await resolveAlertEmailTo();
  const recipients = parseRecipients(rawRecipients);
  if (recipients.length === 0) {
    throw new Error("No alert email recipients configured.");
  }

  const info = await transporter.sendMail({
    from: GMAIL_USER,
    to: recipients,
    subject,
    text,
    html
  });

  return info.messageId;
}
