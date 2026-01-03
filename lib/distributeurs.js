import * as cheerio from "cheerio";

import { sql } from "@/lib/db";

export const VERSION = "1.0.78";

export async function ensureDistributeursTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS distributeurs (
      name text PRIMARY KEY,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

export async function upsertDistributeurs(names) {
  if (!Array.isArray(names) || names.length === 0) return;
  await ensureDistributeursTable();
  await Promise.all(
    names.map((name) =>
      sql`
        INSERT INTO distributeurs (name, updated_at)
        VALUES (${name}, now())
        ON CONFLICT (name) DO UPDATE
        SET updated_at = EXCLUDED.updated_at
      `
    )
  );
}

export async function listDistributeurs() {
  await ensureDistributeursTable();
  const rows = await sql`
    SELECT name
    FROM distributeurs
    ORDER BY name ASC
  `;
  return rows.map((row) => row.name).filter(Boolean);
}

function normalizeSplitList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[;\n\r,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && x.hostname === "rappel.conso.gouv.fr";
  } catch {
    return false;
  }
}

export async function fetchDistributeurInfo(url) {
  if (!isAllowedUrl(url)) {
    throw new Error("Invalid or disallowed url");
  }

  const res = await fetch(url, {
    headers: { Accept: "text/html, */*" },
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`detail HTTP ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  let distributeursRaw = "";
  let motifRaw = "";
  $("dt").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t === "Distributeurs") {
      distributeursRaw = $(el).next("dd").text().replace(/\s+/g, " ").trim();
    }
    if (t === "Motif du rappel") {
      motifRaw = $(el).next("dd").text().replace(/\s+/g, " ").trim();
    }
  });

  const distributeursList = normalizeSplitList(distributeursRaw);
  if (distributeursList.length) {
    await upsertDistributeurs(distributeursList);
  }

  return { distributeursRaw, distributeursList, motifRaw };
}
