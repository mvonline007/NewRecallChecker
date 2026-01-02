import { sql } from "@/lib/db";

export const VERSION = "1.0.46";

const CONFIG_ID = "default";

export async function ensureEmailConfigTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS email_config (
      id text PRIMARY KEY,
      alert_email_to text,
      alert_email_config jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    ALTER TABLE email_config
    ADD COLUMN IF NOT EXISTS alert_email_config jsonb
  `;
  await sql`
    ALTER TABLE email_config
    ADD COLUMN IF NOT EXISTS alert_email_to text
  `;
}

function normalizeDistributeurList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function normalizeRecipientConfigs(raw) {
  if (!raw) return [];
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email) => ({ email, distributeurs: [] }));
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") {
        return { email: entry.trim(), distributeurs: [] };
      }
      const email = typeof entry.email === "string" ? entry.email.trim() : "";
      if (!email) return null;
      const distributeurs = normalizeDistributeurList(entry.distributeurs);
      return { email, distributeurs };
    })
    .filter((entry) => {
      if (!entry?.email) return false;
      const key = entry.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function getEmailConfig() {
  await ensureEmailConfigTable();
  const rows = await sql`
    SELECT alert_email_config, alert_email_to, updated_at
    FROM email_config
    WHERE id = ${CONFIG_ID}
  `;
  const row = rows[0];
  if (!row) return null;
  let recipients = normalizeRecipientConfigs(row.alert_email_config);
  if (recipients.length === 0 && row.alert_email_to) {
    recipients = normalizeRecipientConfigs(row.alert_email_to);
    if (recipients.length > 0) {
      await upsertEmailConfig(recipients);
    }
  }
  return { recipients, updatedAt: row.updated_at };
}

export async function upsertEmailConfig(recipients) {
  const normalized = normalizeRecipientConfigs(recipients);
  const alertEmailTo = normalized.map((entry) => entry.email).join(", ");
  await ensureEmailConfigTable();
  await sql`
    INSERT INTO email_config (id, alert_email_to, alert_email_config, updated_at)
    VALUES (${CONFIG_ID}, ${alertEmailTo}, ${JSON.stringify(normalized)}, now())
    ON CONFLICT (id) DO UPDATE
    SET alert_email_to = EXCLUDED.alert_email_to,
        alert_email_config = EXCLUDED.alert_email_config,
        updated_at = EXCLUDED.updated_at
  `;
  return getEmailConfig();
}
