import * as cheerio from "cheerio";

export const runtime = "nodejs";

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

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";

  if (!isAllowedUrl(url)) {
    return Response.json({ error: "Invalid or disallowed url" }, { status: 400 });
  }

  const res = await fetch(url, {
    headers: { Accept: "text/html, */*" },
    cache: "no-store"
  });

  if (!res.ok) {
    return Response.json({ error: `detail HTTP ${res.status}` }, { status: 502 });
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  let distributeursRaw = "";
  $("dt").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t === "Distributeurs") {
      distributeursRaw = $(el).next("dd").text().replace(/\s+/g, " ").trim();
    }
  });

  const distributeursList = normalizeSplitList(distributeursRaw);

  return Response.json({ distributeursRaw, distributeursList }, { status: 200 });
}
