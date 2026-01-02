import { sql } from "@/lib/db";

export const VERSION = "1.0.33";

const CONFIG_ID = "default";

export async function ensureEmailConfigTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS email_config (
      id text PRIMARY KEY,
      alert_email_to text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

export async function getEmailConfig() {
  await ensureEmailConfigTable();
  const rows = await sql`
    SELECT alert_email_to, updated_at
    FROM email_config
    WHERE id = ${CONFIG_ID}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    alertEmailTo: row.alert_email_to,
    updatedAt: row.updated_at
  };
}

export async function upsertEmailConfig(alertEmailTo) {
  await ensureEmailConfigTable();
  await sql`
    INSERT INTO email_config (id, alert_email_to, updated_at)
    VALUES (${CONFIG_ID}, ${alertEmailTo}, now())
    ON CONFLICT (id) DO UPDATE
    SET alert_email_to = EXCLUDED.alert_email_to,
        updated_at = EXCLUDED.updated_at
  `;
  return getEmailConfig();
}
