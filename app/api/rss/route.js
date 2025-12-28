import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";

const FEED_URL = "https://rappel.conso.gouv.fr/rss?categorie=01";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function normalizeItems(channel) {
  const rawItems = channel?.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];

  const items = rawItems.map((it, idx) => {
    const title = (it.title ?? "").toString().trim();
    const link = (it.link ?? "").toString().trim();

    const guid = (it.guid?.["#text"] ?? it.guid ?? "").toString().trim() || link || `${idx}`;

    const pubDate = (it.pubDate ?? "").toString().trim();
    const pubDateTs = (() => {
      const t = new Date(pubDate).getTime();
      return Number.isNaN(t) ? 0 : t;
    })();

    const descHtml = (it.description ?? "").toString();

    const enclosureUrl =
      it.enclosure?.["@_url"] ||
      it["media:content"]?.["@_url"] ||
      it.content?.["@_url"] ||
      "";

    return {
      id: guid,
      title,
      link,
      pubDate,
      pubDateISO: toISODate(pubDate),
      pubDateTs,
      descriptionHtml: descHtml,
      enclosureUrl
    };
  });

  items.sort((a, b) => (b.pubDateTs || 0) - (a.pubDateTs || 0));
  return items;
}

export async function GET() {
  const res = await fetch(FEED_URL, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
    cache: "no-store"
  });

  if (!res.ok) {
    return Response.json({ error: `HTTP ${res.status} (${res.statusText})` }, { status: 502 });
  }

  const xmlText = await res.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    allowBooleanAttributes: true,
    trimValues: true
  });

  let json;
  try {
    json = parser.parse(xmlText);
  } catch {
    return Response.json({ error: "RSS parse error" }, { status: 502 });
  }

  const channel = json?.rss?.channel ?? json?.feed ?? null;
  const items = normalizeItems(channel);

  return Response.json({ items }, { status: 200 });
}
