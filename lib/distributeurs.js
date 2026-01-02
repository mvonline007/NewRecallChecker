import * as cheerio from "cheerio";

export const VERSION = "1.0.30";

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
  $("dt").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t === "Distributeurs") {
      distributeursRaw = $(el).next("dd").text().replace(/\s+/g, " ").trim();
    }
  });

  const distributeursList = normalizeSplitList(distributeursRaw);

  return { distributeursRaw, distributeursList };
}
