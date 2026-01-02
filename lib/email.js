import nodemailer from "nodemailer";

export const VERSION = "1.0.31";

const { GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_EMAIL_TO } = process.env;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !ALERT_EMAIL_TO) {
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
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export function getEmailConfigSummary() {
  const recipients = ALERT_EMAIL_TO ? parseRecipients(ALERT_EMAIL_TO) : [];
  return {
    service: "gmail",
    user: GMAIL_USER || null,
    recipients,
    appPasswordConfigured: Boolean(GMAIL_APP_PASSWORD),
    appPasswordLength: GMAIL_APP_PASSWORD ? GMAIL_APP_PASSWORD.length : 0
  };
}

export async function sendAlertEmail({ subject, text, html }) {
  const recipients = parseRecipients(ALERT_EMAIL_TO);
  if (recipients.length === 0) {
    throw new Error("ALERT_EMAIL_TO must include at least one recipient.");
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
