import { neon } from "@neondatabase/serverless";

export const VERSION = "1.0.23";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL environment variable.");
}

export const sql = neon(DATABASE_URL);

export async function ensureSnapshotsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS rss_snapshots (
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      items jsonb NOT NULL
    )
  `;
}

export async function getLatestSnapshot() {
  const rows = await sql`
    SELECT id, created_at, items
    FROM rss_snapshots
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function insertSnapshot({ id, items }) {
  await sql`
    INSERT INTO rss_snapshots (id, items)
    VALUES (${id}, ${JSON.stringify(items)})
  `;
}
